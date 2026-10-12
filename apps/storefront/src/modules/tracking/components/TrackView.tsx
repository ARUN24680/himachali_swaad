'use client';

import type { TrackRequest } from '@pk/shared';
import { ORDER_CODE_REGEX, normalizeOrderCode } from '@pk/shared/order';
import { PHONE_REGEX } from '@pk/shared/patterns';
import { Button, Input } from '@pk/ui';
import {
  Clock,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  PackageSearch,
  RefreshCcw,
  Search,
  UserRound,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormField, fieldAria } from '@/components/common/FormField';
import { PhoneInput } from '@/components/common/PhoneInput';
import { StateMessage } from '@/components/common/StateMessage';
import { isApiError } from '@/lib/api-client';
import { formatWait, useCountdown } from '@/lib/use-countdown';
import { useHydrated } from '@/lib/use-hydrated';
import { useTrackLookup } from '../hooks/useTrackLookup';
import { formatWhen } from '../lib/format';
import { TrackResult, TrackResultSkeleton } from './TrackResult';

/**
 * /track (Phase 8 §8.2, D-39): order code + phone, both required. `?code=` (from /order/[code] and
 * WhatsApp links) prefills the code; the phone is always typed and only ever travels in the POST body.
 */
export function TrackView({ initialCode }: { initialCode: string }) {
  const lookup = useTrackLookup();
  const hydrated = useHydrated();
  const [code, setCode] = useState(initialCode);
  const [digits, setDigits] = useState('');
  const [errors, setErrors] = useState<{ code?: string; phone?: string }>({});
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const waitLeft = useCountdown(rateLimitedUntil);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = (body: TrackRequest) =>
    lookup.mutate(body, {
      onSuccess: (data) => {
        // Shareable, PII-free URL: the code only (never the phone)
        window.history.replaceState(null, '', `/track?code=${encodeURIComponent(data.orderCode)}`);
      },
      onError: (err) => {
        if (isApiError(err, 'RATE_LIMITED')) setRateLimitedUntil(Date.now() + (err.retryAfterSeconds ?? 600) * 1000);
      },
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const orderCode = normalizeOrderCode(code);
    const phone = `+91${digits}`;
    const next = {
      code: !code.trim()
        ? 'Enter your order code'
        : ORDER_CODE_REGEX.test(orderCode)
          ? undefined
          : 'Order codes look like PK-7KQ2M9',
      phone: !digits
        ? 'Enter the mobile number used at checkout'
        : PHONE_REGEX.test(phone)
          ? undefined
          : 'Enter a valid 10-digit Indian mobile number',
    };
    setErrors(next);
    if (next.code || next.phone) return;
    setCode(orderCode);
    run({ orderCode, phone });
  };

  // Move focus to the result heading so keyboard / screen-reader users land on the answer
  useEffect(() => {
    if (lookup.isSuccess) resultRef.current?.querySelector<HTMLElement>('#shipment-title')?.focus();
  }, [lookup.isSuccess, lookup.data]);

  const limited = waitLeft > 0;
  const busy = lookup.isPending;
  const order = lookup.data;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 pb-16 md:px-8 lg:pt-12">
      <header className="grid max-w-2xl gap-3">
        <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">
          From Himachal to your door
        </p>
        <h1 className="font-serif text-4xl leading-[1.1] font-medium text-balance text-foreground md:text-5xl">
          Track your order
        </h1>
        <p className="text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
          Follow your jars from our kitchen in the hills to your doorstep — no account needed.
        </p>
      </header>

      <section
        aria-labelledby="track-form-title"
        className="grid gap-5 rounded-lg border border-border bg-card p-5 sm:p-7"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <h2 id="track-form-title" className="font-serif text-xl font-medium text-foreground">
              Find your parcel
            </h2>
            <p className="text-sm text-muted-foreground">
              Your order code is in the SMS or WhatsApp confirmation, e.g.{' '}
              <span className="font-mono text-foreground">PK-7KQ2M9</span>.
            </p>
          </div>
          <p className="flex w-fit items-center gap-1.5 rounded-sm bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 text-accent-foreground" />
            Private: we only show your first name and city
          </p>
        </div>
        {/* method=post: even before hydration the phone can never end up in the URL */}
        <form
          method="post"
          onSubmit={submit}
          noValidate
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-start"
          aria-describedby={limited ? 'track-wait' : undefined}
        >
          <FormField id="track-code" label="Order code" error={errors.code}>
            <Input
              {...fieldAria('track-code', errors.code, false)}
              name="orderCode"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (errors.code) setErrors((x) => ({ ...x, code: undefined }));
              }}
              placeholder="PK-7KQ2M9"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              className="font-mono tracking-wider uppercase placeholder:normal-case"
              autoFocus={!initialCode}
            />
          </FormField>
          <FormField id="track-phone" label="Mobile number used at checkout" error={errors.phone}>
            <PhoneInput
              {...fieldAria('track-phone', errors.phone, false)}
              value={digits}
              onValueChange={(d) => {
                setDigits(d);
                if (errors.phone) setErrors((x) => ({ ...x, phone: undefined }));
              }}
              autoFocus={!!initialCode}
            />
          </FormField>
          <div className="grid md:col-span-2 lg:col-span-1 lg:pt-7">
            <Button type="submit" size="lg" disabled={!hydrated || busy || limited} className="w-full lg:w-auto">
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Search aria-hidden="true" />}
              {busy ? 'Looking up…' : 'Track order'}
            </Button>
          </div>
        </form>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {busy
          ? 'Looking up your order'
          : order
            ? `Showing order ${order.orderCode}`
            : lookup.isError
              ? 'Order lookup failed'
              : ''}
      </p>

      <div ref={resultRef} className="grid scroll-mt-24">
        {busy ? (
          <TrackResultSkeleton />
        ) : lookup.isError ? (
          <LookupError
            error={lookup.error}
            waitLeft={waitLeft}
            onRetry={() => lookup.variables && run(lookup.variables)}
          />
        ) : order ? (
          <TrackResult
            order={order}
            headerAction={
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="tabular-nums">Updated {formatWhen(order.updatedAt)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh tracking"
                  disabled={busy || limited}
                  onClick={() => lookup.variables && run(lookup.variables)}
                >
                  <RefreshCcw aria-hidden="true" />
                </Button>
              </div>
            }
          />
        ) : (
          <TrackIntro />
        )}
      </div>
    </div>
  );
}

