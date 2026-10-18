import { Skeleton } from '@pk/ui';
import { FeaturedProductsSkeleton } from '@/modules/home';

/** Home loading shell — same hero + quick-shop footprint as the real page (no layout jump). */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <div className="bg-secondary">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-8 pb-14 md:grid-cols-2 md:gap-10 md:px-8 md:pt-10 md:pb-20">
          <div className="grid gap-5 md:gap-6">
            <Skeleton className="h-3 w-48 bg-secondary-foreground/15" />
            <Skeleton className="h-10 w-full bg-secondary-foreground/15 md:h-12" />
            <Skeleton className="h-10 w-4/5 bg-secondary-foreground/15 md:h-12" />
            <Skeleton className="h-5 w-full max-w-lg bg-secondary-foreground/15" />
            <div className="flex gap-3">
              <Skeleton className="h-12 w-40 bg-secondary-foreground/15" />
              <Skeleton className="h-12 w-32 bg-secondary-foreground/15" />
            </div>
          </div>
          <Skeleton className="mx-auto aspect-square w-full max-w-56 rounded-full bg-secondary-foreground/15 sm:max-w-xs md:max-w-sm" />
        </div>
      </div>
      <FeaturedProductsSkeleton />
    </div>
  );
}
