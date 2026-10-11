import { formatINR } from '@pk/shared/money';
import { Progress } from '@pk/ui';
import { PartyPopper, Truck } from 'lucide-react';

/**
 * Free-delivery nudge driven ONLY by the quote (Q-03 threshold lives in settings). Renders nothing
 * while the threshold is undecided (null).
 */
export function FreeShippingProgress({
  thresholdPaise,
  remainingPaise,
}: {
  thresholdPaise: number | null;
  remainingPaise: number | null;
}) {
  if (thresholdPaise === null || remainingPaise === null || thresholdPaise <= 0) return null;
  const unlocked = remainingPaise <= 0;
  const percent = unlocked ? 100 : Math.floor(((thresholdPaise - remainingPaise) * 100) / thresholdPaise);

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/60 p-3">
      <p className="flex items-center gap-2 text-sm text-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        {unlocked ? (
          <>
            <PartyPopper aria-hidden="true" className="text-success" />
            <span className="font-medium text-success">You&rsquo;ve unlocked free delivery</span>
          </>
        ) : (
          <>
            <Truck aria-hidden="true" className="text-accent-foreground" />
            <span>
              Add{' '}
              <strong className="font-semibold tabular-nums">
                {formatINR(remainingPaise, { trimZeroPaise: true })}
              </strong>{' '}
              more for free delivery
            </span>
          </>
        )}
      </p>
      <Progress value={percent} aria-label="Progress towards free delivery" />
    </div>
  );
}
