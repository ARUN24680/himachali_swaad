import { formatINR } from '@pk/shared/money';
import { cn } from '@pk/ui';

/** Whole-number discount for display only; floor so we never overstate a saving. */
export function discountPercent(pricePaise: number, comparePricePaise: number | null): number | null {
  if (comparePricePaise === null || comparePricePaise <= pricePaise) return null;
  return Math.floor(((comparePricePaise - pricePaise) * 100) / comparePricePaise);
}

/**
 * Price + strike-through compare price + discount %. Prices are GST-inclusive MRP (D-26) — pass
 * `showTaxNote` where the Legal Metrology "MRP incl. of all taxes" line must be visible.
 */
export function PriceTag({
  pricePaise,
  comparePricePaise,
  size = 'md',
  showTaxNote = false,
  className,
}: {
  pricePaise: number;
  comparePricePaise: number | null;
  size?: 'sm' | 'md' | 'lg';
  showTaxNote?: boolean;
  className?: string;
}) {
  const off = discountPercent(pricePaise, comparePricePaise);
  return (
    <div className={cn('grid gap-0.5', className)}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="sr-only">{showTaxNote ? 'MRP' : 'Price'}</span>
        <span
          className={cn(
            'font-semibold text-foreground tabular-nums',
            size === 'sm' && 'text-base',
            size === 'md' && 'text-2xl leading-none tracking-tight',
            size === 'lg' && 'text-3xl',
          )}
        >
          {formatINR(pricePaise, { trimZeroPaise: true })}
        </span>
        {off !== null && comparePricePaise !== null && (
          <>
            <span className="text-sm text-muted-foreground tabular-nums line-through">
              <span className="sr-only">Was </span>
              {formatINR(comparePricePaise, { trimZeroPaise: true })}
            </span>
            {/* Solid chip: AA in both themes (white on pine-green / ink on mint) — the tinted one read as faint */}
            <span className="self-center rounded-full bg-success px-2 py-0.5 text-xs leading-4 font-semibold text-success-foreground tabular-nums">
              {off}% off
            </span>
          </>
        )}
      </p>
      {showTaxNote && <p className="text-xs text-muted-foreground">MRP inclusive of all taxes</p>}
    </div>
  );
}
