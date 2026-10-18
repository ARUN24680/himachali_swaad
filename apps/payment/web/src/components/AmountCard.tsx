import { Card, cn } from '@pk/ui';
import { Info } from 'lucide-react';
import { formatINR, paiseToPlain } from '../lib/format';
import { CopyButton } from './CopyButton';

interface AmountCardProps {
  payablePaise: number;
  amountPaise: number;
  className?: string;
}

export function AmountCard({ payablePaise, amountPaise, className }: AmountCardProps) {
  const discountPaise = amountPaise - payablePaise;
  return (
    <Card className={cn('p-4 md:p-6', className)}>
      <p id="amount-label" className="text-sm font-medium text-muted-foreground">
        Amount to pay
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p
          aria-labelledby="amount-label"
          className="text-4xl font-semibold tracking-tight text-foreground tabular-nums md:text-5xl"
        >
          {formatINR(payablePaise)}
        </p>
        <CopyButton value={paiseToPlain(payablePaise)} label="amount" />
      </div>
      <div className="mt-4 flex gap-2.5 rounded-md bg-accent p-3 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
        <p>
          <span className="font-semibold">Pay exactly this amount</span>, paise included — the paise help us match your
          payment automatically.
          {discountPaise > 0 && (
            <span className="mt-1 block text-muted-foreground">
              That&rsquo;s <span className="tabular-nums">{formatINR(discountPaise)}</span> less than your order total
              of <span className="tabular-nums">{formatINR(amountPaise)}</span> — a small UPI matching discount, on us.
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}
