import type { ProductListResponse } from '@pk/shared';
import { Skeleton, cn } from '@pk/ui';
import { ProductCard } from './ProductCard';

/** 1 col phone · 2 col tablet · 3 col desktop (Phase 4 §4.4). One card per product group. */
export function ProductGrid({
  groups,
  priorityCount = 0,
  className,
}: {
  groups: ProductListResponse['groups'];
  priorityCount?: number;
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6', className)}>
      {groups
        .filter((g) => g.variants.length > 0)
        .map((g, i) => (
          <li key={g.productGroup}>
            <ProductCard variants={g.variants} priority={i < priorityCount} />
          </li>
        ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul role="status" aria-label="Loading pickles" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {Array.from({ length: count }, (_, i) => (
        // Mirrors ProductCard: inset photo → eyebrow → 2-line title → 2-line copy → price + pills → CTA
        <li key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-2 pb-0">
            <Skeleton className="aspect-square rounded-lg" />
          </div>
          <div className="grid gap-2 p-4 sm:p-5 sm:pt-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-1 h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-2 flex items-center justify-between border-t border-border pt-4">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
            <Skeleton className="mt-1 h-11 w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
