'use client';

import type { OrderStatusResponse } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Alert, Button, Skeleton, buttonVariants } from '@pk/ui';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  Lock,
  MessageCircle,
  PackageX,
  RefreshCcw,
  RotateCcw,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { policy } from '@/config/site';
import { markOrderPaid, readOrderPhone, rememberOrderPhone, wasOrderPaid } from '@/lib/order-session';
import { formatMmSs, useCountdown } from '@/lib/use-countdown';
import { useHydrated } from '@/lib/use-hydrated';
import { PaymentHost, usePayment, type PaymentController } from '@/modules/checkout';
import { useOrderStatus } from '../hooks/useOrderStatus';
import { ACTIVE_STATUSES, ORDER_STATUS_LABEL, formatDateTime } from '../lib/labels';
import { CancelOrderButton, InvoiceButton } from './OrderActions';
import { OrderHero, OrderItemsCard, StepList } from './OrderParts';
import { PhoneGate } from './PhoneGate';
import { PurchaseTracker } from './PurchaseTracker';

/**
 * /order/[orderCode] (Phase 5 §5.11). Reads the checkout phone from this tab's session storage, so it
 * renders a skeleton until hydrated (no SSR/client mismatch), then polls the status endpoint.
 */
export function OrderStatusView({ orderCode }: { orderCode: string }) {
  const hydrated = useHydrated();
  return hydrated ? <OrderFlow orderCode={orderCode} /> : <OrderSkeleton />;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pt-6 pb-16 md:px-8 lg:pt-10">{children}</div>;
}

function OrderFlow({ orderCode }: { orderCode: string }) {
  const [phone, setPhone] = useState(() => readOrderPhone(orderCode));
  const [paid, setPaid] = useState(() => wasOrderPaid(orderCode));
  const status = useOrderStatus(orderCode, phone, true);
  const payment = usePayment((code) => {
    markOrderPaid(code);
    setPaid(true);
    status.refresh();
  });

  if (status.needsPhone) {
    return (
      <Frame>
        <PhoneGate
          key={phone ?? 'none'}
          orderCode={orderCode}
          mismatch={!!phone}
          checking={status.isFetching}
          onSubmit={(p) => {
            rememberOrderPhone(orderCode, p);
            setPhone(p);
          }}
        />
      </Frame>
    );
  }
  if (status.isPending) return <OrderSkeleton />;
  if (status.isError || !status.data) {
    return (
      <Frame>
        <StateMessage
          tone="error"
          icon={<WifiOff />}
          title="Couldn't load your order"
          description="Your order is safe — we just couldn't reach our server. Please try again."
          action={
            <Button variant="outline" onClick={status.refresh}>
              <RefreshCcw aria-hidden="true" />
              Try again
            </Button>
          }
        />
      </Frame>
    );
  }

  const order = status.data;
  return (
    <Frame>
      <PaymentHost payment={payment} loadRazorpay={order.retryPayment?.gateway === 'razorpay'} />
      <OrderBody
        order={order}
        phone={phone}
        paid={paid}
        pollTimedOut={status.pollTimedOut}
        refreshing={status.isFetching}
        onRefresh={status.refresh}
        payment={payment}
      />
    </Frame>
  );
}

