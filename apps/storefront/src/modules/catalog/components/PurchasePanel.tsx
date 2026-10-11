'use client';

import type { ProductDetail } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Button, cn } from '@pk/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PriceTag } from '@/components/common/PriceTag';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { AddToCartButton, openCart } from '@/modules/cart';
import { formatWeight } from '../lib/format';
import { StockBadge } from './StockBadge';

/** Before the quote reports settings.max_qty_per_item, cap the picker here; the cart quote re-caps. */
const PICKER_MAX = 10;

/**
 * Variant links, MRP, stock, quantity and Add to cart. Below `md` a sticky thumb-reach bar takes over
 * once the inline button scrolls out of view (Rules §1.1).
 */
export function PurchasePanel({ product }: { product: ProductDetail }) {
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const inlineRef = useRef<HTMLDivElement>(null);
  const [inlineVisible, setInlineVisible] = useState(true);
  const soldOut = product.stockBadge === 'SOLD_OUT';
  const max = Math.max(1, Math.min(PICKER_MAX, product.sellableStock));

  useEffect(() => {
    const el = inlineRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInlineVisible(entry?.isIntersecting ?? true), {
      rootMargin: '0px 0px -40px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cartProduct = {
    productId: product.id,
    title: product.title,
    netWeightG: product.netWeightG,
    pricePaise: product.pricePaise,
    soldOut,
  };
  const onAdded = () => setJustAdded(true);

  return (
    <div className="grid gap-5">
      {product.variants.length > 1 && (
        <nav aria-label="Jar size">
          <p className="mb-2 text-sm font-semibold text-foreground">Jar size</p>
          <ul className="grid grid-cols-2 gap-3">
            {product.variants.map((v) => {
              const current = v.id === product.id;
              return (
                <li key={v.id}>
                  <Link
                    href={`/products/${v.slug}`}
                    replace
                    scroll={false}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'relative grid min-h-11 gap-0.5 rounded-lg border p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      current
                        ? 'border-primary bg-accent ring-1 ring-primary'
                        : 'border-border bg-card hover:border-input hover:bg-accent/60',
                    )}
                  >
                    <span className="flex items-center justify-between font-semibold text-foreground tabular-nums">
                      {formatWeight(v.netWeightG)} jar
                      {current && <Check aria-hidden="true" className="size-4 text-accent-foreground" />}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      <PriceInline paise={v.pricePaise} />
                      {v.stockBadge === 'SOLD_OUT' && ' · Sold out'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <PriceTag pricePaise={product.pricePaise} comparePricePaise={product.comparePricePaise} size="lg" showTaxNote />
        <StockBadge badge={product.stockBadge} sellable={product.sellableStock} className="text-sm" />
      </div>

      <div ref={inlineRef} className="flex flex-wrap items-center gap-3">
        {!soldOut && (
          <QuantityStepper
            value={quantity}
            max={max}
            onChange={setQuantity}
            itemLabel={`${product.title}, ${formatWeight(product.netWeightG)}`}
          />
        )}
        <AddToCartButton
          product={cartProduct}
          quantity={quantity}
          onAdded={onAdded}
          size="lg"
          className="min-w-0 flex-1 basis-48"
        />
      </div>
      {justAdded && (
        <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-sm text-success">
          <Check aria-hidden="true" className="size-4" />
          In your cart.
          <Button variant="link" className="h-11 sm:h-auto" onClick={openCart}>
            View cart &amp; checkout
          </Button>
        </p>
      )}

      {/* Sticky mobile bar — appears when the inline button is off-screen */}
      <div
        aria-hidden={inlineVisible}
        inert={inlineVisible}
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float backdrop-blur transition-transform duration-300 motion-reduce:transition-none md:hidden',
          inlineVisible ? 'translate-y-full' : 'translate-y-0',
        )}
        data-testid="sticky-atc"
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {product.title} · {formatWeight(product.netWeightG)}
            </p>
            <p className="text-base font-semibold text-foreground tabular-nums">
              <PriceInline paise={product.pricePaise} />
              <span className="ml-1 text-xs font-normal text-muted-foreground">incl. taxes</span>
            </p>
          </div>
          <AddToCartButton
            product={cartProduct}
            quantity={quantity}
            onAdded={onAdded}
            size="lg"
            className="shrink-0"
            label="Add"
          />
        </div>
      </div>
    </div>
  );
}

function PriceInline({ paise }: { paise: number }) {
  return <>{formatINR(paise, { trimZeroPaise: true })}</>;
}
