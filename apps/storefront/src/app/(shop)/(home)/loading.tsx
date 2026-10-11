import { Skeleton } from '@pk/ui';

/** Home loading shell — same hero footprint as the real hero (no layout jump). */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <div className="bg-secondary">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 pb-32 md:grid-cols-[1.15fr_0.85fr] md:px-8 md:pt-16 md:pb-48">
          <div className="grid content-center gap-5">
            <Skeleton className="h-3 w-40 bg-secondary-foreground/15" />
            <Skeleton className="h-14 w-full bg-secondary-foreground/15" />
            <Skeleton className="h-14 w-4/5 bg-secondary-foreground/15" />
            <Skeleton className="h-12 w-56 bg-secondary-foreground/15" />
          </div>
          <Skeleton className="mx-auto aspect-[4/5] w-full max-w-60 rounded-t-full bg-secondary-foreground/15 sm:max-w-80 md:max-w-none" />
        </div>
      </div>
    </div>
  );
}
