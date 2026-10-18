'use client';

import type { ProductCard as ProductCardData } from '@pk/shared';
import { NonVegMark, ToggleGroup, ToggleGroupItem, cn } from '@pk/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PriceTag } from '@/components/common/PriceTag';
import { ProductImage } from '@/components/common/ProductImage';
import { AddToCartButton } from '@/modules/cart';
import { MEAT_LABEL, formatWeight } from '../lib/format';
import { SpiceLevel } from './SpiceLevel';
import { StockBadge } from './StockBadge';

/** First variant that can be bought, else the lightest. */
const defaultVariant = (variants: ProductCardData[]) =>
  variants.find((v) => v.stockBadge !== 'SOLD_OUT') ?? variants[0]!;

/**
 * One product group (same recipe, 250 g ↔ 500 g jars). The weight toggle swaps price, stock and the
 * link target in place; Add to cart is instant (local store).
 *
 * `compact` (home quick-shop): 4:3 photo, one-line description, price and jar-size toggle share a
 * row — so price + Add to cart sit inside a short card instead of below a tall square image.
 */
export function ProductCard({
  variants,
  priority = false,
  compact = false,
  sizes = '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw',
}: {
  variants: ProductCardData[];
  priority?: boolean;
  compact?: boolean;
  sizes?: string;
}) {
  const [selectedId, setSelectedId] = useState(() => defaultVariant(variants).id);
  const product = variants.find((v) => v.id === selectedId) ?? variants[0]!;
  const href = `/products/${product.slug}`;
  const soldOut = product.stockBadge === 'SOLD_OUT';

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-shadow duration-300 [@media(hover:hover)]:hover:shadow-float',
        compact &&
          'transition-[box-shadow,border-color] has-[a:focus-visible]:border-ring [@media(hover:hover)]:hover:border-primary/50',
      )}
      data-testid="product-card"
    >
      {/* The title link's ::after covers the whole card, so the photo needs no link of its own */}
      <div className="relative">
        <ProductImage
          src={product.images[0]}
          alt=""
          sizes={sizes}
          priority={priority}
          zoomOnHover
          className={cn(compact && 'aspect-4/3', soldOut && 'opacity-70')}
        />
        <span className="absolute top-3 left-3 grid size-8 place-items-center rounded-md bg-card/95 shadow-float">
          <NonVegMark size="md" />
        </span>
        {product.stockBadge !== 'IN_STOCK' && (
          <StockBadge
            badge={product.stockBadge}
            sellable={product.sellableStock}
            className="absolute top-3 right-3 bg-card/95"
          />
        )}
      </div>

      <div className={cn('flex flex-1 flex-col', compact ? 'gap-2 p-4' : 'gap-3 p-4 sm:p-5')}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase">
            {MEAT_LABEL[product.meatType]} pickle
          </p>
          {product.spiceLevel !== null && <SpiceLevel level={product.spiceLevel} showWord={false} />}
        </div>
        <h3 className={cn('font-serif leading-snug font-medium', compact ? 'text-lg' : 'text-xl')}>
          <Link
            href={href}
            className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
          >
            {product.title}
          </Link>
        </h3>
        {product.shortDescription && (
          <p className={cn('text-sm text-muted-foreground', compact ? 'line-clamp-1' : 'line-clamp-2')}>
            {product.shortDescription}
          </p>
        )}

        {compact ? (
          <div className="mt-auto grid gap-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="grid">
                <PriceTag pricePaise={product.pricePaise} comparePricePaise={product.comparePricePaise} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  Net wt. {formatWeight(product.netWeightG)}
                </span>
              </div>
              {variants.length > 1 && (
                <ToggleGroup
                  type="single"
                  value={product.id}
                  onValueChange={(id) => id && setSelectedId(id)}
                  aria-label={`Jar size for ${product.title}`}
                  className="relative z-10 w-auto shrink-0"
                >
                  {variants.map((v) => (
                    <ToggleGroupItem
                      key={v.id}
                      value={v.id}
                      aria-label={`${formatWeight(v.netWeightG)} jar`}
                      className="px-2.5"
                    >
                      <span className="tabular-nums">{formatWeight(v.netWeightG)}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>
            {product.stockBadge === 'IN_STOCK' && <span className="sr-only">In stock</span>}
            <AddToCartButton
              className="relative z-10 w-full active:scale-[0.98] motion-reduce:active:scale-100"
              product={{
                productId: product.id,
                title: product.title,
                netWeightG: product.netWeightG,
                pricePaise: product.pricePaise,
                soldOut,
              }}
            />
          </div>
        ) : (
          <div className="mt-auto grid gap-3 pt-1">
            {variants.length > 1 && (
              <ToggleGroup
                type="single"
                value={product.id}
                onValueChange={(id) => id && setSelectedId(id)}
                aria-label={`Jar size for ${product.title}`}
                className="relative z-10"
              >
                {variants.map((v) => (
                  <ToggleGroupItem key={v.id} value={v.id} aria-label={`${formatWeight(v.netWeightG)} jar`}>
                    <span className="tabular-nums">{formatWeight(v.netWeightG)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <div className="flex items-end justify-between gap-3">
              <PriceTag pricePaise={product.pricePaise} comparePricePaise={product.comparePricePaise} />
              <span className="pb-1 text-xs text-muted-foreground tabular-nums">
                Net wt. {formatWeight(product.netWeightG)}
              </span>
            </div>
            {product.stockBadge === 'IN_STOCK' && <span className="sr-only">In stock</span>}
            <AddToCartButton
              className="relative z-10 w-full"
              product={{
                productId: product.id,
                title: product.title,
                netWeightG: product.netWeightG,
                pricePaise: product.pricePaise,
                soldOut,
              }}
            />
          </div>
        )}
      </div>
    </article>
  );
}