function LookupError({ error, waitLeft, onRetry }: { error: unknown; waitLeft: number; onRetry: () => void }) {
  if (isApiError(error, 'RATE_LIMITED')) {
    return (
      <StateMessage
        icon={<Clock />}
        title="Too many tries for now"
        description={
          <span id="track-wait" data-testid="track-rate-limited">
            {waitLeft > 0
              ? `To keep orders private we limit lookups. Please try again in ${formatWait(waitLeft)}.`
              : 'You can try again now.'}
          </span>
        }
      />
    );
  }
  if (isApiError(error, 'NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED')) {
    return (
      <StateMessage
        icon={<PackageSearch />}
        title="We couldn’t find that order"
        description={
          <span data-testid="track-not-found">
            Please check the order code and use the same mobile number you entered at checkout — both need to match.
          </span>
        }
        action={
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Still stuck? Contact us
          </Link>
        }
      />
    );
  }
  return (
    <StateMessage
      tone="error"
      icon={<WifiOff />}
      title="Couldn’t reach our server"
      description="Your order is safe — we just couldn’t load its status. Please try again."
      action={
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCcw aria-hidden="true" />
          Try again
        </Button>
      }
    />
  );
}

/** Empty state before the first lookup: what to expect + where to find things. */
function TrackIntro() {
  const tips = [
    {
      icon: <MessageSquareText />,
      title: 'Where’s my order code?',
      body: 'In the SMS (and WhatsApp, if you opted in) we sent when your order was confirmed.',
    },
    {
      icon: <LockKeyhole />,
      title: 'Why the phone number?',
      body: 'So only you can see your order. We never show your address or full number here.',
    },
    {
      icon: <UserRound />,
      title: 'Signed in?',
      body: (
        <>
          All your orders are in{' '}
          <Link
            href="/account/orders"
            className="font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            My orders
          </Link>
          .
        </>
      ),
    },
  ];
  return (
    <ul className="grid gap-4 md:grid-cols-3" data-testid="track-intro">
      {tips.map((t) => (
        <li key={t.title} className="flex gap-3 rounded-lg border border-dashed border-border p-4 sm:p-5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-accent-foreground [&_svg]:size-4.5"
          >
            {t.icon}
          </span>
          <div className="grid content-start gap-1">
            <p className="font-medium text-foreground">{t.title}</p>
            <p className="text-sm text-pretty text-muted-foreground">{t.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
