'use client';

import type { CartQuoteLine, CartQuoteResponse } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Button, NonVegMark, Skeleton, cn } from '@pk/ui';
import { AlertTriangle, Loader2, Pencil, RefreshCcw, Trash2, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProductImage } from '@/components/common/ProductImage';
import type { CartItem } from '@/modules/cart';

/**
 * Order summary (Phase 5 §5.4): server-quoted lines and totals only — nothing is priced in the
 * browser. Lines with a quote issue get a notice and (when unavailable) a Remove action.
 */
export function OrderSummary({
  items,
  quote,
  notices,
  syncing,
  loading,
  error,
  onRetry,
  onRemove,
  onEditCart,
  editable,
  footer,
  footerClassName,
}: {
  items: CartItem[];
  quote: CartQuoteResponse | undefined;
  notices: Record<string, string>;
  syncing: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onRemove: (productId: string) => void;
  onEditCart: () => void;
  /** False once an order is reserved (the cart is locked to that order). */
  editable: boolean;
  footer?: ReactNode;
  /** e.g. `hidden lg:block` when the footer is desktop-only (phones use the sticky pay bar). */
  footerClassName?: string;
}) {
  const lines = new Map<string, CartQuoteLine>((quote?.items ?? []).map((l) => [l.productId, l]));
  const count = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <section
      aria-labelledby="summary-title"
      className="rounded-lg border border-border bg-card"
      data-testid="order-summary"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <h2
          id="summary-title"
          className="flex items-baseline gap-2 font-serif text-xl font-medium whitespace-nowrap text-foreground"
        >
          Order summary
          <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground tabular-nums">
            {count} {count === 1 ? 'jar' : 'jars'}
          </span>
        </h2>
        {editable && (
          <Button type="button" variant="ghost" size="sm" onClick={onEditCart} className="h-11 text-accent-foreground">
            <Pencil aria-hidden="true" />
            Edit cart
          </Button>
        )}
      </div>

      {error && !quote ? (
        <div role="alert" className="grid justify-items-start gap-3 px-4 py-6 sm:px-6">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <WifiOff aria-hidden="true" className="size-4" />
            Couldn&rsquo;t load live prices
          </p>
          <p className="text-sm text-muted-foreground">
            We check every price and jar count with our kitchen before you pay.
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : loading || !quote ? (
        <SummarySkeleton count={items.length} />
      ) : (
        <>
          <ul className="divide-y divide-border px-4 sm:px-6" aria-label="Items in your order">
            {items.map((item) => {
              const line = lines.get(item.productId);
              if (!line) return <LineSkeleton key={item.productId} />;
              return (
                <SummaryLine
                  key={item.productId}
                  line={line}
                  notice={notices[item.productId] ?? null}
                  onRemove={editable ? () => onRemove(item.productId) : undefined}
                />
              );
            })}
          </ul>
          <dl className="grid gap-2 border-t border-border px-4 py-4 text-sm sm:px-6" aria-busy={syncing}>
            <Row label="Subtotal" value={formatINR(quote.subtotalPaise, { trimZeroPaise: true })} />
            {quote.discountPaise > 0 && (
              <Row label="Discount" value={`− ${formatINR(quote.discountPaise, { trimZeroPaise: true })}`} />
            )}
            <Row
              label="Shipping"
              value={
                quote.shippingFeePaise === 0 ? (
                  <span className="font-medium text-success">Free</span>
                ) : (
                  formatINR(quote.shippingFeePaise, { trimZeroPaise: true })
                )
              }
            />
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="font-semibold text-foreground">Total</dt>
              <dd
                className="flex items-center gap-2 text-xl font-semibold text-foreground tabular-nums"
                data-testid="summary-total"
              >
                {syncing && (
                  <Loader2 aria-label="Updating total" className="size-4 animate-spin text-muted-foreground" />
                )}
                {formatINR(quote.totalPaise, { trimZeroPaise: true })}
              </dd>
            </div>
            <p className="text-xs text-muted-foreground">MRP inclusive of all taxes</p>
          </dl>
        </>
      )}
      {footer && <div className={cn('border-t border-border px-4 py-4 sm:px-6', footerClassName)}>{footer}</div>}
    </section>
  );
}

function SummaryLine({
  line,
  notice,
  onRemove,
}: {
  line: CartQuoteLine;
  notice: string | null;
  onRemove: (() => void) | undefined;
}) {
  const unavailable = line.issue === 'OUT_OF_STOCK' || line.issue === 'INACTIVE';
  const title = line.title ?? 'Unavailable product';
  const message = notice ?? (unavailable ? 'No longer available' : null);
  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-3 py-4" data-testid="summary-line">
      <div className={cn('overflow-hidden rounded-md border border-border', unavailable && 'opacity-60 grayscale')}>
        <ProductImage src={line.image} alt="" sizes="56px" />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-start gap-2">
          <NonVegMark size="sm" className="mt-0.5" />
          <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-foreground">{title}</p>
          {!unavailable && (
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {formatINR(line.lineTotalPaise, { trimZeroPaise: true })}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {line.netWeightG ? `${line.netWeightG} g · ` : ''}
          Qty {unavailable ? line.requestedQuantity : line.quantity} ×{' '}
          {formatINR(line.unitPricePaise, { trimZeroPaise: true })}
        </p>
        {message && (
          <div
            role="status"
            className={cn(
              'flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs font-medium',
              unavailable ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning',
            )}
          >
            <span className="flex items-start gap-1.5">
              <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {message}
            </span>
            {unavailable && onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${title} from order`}
                className="-my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function LineSkeleton() {
  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-3 py-4">
      <Skeleton className="aspect-square rounded-md" />
      <div className="grid content-start gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </li>
  );
}

export function SummarySkeleton({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Loading live prices">
      <ul className="divide-y divide-border px-4 sm:px-6">
        {Array.from({ length: Math.max(1, Math.min(count, 4)) }, (_, i) => (
          <LineSkeleton key={i} />
        ))}
      </ul>
      <div className="grid gap-2 border-t border-border px-4 py-4 sm:px-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-6 w-1/2 justify-self-end" />
      </div>
    </div>
  );
}
