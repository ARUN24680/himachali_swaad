'use client';

import type { TrackResponse } from '@pk/shared';
import { Alert, Skeleton, cn } from '@pk/ui';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { JourneyTimeline } from './JourneyTimeline';
import { ArrivalPanel, CourierCard, RefundCard, ShipmentHeader, ShipmentItems, hasArrivalPanel } from './ShipmentParts';
import { SupportCta } from './SupportCta';

/**
 * Full tracking view for one order — used by /track and (with totals + actions in `itemsFooter`)
 * by /account/orders/[orderCode]. Story first (status, date, journey), details after.
 */
export function TrackResult({
  order,
  headingAs = 'h2',
  headerAction,
  itemsFooter,
}: {
  order: TrackResponse;
  headingAs?: 'h1' | 'h2';
  headerAction?: ReactNode;
  itemsFooter?: ReactNode;
}) {
  const failed = order.status === 'DELIVERY_FAILED';
  const arrival = hasArrivalPanel(order);
  return (
    <div className="grid gap-6" data-testid="track-result">
      <div
        className={cn('grid gap-6', arrival && 'md:grid-cols-[minmax(0,1fr)_17rem] lg:grid-cols-[minmax(0,1fr)_20rem]')}
      >
        <ShipmentHeader order={order} as={headingAs} action={headerAction} />
        <ArrivalPanel order={order} />
      </div>

      {failed && (
        <Alert tone="warning" className="text-foreground" data-testid="delivery-failed">
          <TriangleAlert aria-hidden="true" />
          <span>
            The courier tried to deliver but couldn&rsquo;t complete it. They usually re-attempt on the next working
            day. Phone unreachable or address needs a fix? Chat with us and we&rsquo;ll sort it out with the courier.
          </span>
        </Alert>
      )}
      <RefundCard order={order} />

      <section
        aria-labelledby="journey-title"
        className="grid gap-5 rounded-lg border border-border bg-card p-5 sm:p-7"
      >
        <div className="grid gap-1">
          <h2 id="journey-title" className="font-serif text-xl font-medium text-foreground sm:text-2xl">
            Your parcel&rsquo;s journey
          </h2>
          <p className="text-sm text-muted-foreground">From our Himachal kitchen to your door. Times in IST.</p>
        </div>
        <JourneyTimeline order={order} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ShipmentItems order={order} footer={itemsFooter} />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
          {failed && <SupportCta orderCode={order.orderCode} emphasis />}
          <CourierCard order={order} />
          {!failed && <SupportCta orderCode={order.orderCode} />}
        </div>
      </div>
    </div>
  );
}

/** Mirrors TrackResult's layout so nothing jumps when the data lands. */
export function TrackResultSkeleton({ label = 'Looking up your order' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-6" data-testid="track-skeleton">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:p-7">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full max-w-sm" />
          <Skeleton className="h-12 w-56" />
        </div>
        <Skeleton className="h-40 rounded-lg md:h-auto" />
      </div>
      <div className="grid gap-6 rounded-lg border border-border bg-card p-5 sm:p-7 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 lg:grid lg:gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
