'use client';

import { formatINR, type CartQuoteLine } from '@pk/shared';
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  buttonVariants,
  cn,
} from '@pk/ui';
import { ArrowRight, Loader2, RefreshCcw, ShieldCheck, ShoppingBag, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { trackBeginCheckout } from '@/modules/analytics';
import { useCartQuote } from '../hooks/useCartQuote';
import { FALLBACK_MAX_QTY, selectCartCount, useCartStore, type CartItem } from '../store/cart.store';
import { useCartUiStore } from '../store/cart-ui.store';
import { CartLine } from './CartLine';
import { FreeShippingProgress } from './FreeShippingProgress';

interface Removed {
  item: CartItem;
  index: number;
  title: string;
}

const UNDO_MS = 6000;

/** D-15 cart drawer: bottom sheet on phones, right drawer from `sm`. Prices/stock come only from the quote. */
export function CartDrawer() {
  const open = useCartUiStore((s) => s.open);
  const setOpen = useCartUiStore((s) => s.setOpen);
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const count = useCartStore(selectCartCount);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const restore = useCartStore((s) => s.restore);
  const quote = useCartQuote(open && hydrated);

  const [removed, setRemoved] = useState<Removed | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const lines = new Map<string, CartQuoteLine>((quote.data?.items ?? []).map((l) => [l.productId, l]));
  const maxQty = quote.data?.maxQtyPerItem ?? FALLBACK_MAX_QTY;
  const blocked = items.some((i) => {
    const l = lines.get(i.productId);
    return l !== undefined && l.quantity === 0;
  });
  const onOpenChange = (next: boolean) => {
    if (!next) setRemoved(null);
    setOpen(next);
  };
  const close = () => onOpenChange(false);

  const onRemove = (item: CartItem, index: number, title: string) => {
    remove(item.productId);
    quote.clearNotice(item.productId);
    setRemoved({ item, index, title });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  };

  const onCheckout = () => {
    if (!quote.data) return;
    trackBeginCheckout(
      quote.data.items
        .filter((l) => l.quantity > 0)
        .map((l) => ({
          productId: l.productId,
          name: l.title ?? 'Product',
          variant: l.netWeightG ? `${l.netWeightG} g` : undefined,
          unitPricePaise: l.unitPricePaise,
          quantity: l.quantity,
        })),
      quote.data.totalPaise,
    );
    close();
  };

  const empty = hydrated && items.length === 0;
  const firstLoad = !quote.data && (quote.isPending || quote.isSyncing) && !quote.isError;

  let body;
  if (!hydrated) {
    body = <LinesSkeleton count={2} />;
  } else if (empty) {
    body = (
      <StateMessage
        icon={<ShoppingBag />}
        title={removed ? 'Your cart is empty now' : 'Your cart is empty'}
        description="Small batches sell out fast — pick a jar or two from this season's batch."
        action={
          <Link href="/products" onClick={close} className={buttonVariants()}>
            Shop pickles
          </Link>
        }
      />
    );
  } else if (quote.isError && !quote.data) {
    body = (
      <StateMessage
        tone="error"
        icon={<WifiOff />}
        title="Couldn't load live prices"
        description="We check every price and jar count with our kitchen before checkout. Please try again."
        action={
          <Button variant="outline" onClick={() => void quote.refetch()}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    );
  } else if (firstLoad) {
    body = <LinesSkeleton count={items.length} />;
  } else {
    body = (
      <div className="grid gap-4">
        <FreeShippingProgress
          thresholdPaise={quote.data?.freeShippingThresholdPaise ?? null}
          remainingPaise={quote.data?.freeShippingRemainingPaise ?? null}
        />
        <ul className="divide-y divide-border" aria-label="Items in your cart">
          {items.map((item, index) => {
            const line = lines.get(item.productId);
            if (!line) return <LineSkeleton key={item.productId} />;
            return (
              <CartLine
                key={item.productId}
                line={line}
                quantity={item.quantity}
                maxQtyPerItem={maxQty}
                notice={quote.notices[item.productId]}
                onQuantity={(q) => {
                  quote.clearNotice(item.productId);
                  setQuantity(item.productId, q);
                }}
                onRemove={() =>
                  onRemove(
                    item,
                    index,
                    line.title ? `${line.title}${line.netWeightG ? ` ${line.netWeightG} g` : ''}` : 'item',
                  )
                }
                onNavigate={close}
              />
            );
          })}
        </ul>
      </div>
    );
  }

  const data = quote.data;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="cart-description" closeLabel="Close cart" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle className="flex items-baseline gap-2">
            Your cart
            {count > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-sm font-medium text-muted-foreground tabular-nums">
                {count} {count === 1 ? 'jar' : 'jars'}
              </span>
            )}
          </SheetTitle>
          <SheetDescription id="cart-description">Prices and stock are checked live with our kitchen.</SheetDescription>
        </SheetHeader>

        <SheetBody>
          {removed && (
            <div
              role="status"
              className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/60 py-1 pr-1 pl-3 text-sm motion-safe:animate-in motion-safe:fade-in-0"
            >
              <span className="min-w-0 truncate">
                Removed <span className="font-medium">{removed.title}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 shrink-0 text-accent-foreground"
                onClick={() => {
                  restore(removed.item, removed.index);
                  setRemoved(null);
                }}
              >
                Undo
              </Button>
            </div>
          )}
          {body}
        </SheetBody>

        {!empty && hydrated && data && (
          <SheetFooter className="grid gap-3 sm:flex-col sm:justify-stretch">
            <dl className="grid gap-1.5 text-sm" aria-busy={quote.isSyncing}>
              <Row label="Subtotal" value={formatINR(data.subtotalPaise, { trimZeroPaise: true })} />
              {data.discountPaise > 0 && (
                <Row label="Discount" value={`− ${formatINR(data.discountPaise, { trimZeroPaise: true })}`} />
              )}
              <Row
                label="Shipping"
                value={data.shippingFeePaise === 0 ? 'Free' : formatINR(data.shippingFeePaise, { trimZeroPaise: true })}
              />
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="flex items-center gap-2 text-lg font-semibold text-foreground tabular-nums">
                  {quote.isSyncing && (
                    <Loader2 aria-label="Updating total" className="size-4 animate-spin text-muted-foreground" />
                  )}
                  {formatINR(data.totalPaise, { trimZeroPaise: true })}
                </dd>
              </div>
              <p className="text-xs text-muted-foreground">
                MRP inclusive of all taxes. Shipping is confirmed for your pincode at checkout.
              </p>
            </dl>
            {blocked && <p className="text-sm font-medium text-destructive">Remove unavailable items to continue.</p>}
            {blocked || quote.isSyncing ? (
              <Button size="lg" disabled className="w-full">
                Checkout
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Link href="/checkout" onClick={onCheckout} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
                Checkout
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5 text-success" />
              Prepaid orders · UPI, cards &amp; netbanking
            </p>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function LineSkeleton() {
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-3 py-4 sm:grid-cols-[5.5rem_1fr] sm:gap-4">
      <Skeleton className="aspect-square rounded-md" />
      <div className="grid content-start gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-2 h-11 w-32" />
      </div>
    </li>
  );
}

function LinesSkeleton({ count }: { count: number }) {
  return (
    <ul role="status" aria-label="Loading your cart" className="divide-y divide-border">
      {Array.from({ length: Math.max(1, Math.min(count, 4)) }, (_, i) => (
        <LineSkeleton key={i} />
      ))}
    </ul>
  );
}
