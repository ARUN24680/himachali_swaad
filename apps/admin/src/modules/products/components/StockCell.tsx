import type { AdminProduct } from '@pk/shared';
import { cn } from '@pk/ui';

/** Sellable (D-24) vs on-hand jars. On-hand includes NOT_SELLABLE / EXPIRED batches. */
export function StockCell({ stock, className }: { stock: AdminProduct['stock']; className?: string }) {
  const hidden = stock.onHand - stock.sellable;
  return (
    <div className={cn('grid gap-0.5', className)}>
      <span className={cn('font-semibold tabular-nums', stock.sellable === 0 ? 'text-destructive' : 'text-foreground')}>
        {stock.sellable} <span className="font-normal text-muted-foreground">sellable</span>
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {stock.onHand} on hand{hidden > 0 && ` · ${hidden} not sellable`}
      </span>
    </div>
  );
}