function OrderBody({
  order,
  phone,
  paid,
  pollTimedOut,
  refreshing,
  onRefresh,
  payment,
}: {
  order: OrderStatusResponse;
  phone: string | undefined;
  paid: boolean;
  pollTimedOut: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  payment: PaymentController;
}) {
  const secondsLeft = useCountdown(order.retryPayment ? Date.parse(order.reservationExpiresAt) : null);
  const canPay = !!order.retryPayment && secondsLeft > 0 && !paid;
  const total = formatINR(order.totalPaise, { trimZeroPaise: true });

  // ── Waiting for the bank / webhook ─────────────────────────────────
  if (order.status === 'PENDING_PAYMENT' && !canPay) {
    return (
      <Layout order={order}>
        <OrderHero
          order={order}
          icon={<Loader2 className="animate-spin" />}
          title="Confirming your payment…"
          statusLabel="Confirming payment"
        >
          <p role="status" data-testid="order-confirming">
            We&rsquo;re waiting for your bank&rsquo;s final confirmation. This usually takes a few seconds — this page
            updates by itself.
          </p>
        </OrderHero>
        {pollTimedOut && (
          <Alert tone="info" className="grid gap-3 p-4" role="status">
            <div className="grid gap-1">
              <p className="font-semibold">This is taking longer than usual — that&rsquo;s okay.</p>
              <p className="text-foreground">
                If money left your account, your order is confirmed automatically as soon as the bank tells us, or the
                full amount comes back to you. You&rsquo;ll get an SMS either way.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing} className="w-fit">
              {refreshing ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCcw aria-hidden="true" />}
              Check again
            </Button>
          </Alert>
        )}
      </Layout>
    );
  }

  // ── Unpaid but still reserved: offer to (re)pay the same gateway order ─
  if (canPay && order.retryPayment) {
    const retry = order.retryPayment;
    const failed = payment.phase.kind === 'failed' || payment.phase.kind === 'error';
    return (
      <Layout order={order}>
        <OrderHero order={order} icon={<Hourglass />} iconTone="warning" title="Complete your payment">
          <p>
            Your jars are reserved for{' '}
            <span className="font-semibold text-foreground tabular-nums" data-testid="order-reserve-timer">
              {formatMmSs(secondsLeft)}
            </span>
            . Pay {total} to confirm the order.
          </p>
          {failed && (
            <p className="flex items-start gap-1.5 text-warning" data-testid="payment-retry">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {payment.phase.kind === 'error'
                ? payment.phase.message
                : `Payment not completed. ${payment.phase.kind === 'failed' && payment.phase.reason ? payment.phase.reason : ''} No money was taken.`}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              disabled={payment.busy}
              onClick={() =>
                payment.start({
                  orderCode: order.orderCode,
                  razorpayOrderId: retry.razorpayOrderId,
                  keyId: retry.keyId,
                  gateway: retry.gateway,
                  amountPaise: retry.amountPaise,
                  expiresAt: order.reservationExpiresAt,
                })
              }
            >
              {payment.busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Lock aria-hidden="true" />}
              {failed ? `Retry payment ${total}` : `Pay ${total} securely`}
            </Button>
          </div>
        </OrderHero>
      </Layout>
    );
  }

  // ── Expired: never paid in time ────────────────────────────────────
  if (order.status === 'EXPIRED') {
    return (
      <Layout order={order}>
        <OrderHero order={order} icon={<Clock />} title="Payment window ended — jars released">
          <p data-testid="order-expired">
            We held your jars for 15 minutes but the payment didn&rsquo;t come through, so they went back on the shelf.
            Nothing was charged.
          </p>
          <p className="text-sm">
            Paid just now? If the bank confirms it, we&rsquo;ll still fulfil the order if jars are left — otherwise you
            get a full refund automatically.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/products" className={buttonVariants()}>
              Shop again
            </Link>
          </div>
        </OrderHero>
      </Layout>
    );
  }

  // ── Cancelled / returned / lost: refund messaging ──────────────────
  if (!ACTIVE_STATUSES.includes(order.status)) {
    const lateStockout = order.cancelReason === 'LATE_PAYMENT_STOCKOUT';
    const title = lateStockout
      ? 'Paid after the jars ran out — full refund started'
      : order.status === 'CANCELLED'
        ? 'Order cancelled'
        : ORDER_STATUS_LABEL[order.status];
    return (
      <Layout order={order}>
        <OrderHero
          order={order}
          icon={lateStockout ? <RotateCcw /> : <PackageX />}
          iconTone={lateStockout ? 'warning' : 'destructive'}
          title={title}
        >
          {lateStockout && (
            <p>
              Your payment reached us after the reservation ended, and the last jars from this batch had already gone.
              We&rsquo;re sorry — the full amount is on its way back to you.
            </p>
          )}
          <RefundNotice order={order} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/products" className={buttonVariants()}>
              Shop the current batch
            </Link>
            <Link href="/contact" className={buttonVariants({ variant: 'outline' })}>
              Contact us
            </Link>
          </div>
        </OrderHero>
      </Layout>
    );
  }

  // ── Paid and moving: success ───────────────────────────────────────
  const confirmed = order.status === 'CONFIRMED';
  const step = ACTIVE_STATUSES.indexOf(order.status);
  const whatsapp = order.whatsappOptIn;
  const steps = [
    {
      title: 'Order confirmed',
      body: order.confirmedAt ? formatDateTime(order.confirmedAt) : 'Payment received',
      state: 'done' as const,
    },
    {
      title: 'Packed fresh in our Himachal kitchen',
      body: 'Sealed jars, cushioned and boxed for the journey.',
      state: step >= 2 ? ('done' as const) : ('current' as const),
    },
    {
      title: 'Handed to the courier',
      body: `We send you the tracking link by SMS${whatsapp ? ' and WhatsApp' : ''}.`,
      state: step >= 4 ? ('done' as const) : step >= 2 ? ('current' as const) : ('upcoming' as const),
    },
    {
      title: 'Delivered',
      body: `To ${order.shippingCity}.`,
      state: order.status === 'DELIVERED' ? ('done' as const) : ('upcoming' as const),
    },
  ];
  return (
    <Layout
      order={order}
      itemsFooter={
        order.invoiceAvailable || order.canCancel ? (
          <div className="flex flex-wrap items-start justify-between gap-2">
            {order.invoiceAvailable && <InvoiceButton orderCode={order.orderCode} phone={phone} />}
            {order.canCancel && <CancelOrderButton orderCode={order.orderCode} />}
          </div>
        ) : undefined
      }
    >
      {confirmed && <PurchaseTracker order={order} />}
      <OrderHero
        order={order}
        icon={<CheckCircle2 />}
        iconTone="success"
        title={
          confirmed ? 'Your order is confirmed!' : `Order update: ${ORDER_STATUS_LABEL[order.status].toLowerCase()}`
        }
      >
        <p data-testid={confirmed ? 'order-confirmed' : undefined}>
          Thank you — we&rsquo;ve received {total}. Your jars are being prepared in small batches in Himachal.
        </p>
      </OrderHero>
      <section aria-labelledby="next-title" className="rounded-lg border border-border bg-card p-5 sm:p-6">
        <h2 id="next-title" className="mb-5 font-serif text-xl font-medium text-foreground">
          What happens next
        </h2>
        <StepList steps={steps} />
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-muted px-3.5 py-3 text-sm text-foreground">
          <MessageCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
          {whatsapp
            ? 'You opted in to WhatsApp — dispatch and delivery updates will come there as well as by SMS.'
            : 'Dispatch and delivery updates come by SMS to the number you used at checkout.'}
        </p>
      </section>
    </Layout>
  );
}

/** Two-column on desktop: story on the left, items + totals on the right (sticky). */
function Layout({
  order,
  children,
  itemsFooter,
}: {
  order: OrderStatusResponse;
  children: ReactNode;
  itemsFooter?: ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
      <div className="grid min-w-0 gap-6">{children}</div>
      <div className="min-w-0 lg:sticky lg:top-24">
        <OrderItemsCard order={order} footer={itemsFooter} />
      </div>
    </div>
  );
}

function RefundNotice({ order }: { order: OrderStatusResponse }) {
  const { refund } = order;
  const timeline = policy.refundTimeline ? `within ${policy.refundTimeline}` : 'within a few working days';
  if (!refund) {
    return order.paymentStatus === 'UNPAID' ? (
      <p>Nothing was charged for this order.</p>
    ) : order.paymentStatus === 'REFUNDED' ? (
      <p>Your payment has been refunded in full.</p>
    ) : (
      <p>Your refund is being prepared — you&rsquo;ll get an SMS when it&rsquo;s on its way.</p>
    );
  }
  const amount = formatINR(refund.amountPaise, { trimZeroPaise: true });
  const tone = refund.status === 'FAILED' ? 'warning' : refund.status === 'PROCESSED' ? 'success' : 'info';
  const text =
    refund.status === 'PROCESSED'
      ? `Refund of ${amount} completed. Your bank may take a day or two to show it.`
      : refund.status === 'FAILED'
        ? `Your refund of ${amount} hit a snag at the bank. We're retrying and our team has been alerted — no action needed from you.`
        : `Refund of ${amount} started to your original payment method. It usually arrives ${timeline}.`;
  return (
    <Alert tone={tone} role="status" data-testid="refund-notice" className="text-foreground">
      <RotateCcw aria-hidden="true" />
      <span>{text}</span>
    </Alert>
  );
}

export function OrderSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your order"
      className="mx-auto grid w-full max-w-5xl gap-6 px-4 pt-6 pb-16 md:px-8 lg:pt-10"
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="grid gap-6">
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:p-8">
            <Skeleton className="size-14 rounded-full" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-12 w-60" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:p-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
