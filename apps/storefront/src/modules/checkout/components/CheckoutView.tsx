'use client';

import type { CreateOrderResponse, SavedAddress } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Alert, Badge, Button, buttonVariants, cn } from '@pk/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Clock, Loader2, Lock, RefreshCcw, ShoppingBag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { isApiError } from '@/lib/api-client';
import { readLastPincode } from '@/lib/last-pincode';
import { markOrderPaid, rememberOrderPhone } from '@/lib/order-session';
import { isValidPincode } from '@/lib/pincode';
import { formatMmSs, useCountdown } from '@/lib/use-countdown';
import { openSignIn, useSession } from '@/modules/account';
import { openCart, useCartQuote, useCartStore } from '@/modules/cart';
import { usePincodeCheck } from '@/modules/catalog';
import { checkoutApi } from '../api/checkoutApi';
import { usePincodeLocality, useSavedAddresses } from '../hooks/useCheckoutData';
import { usePayment, type PaymentSession } from '../hooks/usePayment';
import { attemptKeyFor, cartSignature, clearAttemptKey, renewAttemptKey } from '../lib/attempt-key';
import {
  EMPTY_FORM,
  FIELD_ORDER,
  fieldId,
  mapServerIssues,
  toCreateOrderRequest,
  validateCheckout,
  type CheckoutFormValues,
  type FieldErrors,
} from '../lib/checkout-form';
import { AddressSection } from './AddressSection';
import { CheckoutSkeleton } from './CheckoutSkeleton';
import { ConsentSection } from './ConsentSection';
import { ContactSection } from './ContactSection';
import { OrderSummary } from './OrderSummary';
import { PaymentHost } from './PaymentHost';
import { ReservationTimer } from './ReservationTimer';
import { TrustPanel } from './TrustPanel';

/**
 * /checkout (Phase 5 §5.4): single screen, prepaid only (D-25). Shell: waits for the persisted cart
 * (skeleton), shows the empty state, or mounts the flow. Mounting the flow only after hydration lets
 * it read browser storage (last pincode) in its initial state without a hydration mismatch.
 */
export function CheckoutView() {
  const hydrated = useCartStore((s) => s.hydrated);
  const count = useCartStore((s) => s.items.length);
  const clearCart = useCartStore((s) => s.clear);
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  // Clear the cart only once we're leaving, so the page never flashes "Your cart is empty"
  useEffect(() => {
    if (leavingTo) clearCart();
  }, [leavingTo, clearCart]);

  if (leavingTo) {
    return (
      <PageFrame>
        <div role="status" className="grid justify-items-center gap-3 py-24 text-center">
          <Loader2 aria-hidden="true" className="size-8 animate-spin text-accent-foreground" />
          <p className="font-serif text-2xl text-foreground">Taking you to your order…</p>
          <p className="text-muted-foreground tabular-nums">{leavingTo}</p>
        </div>
      </PageFrame>
    );
  }
  if (!hydrated) return <CheckoutSkeleton />;
  if (count === 0) {
    return (
      <PageFrame>
        <StateMessage
          icon={<ShoppingBag />}
          title="Your cart is empty"
          description="Small batches sell out fast — pick a jar or two from this season's batch, then come back here to pay."
          action={
            <Link href="/products" className={buttonVariants()}>
              Shop pickles
            </Link>
          }
        />
      </PageFrame>
    );
  }
  return <CheckoutFlow onLeave={setLeavingTo} />;
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-8">{children}</div>;
}

interface Attempt {
  order: CreateOrderResponse;
  /** The cart this order was reserved for; a different cart makes the attempt stale. */
  cart: string;
  /** Idempotency-Key that created it — also the ownership proof for /checkout/abandon. */
  key: string;
}

type Problem = { title: string; body?: string; retry?: boolean; tone?: 'destructive' | 'warning' };

const toSession = (o: CreateOrderResponse): PaymentSession => ({
  orderCode: o.orderCode,
  razorpayOrderId: o.razorpayOrderId,
  keyId: o.keyId,
  gateway: o.gateway,
  amountPaise: o.amountPaise,
  expiresAt: o.expiresAt,
  prefill: o.prefill,
});

