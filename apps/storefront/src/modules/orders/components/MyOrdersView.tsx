'use client';

import type { MyOrderSummary } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Button, Skeleton, StatusBadge, buttonVariants, cn } from '@pk/ui';
import { ChevronLeft, ChevronRight, PackageOpen, RefreshCcw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { isApiError } from '@/lib/api-client';
import { orderStatusLabel } from '../lib/labels';
import { formatDay } from '@/modules/tracking';
import { MY_ORDERS_PAGE_SIZE, useMyOrders } from '../hooks/useMyOrders';
import { AccountGate, SignedOutState } from '@/modules/account';

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 pt-8 pb-16 md:px-8 lg:pt-12">{children}</div>;
}

function Heading({ phone }: { phone?: string | null }) {
  return (
    <header className="grid gap-2">
      <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">Your account</p>
      <h1 className="font-serif text-4xl leading-[1.1] font-medium text-foreground md:text-5xl">My orders</h1>
      {phone && (
        <p className="text-pretty text-muted-foreground">
          Orders placed with <span className="font-medium text-foreground tabular-nums">{phone}</span> — guest checkouts
          included.
        </p>
      )}
    </header>
  );
}

/** /account/orders (Phase 8 §8.3, D-18): paginated list for OTP-signed-in customers. */
export function MyOrdersView({ page }: { page: number }) {
  return (
    <Frame>
      <AccountGate
        skeleton={
          <>
            <Heading />
            <ListSkeleton />
          </>
        }
      >
        {(user) => (
          <>
            <Heading phone={user.phoneMasked?.replace(/^\+91/, '+91 ')} />
            <OrdersList page={page} />
          </>
        )}
      </AccountGate>
    </Frame>
  );
}

function OrdersList({ page }: { page: number }) {
  const query = useMyOrders(page, true);

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) {
    if (isApiError(query.error, 'UNAUTHENTICATED')) return <SignedOutState />;
    return (
      <StateMessage
        tone="error"
        icon={<WifiOff />}
        title="Couldn’t load your orders"
        description="Your orders are safe — we just couldn’t reach our server. Please try again."
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    );
  }

  const { orders, total } = query.data;
  const pages = Math.max(1, Math.ceil(total / MY_ORDERS_PAGE_SIZE));
  if (total === 0) {
    return (
      <StateMessage
        icon={<PackageOpen />}
        title="No orders yet"
        description="When you order with this number, every jar’s journey shows up here."
        action={
          <Link href="/products" className={buttonVariants()}>
            Shop the current batch
          </Link>
        }
        className="py-16"
      />
    );
  }
  if (orders.length === 0) {
    return (
      <StateMessage
        icon={<PackageOpen />}
        title="Nothing on this page"
        action={
          <Link href="/account/orders" className={buttonVariants({ variant: 'outline' })}>
            Back to page 1
          </Link>
        }
      />
    );
  }

  return (
    <div className={cn('grid gap-5 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
      <ul className="grid gap-3" data-testid="my-orders-list" aria-busy={query.isPlaceholderData || undefined}>
        {orders.map((o) => (
          <li key={o.orderCode}>
            <OrderRow order={o} />
          </li>
        ))}
      </ul>
      {pages > 1 && <Pagination page={page} pages={pages} />}
    </div>
  );
}

function OrderRow({ order }: { order: MyOrderSummary }) {
  const more = order.itemCount - 1;
  return (
    <Link
      href={`/account/orders/${order.orderCode}`}
      className="group grid gap-3 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-input hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-5"
      data-testid="my-order-row"
    >
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono font-semibold tracking-wider text-foreground">{order.orderCode}</span>
          <StatusBadge kind="order" status={order.status} label={orderStatusLabel(order.status)} />
        </div>
        <p className="truncate text-sm text-foreground">
          {order.firstItemTitle}
          {more > 0 && <span className="text-muted-foreground"> + {more} more</span>}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">Placed {formatDay(order.createdAt)}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 sm:border-0 sm:pt-0">
        <span className="font-semibold text-foreground tabular-nums">
          {formatINR(order.totalPaise, { trimZeroPaise: true })}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-foreground">
          View details
          <ChevronRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Pagination({ page, pages }: { page: number; pages: number }) {
  const href = (p: number) => (p === 1 ? '/account/orders' : `/account/orders?page=${p}`);
  const cls = buttonVariants({ variant: 'outline' });
  return (
    <nav aria-label="Order pages" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={cls} rel="prev">
          <ChevronLeft aria-hidden="true" />
          Newer
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground tabular-nums" aria-current="page">
        Page {page} of {pages}
      </p>
      {page < pages ? (
        <Link href={href(page + 1)} className={cls} rel="next">
          Older
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function ListSkeleton() {
  return (
    <ul role="status" aria-label="Loading your orders" className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-32" />
        </li>
      ))}
    </ul>
  );
}
