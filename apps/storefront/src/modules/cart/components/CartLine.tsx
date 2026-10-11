'use client';

import { formatINR, multiplyPaise, type CartQuoteLine } from '@pk/shared';
import { NonVegMark, cn } from '@pk/ui';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ProductImage } from '@/components/common/ProductImage';
import { QuantityStepper } from '@/components/common/QuantityStepper';

/** One cart row: photo, non-veg mark, name + weight, live unit price, stepper, remove, server notice. */
export function CartLine({
  line,
  quantity,
  maxQtyPerItem,
  notice,
  onQuantity,
  onRemove,
  onNavigate,
}: {
  line: CartQuoteLine;
  /** Local (instant) quantity from the store. */
  quantity: number;
  maxQtyPerItem: number;
  notice: string | undefined;
  onQuantity: (q: number) => void;
  onRemove: () => void;
  onNavigate: () => void;
}) {
  const unavailable = line.issue === 'OUT_OF_STOCK' || line.issue === 'INACTIVE';
  const title = line.title ?? 'Unavailable product';
  const name = line.netWeightG ? `${title}, ${line.netWeightG} g` : title;
  const max = Math.max(1, Math.min(maxQtyPerItem, line.availableQuantity));

  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-3 py-4 sm:grid-cols-[5.5rem_1fr] sm:gap-4" data-testid="cart-line">
      <div
        className={cn(
          'self-start overflow-hidden rounded-md border border-border',
          unavailable && 'opacity-60 grayscale',
        )}
      >
        <ProductImage src={line.image} alt="" sizes="88px" />
      </div>
      <div className="grid min-w-0 gap-2">
        <div className="flex items-start gap-2">
          <NonVegMark size="sm" className="mt-1" />
          <div className="min-w-0 flex-1">
            {line.slug ? (
              <Link
                href={`/products/${line.slug}`}
                onClick={onNavigate}
                className="line-clamp-2 rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {title}
              </Link>
            ) : (
              <p className="line-clamp-2 font-medium text-foreground">{title}</p>
            )}
            <p className="text-sm text-muted-foreground tabular-nums">
              {line.netWeightG ? `${line.netWeightG} g jar · ` : ''}
              {formatINR(line.unitPricePaise, { trimZeroPaise: true })} each
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name} from cart`}
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4.5"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>

        {notice && (
          <p
            role="status"
            className={cn(
              'flex items-start gap-1.5 rounded-sm px-2 py-1 text-xs font-medium',
              unavailable ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning',
            )}
          >
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {notice}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {unavailable ? (
            <span className="text-sm text-muted-foreground">Remove to continue</span>
          ) : (
            <QuantityStepper value={quantity} max={max} onChange={onQuantity} itemLabel={name} size="sm" />
          )}
          {!unavailable && (
            <span className="font-semibold text-foreground tabular-nums">
              {formatINR(multiplyPaise(line.unitPricePaise, quantity), { trimZeroPaise: true })}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