function focusField(errors: FieldErrors) {
  const first = FIELD_ORDER.find((k) => errors[k]);
  if (!first) return;
  const el = document.getElementById(fieldId(first));
  el?.focus();
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function CheckoutFlow({ onLeave }: { onLeave: (orderCode: string) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.remove);
  const sessionQuery = useSession();
  const signedIn = !!sessionQuery.data;

  const [values, setValues] = useState<CheckoutFormValues>(() => ({ ...EMPTY_FORM, pincode: readLastPincode() ?? '' }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [autoFilledPin, setAutoFilledPin] = useState<string | null>(null);
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  const submitting = useRef(false);

  // ── Server data ────────────────────────────────────────────────────
  const validPin = isValidPincode(values.pincode) ? values.pincode : undefined;
  const quote = useCartQuote(true, { pincode: validPin });
  const pinCheck = usePincodeCheck(values.pincode);
  const locality = usePincodeLocality(values.pincode);
  const saved = useSavedAddresses(signedIn);

  // ── Derived state ──────────────────────────────────────────────────
  const sig = cartSignature(items);
  const activeOrder = attempt && attempt.cart === sig ? attempt.order : null;
  const secondsLeft = useCountdown(activeOrder ? Date.parse(activeOrder.expiresAt) : null);
  const expired = !!activeOrder && secondsLeft === 0;
  const locked = !!activeOrder && !expired;

  const lines = new Map((quote.data?.items ?? []).map((l) => [l.productId, l]));
  const lineIssue = items.some((i) => {
    const l = lines.get(i.productId);
    return !l || l.issue !== null || l.quantity === 0;
  });
  // `serviceable: null` = courier partner unreachable → don't block (Phase 6 §6.3); only `false` blocks.
  const notServiceable =
    !!pinCheck.data && pinCheck.data.pincode === values.pincode && pinCheck.data.serviceable === false;

  // Adjust state during render (React-sanctioned) instead of effects:
  // 1) India Post city/state → fill when empty, or when the current values came from an earlier auto-fill.
  //    `autoFilledPin`: null = not yet, '<pin>' = filled for that pin, '' = customer typed their own (respect it).
  const loc = locality.data;
  if (
    loc &&
    loc.pincode === values.pincode &&
    autoFilledPin !== loc.pincode &&
    autoFilledPin !== '' &&
    (loc.city || loc.state)
  ) {
    if (autoFilledPin !== null || (!values.city.trim() && !values.state.trim())) {
      setValues((v) => ({ ...v, city: loc.city ?? v.city, state: loc.state ?? v.state }));
      setAutoFilledPin(loc.pincode);
    } else {
      setAutoFilledPin('');
    }
  }
  // 2) Signed in: prefill name/email once, and the default saved address if the form is still empty
  const user = sessionQuery.data?.user;
  if (user && prefilledFrom !== user.id) {
    setPrefilledFrom(user.id);
    setValues((v) => ({
      ...v,
      fullName: v.fullName || user.fullName || '',
      email: v.email || user.email || '',
    }));
  }
  const defaultAddress = saved.data?.find((a) => a.isDefault);
  if (defaultAddress && selectedSavedId === null && !values.line1 && !locked) {
    pickSaved(defaultAddress);
  }

  function pickSaved(a: SavedAddress) {
    setSelectedSavedId(a.id);
    setAutoFilledPin(null);
    setValues((v) => ({
      ...v,
      fullName: v.fullName || a.fullName,
      phoneDigits: v.phoneDigits || a.phone.replace(/^\+91/, ''),
      pincode: a.pincode,
      line1: a.line1,
      line2: a.line2 ?? '',
      landmark: a.landmark ?? '',
      city: a.city,
      state: a.state,
    }));
    setErrors({});
  }

  const set = <K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (key === 'city' || key === 'state') setAutoFilledPin('');
    if (['line1', 'line2', 'landmark', 'city', 'state', 'pincode'].includes(key))
      setSelectedSavedId((s) => (s ? '' : s));
    const errKey = key === 'phoneDigits' ? 'phone' : key;
    if (errKey in errors) setErrors(({ [errKey as keyof FieldErrors]: _, ...rest }) => rest);
  };

  // ── Payment ────────────────────────────────────────────────────────
  const payment = usePayment((orderCode) => {
    markOrderPaid(orderCode);
    clearAttemptKey();
    onLeave(orderCode);
    router.replace(`/order/${orderCode}`);
  });

  const createOrder = useMutation({
    mutationFn: ({ key }: { key: string }) =>
      checkoutApi.createOrder(toCreateOrderRequest(values, items, signedIn), key),
  });

  async function place(key: string, isRetry: boolean): Promise<void> {
    try {
      const res = await createOrder.mutateAsync({ key });
      rememberOrderPhone(res.orderCode, `+91${values.phoneDigits}`);
      setAttempt({ order: res, cart: sig, key });
      if (Date.parse(res.expiresAt) - Date.now() < 10_000) return; // same key, already lapsed → expired view
      payment.start(toSession(res));
    } catch (err) {
      if (isApiError(err, 'IDEMPOTENCY_CONFLICT') && !isRetry) return place(renewAttemptKey(sig), true);
      if (isApiError(err, 'OUT_OF_STOCK')) {
        const productId = typeof err.details?.productId === 'string' ? err.details.productId : null;
        const available = typeof err.details?.available === 'number' ? err.details.available : 0;
        if (productId)
          quote.setNotice(
            productId,
            available > 0
              ? `Only ${available} ${available === 1 ? 'jar' : 'jars'} left — quantity updated`
              : 'Just sold out',
          );
        await queryClient.invalidateQueries({ queryKey: ['cart', 'quote'] });
        setProblem({
          tone: 'warning',
          title: 'Some jars just sold out',
          body: 'Another order took the last jars from this batch. Check your order summary, then pay again.',
        });
        return;
      }
      if (isApiError(err, 'PAYMENT_INIT_FAILED')) {
        renewAttemptKey(sig); // that order was expired and its jars released → the next try is a new attempt
        setProblem({
          title: "We couldn't start the payment",
          body: 'Nothing was charged and your jars were released. Please try again.',
          retry: true,
        });
        return;
      }
      if (isApiError(err, 'RATE_LIMITED')) {
        const wait = err.retryAfterSeconds;
        setProblem({
          title: 'Too many attempts',
          body: wait ? `Please wait ${Math.ceil(wait / 60)} min and try again.` : 'Please wait a minute and try again.',
        });
        return;
      }
      if (isApiError(err, 'VALIDATION_ERROR')) {
        const fieldErrors = mapServerIssues(err.details);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusField(fieldErrors);
          return;
        }
        setProblem({ title: 'Please check your details', body: err.message });
        return;
      }
      if (isApiError(err, 'PINCODE_NOT_SERVICEABLE')) {
        setErrors({ pincode: "Sorry, we don't deliver to this pincode yet." });
        focusField({ pincode: 'x' });
        return;
      }
      setProblem({
        title: isApiError(err, 'NETWORK_ERROR') ? 'You seem to be offline' : 'Something went wrong',
        body: 'Your details are still here. Please try again.',
        retry: true,
      });
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (submitting.current || payment.busy) return; // double-click / double-submit safe
    if (activeOrder && !expired) {
      setProblem(null);
      payment.start(toSession(activeOrder)); // retry: same order while the reservation holds
      return;
    }
    const errs = validateCheckout(values);
    if (notServiceable && !errs.pincode) errs.pincode = "Sorry, we don't deliver to this pincode yet.";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusField(errs);
      return;
    }
    if (lineIssue || !quote.data) return;
    setErrors({});
    setProblem(null);
    submitting.current = true;
    try {
      await place(attemptKeyFor(sig), false);
    } finally {
      submitting.current = false;
    }
  }

  const [abandoning, setAbandoning] = useState(false);

  /**
   * "Change details" / "Start again": release the old reservation first (best-effort), then mint a new
   * key. If the server refuses to release a hold we still thought was live, a payment may have landed —
   * the order page confirms it (or shows the refund) instead of letting the customer pay twice.
   */
  async function startAgain() {
    if (abandoning) return;
    const previous = attempt;
    if (previous) {
      setAbandoning(true);
      try {
        const res = await checkoutApi.abandonOrder(previous.order.orderCode, previous.key);
        if (!res.released && !expired) {
          markOrderPaid(previous.order.orderCode);
          clearAttemptKey();
          onLeave(previous.order.orderCode);
          router.replace(`/order/${previous.order.orderCode}`);
          return;
        }
      } catch {
        // best-effort: the expiry sweeper releases the jars anyway
      } finally {
        setAbandoning(false);
      }
    }
    renewAttemptKey(sig);
    setAttempt(null);
    setProblem(null);
    payment.reset();
    void quote.refetch();
  }

  // ── Pay button ─────────────────────────────────────────────────────
  const quoteReady = !!quote.data && !quote.isSyncing;
  const payAmount = activeOrder && !expired ? activeOrder.amountPaise : quote.data?.totalPaise;
  const phase = payment.phase.kind;
  const busy = createOrder.isPending || payment.busy;
  const payDisabled = busy || expired || (!locked && (!quoteReady || lineIssue));
  let payLabel: ReactNode =
    payAmount !== undefined ? `Pay ${formatINR(payAmount, { trimZeroPaise: true })} securely` : 'Pay securely';
  if (createOrder.isPending) payLabel = 'Reserving your jars…';
  else if (phase === 'opening') payLabel = 'Opening payment…';
  else if (phase === 'open') payLabel = 'Complete payment in the window';
  else if (phase === 'verifying') payLabel = 'Confirming payment…';
  else if (locked && (phase === 'failed' || phase === 'error') && payAmount !== undefined)
    payLabel = `Retry payment ${formatINR(payAmount, { trimZeroPaise: true })}`;

  const payButton = (
    <Button
      type="submit"
      form="checkout-form"
      size="lg"
      className="w-full"
      disabled={payDisabled}
      aria-busy={busy}
      data-testid="pay-button"
    >
      {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Lock aria-hidden="true" />}
      {payLabel}
    </Button>
  );
  const blockedNote = !locked && quoteReady && lineIssue && (
    <p className="text-sm font-medium text-destructive">Remove unavailable items to continue.</p>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-40 md:px-8 lg:pt-8 lg:pb-16">
      <PaymentHost payment={payment} />

      <div className="mb-6 grid gap-2">
        <Link
          href="/products"
          className="inline-flex h-11 w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Continue shopping
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-serif text-3xl font-medium text-foreground md:text-4xl">Checkout</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock aria-hidden="true" className="size-4 text-success" />
            Secure, prepaid checkout
          </p>
        </div>
      </div>

      {activeOrder && !expired && <ReservationTimer seconds={secondsLeft} className="mb-4 lg:hidden" />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-10">
        <div className="grid min-w-0 gap-5">
          <StatusPanel
            problem={problem}
            expired={expired}
            phase={payment.phase}
            orderCode={activeOrder?.orderCode ?? null}
            secondsLeft={secondsLeft}
            onRetryPay={() => void submit()}
            onStartAgain={() => void startAgain()}
            abandoning={abandoning}
          />

          <form id="checkout-form" noValidate onSubmit={(e) => void submit(e)} aria-describedby="checkout-legal">
            <fieldset disabled={locked} className="grid min-w-0 gap-5">
              <legend className="sr-only">Contact and delivery details</legend>
              {locked && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm">
                  <span className="text-muted-foreground">
                    Details locked to order{' '}
                    <span className="font-medium text-foreground">{activeOrder?.orderCode}</span>
                  </span>
                </div>
              )}
              <ContactSection
                values={values}
                errors={errors}
                set={set}
                aside={
                  signedIn ? (
                    <Badge tone="success">
                      <UserRound aria-hidden="true" className="size-3" />
                      Signed in
                    </Badge>
                  ) : sessionQuery.isSuccess ? (
                    <Button type="button" variant="outline" size="sm" className="h-11" onClick={openSignIn}>
                      <span className="sm:hidden">Sign in</span>
                      <span className="hidden sm:inline">Sign in for saved addresses</span>
                    </Button>
                  ) : undefined
                }
              />
              <AddressSection
                values={values}
                errors={errors}
                set={set}
                pincode={{
                  checking: pinCheck.checking,
                  invalid: pinCheck.invalid,
                  result: pinCheck.data,
                  autoFilled: !!autoFilledPin && autoFilledPin === values.pincode,
                  localityLoading: locality.isFetching,
                }}
                signedIn={signedIn}
                saved={saved.data ?? []}
                savedLoading={saved.isPending && signedIn}
                selectedSavedId={selectedSavedId}
                onPickSaved={pickSaved}
              />
              <ConsentSection values={values} errors={errors} set={set} />
            </fieldset>
          </form>
        </div>

        <div className="grid min-w-0 gap-4 lg:sticky lg:top-24">
          {activeOrder && !expired && <ReservationTimer seconds={secondsLeft} className="hidden lg:flex" />}
          <OrderSummary
            items={items}
            quote={quote.data}
            notices={quote.notices}
            syncing={quote.isSyncing}
            loading={!quote.data && !quote.isError}
            error={quote.isError}
            onRetry={() => void quote.refetch()}
            onRemove={(id) => {
              removeItem(id);
              quote.clearNotice(id);
            }}
            onEditCart={openCart}
            editable={!locked}
            footerClassName="hidden lg:block"
            footer={
              <div className="grid gap-3">
                {blockedNote}
                {payButton}
                <LegalLine id="checkout-legal" />
              </div>
            }
          />
          <TrustPanel />
        </div>
      </div>

      {/* Phones/tablets: thumb-reach pay bar (Rules §1.1). Desktop uses the button in the summary. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float lg:hidden">
        <div className="mx-auto grid max-w-2xl gap-2">
          {blockedNote}
          <div className="flex items-center gap-3">
            <div className="grid shrink-0 leading-tight">
              <span className="text-xs text-muted-foreground">
                {locked ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock aria-hidden="true" className="size-3" />
                    {formatMmSs(secondsLeft)}
                  </span>
                ) : (
                  'Total'
                )}
              </span>
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {payAmount !== undefined ? formatINR(payAmount, { trimZeroPaise: true }) : '—'}
              </span>
            </div>
            <div className="min-w-0 flex-1 [&_button]:px-3">{payButton}</div>
          </div>
          <LegalLine />
        </div>
      </div>
    </div>
  );
}

function LegalLine({ id }: { id?: string }) {
  return (
    <p id={id} className="text-center text-xs text-muted-foreground">
      By paying you agree to our{' '}
      <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
        Terms
      </Link>
      ,{' '}
      <Link href="/refund-cancellation" className="underline underline-offset-2 hover:text-foreground">
        Refund
      </Link>{' '}
      &amp;{' '}
      <Link href="/shipping-policy" className="underline underline-offset-2 hover:text-foreground">
        Shipping
      </Link>{' '}
      policies.
    </p>
  );
}

function StatusPanel({
  problem,
  expired,
  phase,
  orderCode,
  secondsLeft,
  onRetryPay,
  onStartAgain,
  abandoning,
}: {
  problem: Problem | null;
  expired: boolean;
  phase: ReturnType<typeof usePayment>['phase'];
  orderCode: string | null;
  secondsLeft: number;
  onRetryPay: () => void;
  onStartAgain: () => void;
  abandoning: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = expired ? 'expired' : phase.kind === 'failed' || phase.kind === 'error' ? phase.kind : problem?.title;
  useEffect(() => {
    if (key) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [key]);

  let content: ReactNode = null;
  if (expired) {
    content = (
      <Panel
        tone="warning"
        testId="checkout-expired"
        title="Your jars were held for 15 minutes"
        body={`The payment window for ${orderCode ?? 'this order'} ended and the jars went back on the shelf. Nothing was charged — please start again.`}
        actions={
          <Button type="button" onClick={onStartAgain} disabled={abandoning}>
            {abandoning ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCcw aria-hidden="true" />}
            Start again
          </Button>
        }
      />
    );
  } else if (orderCode && phase.kind === 'failed') {
    content = (
      <Panel
        tone="warning"
        testId="payment-retry"
        title="Payment not completed"
        body={
          <>
            {phase.reason ? `${phase.reason} ` : ''}No money was taken. Your jars are still reserved for{' '}
            <span className="font-semibold tabular-nums">{formatMmSs(secondsLeft)}</span> — retry with UPI, a card or
            netbanking.
          </>
        }
        actions={
          <>
            <Button type="button" onClick={onRetryPay}>
              Retry payment
            </Button>
            <Button type="button" variant="outline" onClick={onStartAgain} disabled={abandoning}>
              {abandoning && <Loader2 aria-hidden="true" className="animate-spin" />}
              Change details
            </Button>
          </>
        }
      />
    );
  } else if (phase.kind === 'error') {
    content = (
      <Panel
        tone="destructive"
        title="Payment couldn't continue"
        body={phase.message}
        actions={
          orderCode ? (
            <Button type="button" variant="outline" onClick={onRetryPay}>
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  } else if (problem) {
    content = (
      <Panel
        tone={problem.tone ?? 'destructive'}
        title={problem.title}
        body={problem.body}
        actions={
          problem.retry ? (
            <Button type="submit" form="checkout-form" variant="outline">
              <RefreshCcw aria-hidden="true" />
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (!content) return null;
  return (
    <div ref={ref} className="scroll-mt-24">
      {content}
    </div>
  );
}

function Panel({
  tone,
  title,
  body,
  actions,
  testId,
}: {
  tone: 'warning' | 'destructive';
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <Alert tone={tone} className="grid gap-3 p-4" data-testid={testId}>
      <div className="flex items-start gap-2.5">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="grid gap-1">
          <p className="font-semibold">{title}</p>
          {body && <p className="text-foreground">{body}</p>}
        </div>
      </div>
      {actions && <div className={cn('flex flex-wrap gap-2 pl-7.5')}>{actions}</div>}
    </Alert>
  );
}
