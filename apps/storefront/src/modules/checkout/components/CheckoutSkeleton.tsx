import { Skeleton } from '@pk/ui';
import { SummarySkeleton } from './OrderSummary';

/** First paint while the persisted cart rehydrates (mirrors the real two-column layout — no CLS). */
export function CheckoutSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading checkout"
      className="mx-auto w-full max-w-6xl px-4 pt-4 pb-40 md:px-8 lg:pt-8 lg:pb-16"
    >
      <div className="mb-6 grid gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-10">
        <div className="grid gap-5">
          {[3, 6, 3].map((fields, i) => (
            <div key={i} className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
              <Skeleton className="h-7 w-44" />
              {Array.from({ length: fields }, (_, j) => (
                <Skeleton key={j} className="h-11 w-full" />
              ))}
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <Skeleton className="h-7 w-40" />
          </div>
          <SummarySkeleton count={2} />
        </div>
      </div>
    </div>
  );
}
