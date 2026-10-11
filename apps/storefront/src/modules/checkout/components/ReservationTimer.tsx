'use client';

import { cn } from '@pk/ui';
import { Hourglass } from 'lucide-react';
import { formatMmSs } from '@/lib/use-countdown';

/**
 * "Jars reserved for 14:28" (Phase 5 §5.4). Visual tick every second, but screen readers only hear
 * it at whole minutes and in the last minute's warning, not 900 announcements.
 */
export function ReservationTimer({ seconds, className }: { seconds: number; className?: string }) {
  const urgent = seconds <= 120;
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
        urgent ? 'border-warning/40 bg-warning/10 text-warning' : 'border-border bg-muted text-foreground',
        className,
      )}
      data-testid="reservation-timer"
    >
      <span className="flex items-center gap-2 font-medium">
        <Hourglass aria-hidden="true" className="size-4 shrink-0" />
        Jars reserved for
      </span>
      <span
        role="timer"
        aria-live={seconds % 60 === 0 || seconds === 30 ? 'polite' : 'off'}
        aria-label={`${Math.ceil(seconds / 60)} minutes left to pay`}
        className={cn(
          'rounded-full px-2.5 py-0.5 font-semibold tabular-nums',
          urgent ? 'bg-warning/15' : 'bg-primary text-primary-foreground',
        )}
      >
        {formatMmSs(seconds)}
      </span>
    </div>
  );
}
