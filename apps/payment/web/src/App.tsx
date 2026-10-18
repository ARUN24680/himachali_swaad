import { Button, buttonVariants, cn } from '@pk/ui';
import { ArrowLeft, CircleCheck, Clock, Hourglass, RefreshCw, SearchX, TimerOff, WifiOff } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { AmountCard } from './components/AmountCard';
import { LiveDot } from './components/LiveDot';
import { PayActionCard } from './components/PayActionCard';
import { PayeeCard } from './components/PayeeCard';
import { PayHeader } from './components/PayHeader';
import { PaySkeleton } from './components/PaySkeleton';
import { QrCard } from './components/QrCard';
import { StateMessage } from './components/StateMessage';
import { useNow } from './hooks/useNow';
import { LATE_WINDOW_MS, usePaymentView } from './hooks/usePaymentView';
import { goTo, orderIdFromLocation, type PaymentView } from './lib/api';
import { formatINR } from './lib/format';

const REDIRECT_AFTER_S = 3;

export function App() {
  const [orderId] = useState(() => orderIdFromLocation(window.location.pathname));
  const { view, failure, skewMs, loading, retry } = usePaymentView(orderId);
  const ticking = view?.status === 'created';
  const now = useNow(skewMs, ticking);

  let content: ReactNode;
  if (!view) {
    if (loading) content = <PaySkeleton />;
    else if (failure === 'not_found') content = <NotFound onRetry={orderId ? retry : undefined} />;
    else if (failure === 'rate_limited') content = <RateLimited onRetry={retry} />;
    else content = <LoadError onRetry={retry} />;
  } else if (view.status === 'paid') {
    content = <Paid view={view} />;
  } else if (view.status === 'expired') {
    content = <Expired view={view} />;
  } else {
    const expiresAt = Date.parse(view.expiresAt);
    if (now < expiresAt) {
      content = <AwaitingPayment view={view} remainingMs={expiresAt - now} reconnecting={failure !== null} />;
    } else {
      content = <TimeUp view={view} stillChecking={now < expiresAt + LATE_WINDOW_MS} />;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PayHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6 md:py-10">{content}</main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center text-xs text-muted-foreground md:px-6">
        Payments go straight to Pahadi Khatki&rsquo;s bank account over UPI. No card or bank details are collected on
        this page.
      </footer>
    </div>
  );
}

function OrderMeta({ view }: { view: PaymentView }) {
  return (
    <dl className="flex flex-wrap justify-center gap-x-6 gap-y-1">
      <div className="flex gap-1.5">
        <dt className="text-muted-foreground">Order</dt>
        <dd className="font-semibold">{view.orderCode}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="font-semibold">{formatINR(view.payablePaise)}</dd>
      </div>
    </dl>
  );
}

function BackToStore({ returnUrl, className }: { returnUrl: string; className?: string }) {
  return (
    <a href={returnUrl} className={cn(buttonVariants({ variant: 'ghost', size: 'md' }), '-ml-3', className)}>
      <ArrowLeft aria-hidden="true" />
      Back to store
    </a>
  );
}

function AwaitingPayment({
  view,
  remainingMs,
  reconnecting,
}: {
  view: PaymentView;
  remainingMs: number;
  reconnecting: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Order <span className="font-semibold text-foreground tabular-nums">{view.orderCode}</span>
        </p>
        <h1 className="mt-1 text-2xl font-medium text-balance text-foreground md:text-4xl">Complete your payment</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pay with any UPI app. Keep this page open — it updates on its own once your bank confirms the payment.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <AmountCard
          payablePaise={view.payablePaise}
          amountPaise={view.amountPaise}
          className="md:col-start-2 md:row-start-1"
        />
        <PayActionCard
          upiUri={view.upiUri}
          remainingMs={remainingMs}
          reconnecting={reconnecting}
          className="md:col-start-2 md:row-start-2"
        />
        <QrCard
          qrDataUrl={view.qrDataUrl}
          payeeName={view.payeeName}
          payablePaise={view.payablePaise}
          className="md:col-start-1 md:row-span-3 md:row-start-1"
        />
        <PayeeCard payeeName={view.payeeName} payeeVpa={view.payeeVpa} className="md:col-start-2 md:row-start-3" />
      </div>

      <BackToStore returnUrl={view.returnUrl} />
    </div>
  );
}

function TimeUp({ view, stillChecking }: { view: PaymentView; stillChecking: boolean }) {
  return (
    <StateMessage
      live
      icon={Clock}
      tone="warning"
      title="Time's up for this payment"
      meta={<OrderMeta view={view} />}
      actions={
        stillChecking ? undefined : (
          <Button size="lg" onClick={() => goTo(view.returnUrl)}>
            Check order status
          </Button>
        )
      }
    >
      <p>
        Please don&rsquo;t start a new payment from this page. If you already paid, keep this page open — we&rsquo;ll
        confirm it in a few minutes.
      </p>
      {stillChecking ? (
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <LiveDot />
          Still checking for your payment…
        </p>
      ) : (
        <p className="text-sm">We haven&rsquo;t seen it yet. Your order page will show the latest status.</p>
      )}
    </StateMessage>
  );
}

function Paid({ view }: { view: PaymentView }) {
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_AFTER_S);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1_000);
    const redirect = setTimeout(() => goTo(view.returnUrl), REDIRECT_AFTER_S * 1_000);
    return () => {
      clearInterval(id);
      clearTimeout(redirect);
    };
  }, [view.returnUrl]);

  return (
    <StateMessage
      live
      icon={CircleCheck}
      tone="success"
      title="Payment received"
      meta={<OrderMeta view={view} />}
      actions={
        <Button size="lg" onClick={() => goTo(view.returnUrl)}>
          View my order
        </Button>
      }
    >
      <p>Thank you! Your payment has been matched with your order.</p>
      <p className="text-sm tabular-nums">
        {secondsLeft > 0 ? `Taking you to your order in ${secondsLeft}s…` : 'Taking you to your order…'}
      </p>
    </StateMessage>
  );
}

function Expired({ view }: { view: PaymentView }) {
  return (
    <StateMessage
      icon={TimerOff}
      tone="neutral"
      title="This payment link has expired"
      meta={<OrderMeta view={view} />}
      actions={
        <Button size="lg" onClick={() => goTo(view.returnUrl)}>
          Back to my order
        </Button>
      }
    >
      <p>
        The reservation ended before a payment reached us, so please don&rsquo;t pay using this link. If money has
        already left your account, open your order — late payments are reviewed and matched by our team.
      </p>
    </StateMessage>
  );
}

function NotFound({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateMessage
      icon={SearchX}
      tone="neutral"
      title="We couldn't find this payment"
      actions={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        )
      }
    >
      <p>The link may be incomplete or no longer active. Go back to the store and open your order to pay again.</p>
    </StateMessage>
  );
}

function RateLimited({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      live
      icon={Hourglass}
      tone="warning"
      title="Just a moment"
      actions={
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try now
        </Button>
      }
    >
      <p>We&rsquo;ve had a lot of requests from your network. We&rsquo;ll try again automatically in a few seconds.</p>
    </StateMessage>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      icon={WifiOff}
      tone="destructive"
      title="We couldn't load your payment"
      actions={
        <Button onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      }
    >
      <p>
        Check your connection and try again. If you&rsquo;ve already paid, your money is safe — it&rsquo;s matched using
        your bank&rsquo;s confirmation.
      </p>
    </StateMessage>
  );
}
