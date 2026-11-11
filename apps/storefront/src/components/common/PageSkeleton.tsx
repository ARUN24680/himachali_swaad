import { Skeleton, cn } from '@pk/ui';

/**
 * Route-level loading shells (audit §3.5) for pages that had no `loading.tsx`. Each variant mirrors
 * the real page's first-paint footprint so navigation never jumps:
 * - `article`: eyebrow + serif title + lead + prose (about, FAQ, journal, legal)
 * - `form`: title + a card of fields (track, contact)
 * - `list`: title + stacked rows (my orders)
 */
export function PageSkeleton({
  variant = 'article',
  label = 'Loading',
  className,
}: {
  variant?: 'article' | 'form' | 'list';
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 md:px-8 md:py-14', className)}
    >
      <div className="grid max-w-2xl gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-3/4 md:h-12" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
      </div>
      {variant === 'article' && (
        <div className="grid max-w-3xl gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className={cn('h-4', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
          ))}
          <Skeleton className="mt-4 h-7 w-56" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={cn('h-4', i === 2 ? 'w-1/2' : 'w-full')} />
          ))}
        </div>
      )}
      {variant === 'form' && (
        <div className="grid max-w-xl gap-4 rounded-lg border border-border bg-card p-5 sm:p-6">
          {[0, 1].map((i) => (
            <div key={i} className="grid gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
          <Skeleton className="mt-2 h-12 w-full" />
        </div>
      )}
      {variant === 'list' && (
        <ul className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-24 rounded-sm" />
              </div>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
