import { Card, Skeleton } from '@pk/ui';

/** Mirrors the pay layout so nothing jumps when data arrives. */
export function PaySkeleton() {
  return (
    <div role="status" aria-label="Loading your payment" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card className="space-y-3 p-4 md:col-start-2 md:row-start-1 md:p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-48" />
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="space-y-3 p-4 md:col-start-2 md:row-start-2 md:p-6">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
        <Card className="flex flex-col items-center gap-3 p-4 md:col-start-1 md:row-span-3 md:row-start-1 md:p-8">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="aspect-square w-full max-w-64 md:max-w-80" />
        </Card>
        <Card className="space-y-3 p-4 md:col-start-2 md:row-start-3 md:p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
      <span className="sr-only">Loading your payment…</span>
    </div>
  );
}
