import { buttonVariants, Card, cn } from '@pk/ui';
import { Smartphone, Timer } from 'lucide-react';
import { describeCountdown, formatCountdown } from '../lib/format';
import { LiveDot } from './LiveDot';

interface PayActionCardProps {
  upiUri: string;
  remainingMs: number;
  /** Last poll failed — we are retrying. */
  reconnecting: boolean;
  className?: string;
}

const LOW_TIME_MS = 2 * 60_000;

export function PayActionCard({ upiUri, remainingMs, reconnecting, className }: PayActionCardProps) {
  const low = remainingMs <= LOW_TIME_MS;
  return (
    <Card className={cn('flex flex-col gap-4 p-4 md:p-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-foreground">
          <LiveDot />
          {reconnecting ? 'Connection hiccup — still checking…' : 'Waiting for your payment…'}
        </p>
        <div
          role="timer"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-sm',
            low ? 'border-warning/30 bg-warning/15 text-warning' : 'border-border bg-muted text-muted-foreground',
          )}
        >
          <Timer className="size-4" aria-hidden="true" />
          <span>Jars reserved</span>
          <span aria-hidden="true" className="font-semibold tabular-nums">
            {formatCountdown(remainingMs)}
          </span>
          <span className="sr-only">for {describeCountdown(remainingMs)}</span>
        </div>
      </div>

      {/* Phones: the intent button is the main action. Larger screens: the QR is, so this steps back. */}
      <a href={upiUri} className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full md:hidden')}>
        <Smartphone aria-hidden="true" />
        Open UPI app
      </a>
      <a
        href={upiUri}
        className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'hidden w-full md:inline-flex')}
      >
        <Smartphone aria-hidden="true" />
        Open a UPI app on this device
      </a>
      <p className="-mt-1 text-sm text-muted-foreground">
        Opens GPay, PhonePe, Paytm, BHIM or any UPI app with the amount already filled in.
      </p>
    </Card>
  );
}
