'use client';

import type { MyOrderDetail } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Button, buttonVariants } from '@pk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, PackageSearch, RefreshCcw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { isApiError } from '@/lib/api-client';
import { CancelOrderButton, InvoiceButton } from './OrderActions';
import { TrackResult, TrackResultSkeleton, formatDay } from '@/modules/tracking';
import { myOrderKeys, useMyOrder } from '../hooks/useMyOrders';
import { AccountGate, SignedOutState } from '@/modules/account';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-6 pb-16 md:px-8 lg:pt-10">
      <Link
        href="/account/orders"
        className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All orders
      </Link>
      {children}
    </div>
  );
}

/** /account/orders/[orderCode] (Phase 8 §8.3): the /track view + money, invoice and cancel for the owner. */
export function MyOrderDetailView({ orderCode }: { orderCode: string }) {
  return (
    <Frame>
      <AccountGate skeleton={<TrackResultSkeleton label="Loading your order" />}>
        {() => <Detail orderCode={orderCode} />}
      </AccountGate>
    </Frame>
  );
}

function Detail({ orderCode }: { orderCode: string }) {
  const query = useMyOrder(orderCode, true);
  const queryClient = useQueryClient();

  if (query.isPending) return <TrackResultSkeleton label="Loading your order" />;
  if (query.isError) {
    if (isApiError(query.error, 'UNAUTHENTICATED')) return <SignedOutState />;
    if (isApiError(query.error, 'NOT_FOUND') || isApiError(query.error, 'FORBIDDEN')) {
      return (
        <StateMessage
          icon={<PackageSearch />}
          title="This order isn’t in your account"
          description={`We couldn’t find ${orderCode} for the number you signed in with. If someone else placed it, track it with their phone number.`}
          action={
            <>
              <Link href="/account/orders" className={buttonVariants()}>
                See my orders
              </Link>
              <Link href={`/track?code=${orderCode}`} className={buttonVariants({ variant: 'outline' })}>
                Track with phone
              </Link>
            </>
          }
        />
      );
    }
    return (
      <StateMessage
        tone="error"
        icon={<WifiOff />}
        title="Couldn’t load your order"
        description="Your order is safe — we just couldn’t reach our server. Please try again."
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    );
  }

  const order = query.data;
  return (
    <TrackResult
      order={order}
      headingAs="h1"
      headerAction={
        <span className="text-xs text-muted-foreground tabular-nums">Placed {formatDay(order.createdAt)}</span>
      }
      itemsFooter={
        <OrderMoney
          order={order}
          onCancelled={() => void queryClient.invalidateQueries({ queryKey: myOrderKeys.all })}
        />
      }
    />
  );
}

function OrderMoney({ order, onCancelled }: { order: MyOrderDetail; onCancelled: () => void }) {
  const inr = (p: number) => formatINR(p, { trimZeroPaise: true });
  return (
    <div className="grid gap-4">
      <dl className="grid gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-foreground tabular-nums">{inr(order.subtotalPaise)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="text-foreground tabular-nums">
            {order.shippingFeePaise === 0 ? (
              <span className="font-medium text-success">Free</span>
            ) : (
              inr(order.shippingFeePaise)
            )}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <dt className="font-semibold text-foreground">{order.paymentStatus === 'UNPAID' ? 'Total' : 'Total paid'}</dt>
          <dd className="text-xl font-semibold text-foreground tabular-nums" data-testid="my-order-total">
            {inr(order.totalPaise)}
          </dd>
        </div>
        <p className="text-xs text-muted-foreground">MRP inclusive of all taxes</p>
      </dl>
      {(order.invoiceAvailable || order.canCancel) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-t border-border pt-4">
          {order.invoiceAvailable && <InvoiceButton orderCode={order.orderCode} phone={undefined} />}
          {order.canCancel && <CancelOrderButton orderCode={order.orderCode} onCancelled={onCancelled} />}
        </div>
      )}
    </div>
  );
}
