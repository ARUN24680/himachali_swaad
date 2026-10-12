import { Skeleton } from '@pk/ui';

/** Card-shaped skeletons while the queue loads (Phase 7 §7.5). */
export function OrderListSkeleton({ label, cards = 2 }: { label: string; cards?: number }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex justify-between gap-3">
            <div className="grid gap-2">
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-7 w-40" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-24 rounded-md" />
          <div className="grid gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
          <Skeleton className="h-12 rounded-md" />
        </div>
      ))}
    </div>
  );
}
