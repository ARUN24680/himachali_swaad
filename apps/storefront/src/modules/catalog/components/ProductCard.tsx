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

/** The variant's own photo, else any photo of the recipe (a new 500 g jar may not have one yet). */
const photoFor = (product: ProductCardData, variants: ProductCardData[]) =>
  product.images[0] ?? variants.find((v) => v.images.length > 0)?.images[0];

/**
 * One product group (same recipe, 250 g ↔ 500 g jars). The weight pills swap price, stock, photo and
 * the link target in place; Add to cart is instant (local store).
 *
 * Anatomy: inset photo (framed like a jar label) → eyebrow + spice → title + description (height
 * reserved as one block) → hairline → price anchor + jar-size pills → Add to cart.
 *
 * `compact` (home quick-shop): 4:3 photo and a one-line description — same footer, shorter card.
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
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground',
        'transition-[translate,box-shadow,border-color] duration-300 ease-out motion-reduce:transition-none',
        '[@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:shadow-float',
        'motion-safe:[@media(hover:hover)]:hover:-translate-y-1',
        'has-[a:focus-visible]:border-ring',
      )}
      data-testid="product-card"
    >
      {/* The title link's ::after covers the whole card, so the photo needs no link of its own */}
      <div className="relative p-2 pb-0">
        <ProductImage
          src={photoFor(product, variants)}
          alt=""
          sizes={sizes}
          priority={priority}
          zoomOnHover
          className={cn('rounded-lg', compact && 'aspect-4/3', soldOut && 'opacity-60 grayscale-35')}
        />
        <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-card/90 py-1 pr-2.5 pl-1.5 text-xs font-medium text-card-foreground shadow-float ring-1 ring-border/70 backdrop-blur-sm">
          <NonVegMark size="md" />
          <span aria-hidden="true">Non-veg</span>
        </span>
        {product.stockBadge !== 'IN_STOCK' && (
          <StockBadge
            badge={product.stockBadge}
            sellable={product.sellableStock}
            className="absolute top-4 right-4 bg-card/95 shadow-float"
          />
        )}
      </div>

      <div className={cn('flex flex-1 flex-col', compact ? 'gap-1.5 p-4 pt-3.5' : 'gap-2 p-4 pt-4 sm:p-5 sm:pt-4')}>
        <div className="flex min-h-5 items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">
            {MEAT_LABEL[product.meatType]} pickle
          </p>
          {product.spiceLevel !== null && <SpiceLevel level={product.spiceLevel} size="sm" />}
        </div>

        {/*
          Title + description reserve their full height TOGETHER (2 title lines + 2 copy lines; compact:
          2 + 1), so the price sits on one baseline across a row while copy stays snug under a
          one-line title — any slack falls above the hairline, not between title and description.
        */}
        <div className={cn('flex flex-col gap-1.5', compact ? 'min-h-[4.9rem]' : 'min-h-[6.75rem]')}>
          <h3
            className={cn(
              'line-clamp-2 font-serif leading-snug font-medium text-balance',
              compact ? 'text-lg' : 'text-xl',
            )}
          >
            <Link
              href={href}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:group-hover:text-accent-foreground"
            >
              {product.title}
            </Link>
          </h3>
          {product.shortDescription && (
            <p
              className={cn('text-sm leading-relaxed text-muted-foreground', compact ? 'line-clamp-1' : 'line-clamp-2')}
            >
              {product.shortDescription}
            </p>
          )}
        </div>

        <div className={cn('mt-auto grid gap-3 border-t border-border', compact ? 'pt-3' : 'pt-4')}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <PriceTag pricePaise={product.pricePaise} comparePricePaise={product.comparePricePaise} />
            <SizeRow variants={variants} selected={product} onSelect={setSelectedId} />
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
      </div>
    </article>
  );
}

/** Pill frame shared by the toggle and the single-size chip, so both sit at the same 32px height. */
const PILL_FRAME = 'inline-flex h-8 shrink-0 items-center rounded-full';

/**
 * Jar size. Two or more jars → small segmented pills (Radix ToggleGroup: radios, arrow-key roving
 * focus); each pill is 32px to look light but its hit area extends to 44px (Rules §1.1). One jar →
 * a quiet outlined "250 g" chip in the same frame: a fact, not a control (no focus stop, no hover).
 * The selected / only weight is the card's net-quantity declaration.
 */
function SizeRow({
  variants,
  selected,
  onSelect,
}: {
  variants: ProductCardData[];
  selected: ProductCardData;
  onSelect: (id: string) => void;
}) {
  if (variants.length > 1) {
    return (
      <ToggleGroup
        type="single"
        value={selected.id}
        onValueChange={(id) => id && onSelect(id)}
        aria-label={`Jar size for ${selected.title}`}
        className={cn(PILL_FRAME, 'relative z-10 w-auto gap-0.5 border-border bg-muted p-0.5')}
      >
        {variants.map((v) => (
          <ToggleGroupItem
            key={v.id}
            value={v.id}
            aria-label={`${formatWeight(v.netWeightG)} jar`}
            className={cn(
              'relative min-h-0 flex-none self-stretch rounded-full px-3 text-xs',
              // Invisible hit-area extension: 28px pill → 44px tap target
              "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
              'data-[state=on]:bg-card data-[state=on]:shadow-none data-[state=on]:ring-border',
            )}
          >
            <span className="tabular-nums">{formatWeight(v.netWeightG)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  }

  return (
    // No z-10: a click on the static chip falls through to the title link's card-wide ::after.
    <p
      className={cn(PILL_FRAME, 'border border-border px-3 text-xs font-medium text-muted-foreground')}
      data-testid="product-card-size"
    >
      <span className="sr-only">Jar size </span>
      <span className="tabular-nums">{formatWeight(selected.netWeightG)}</span>
      <span className="sr-only">, only size available</span>
    </p>
  );
}
