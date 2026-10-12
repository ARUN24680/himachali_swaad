'use client';

import type { OrderStatusResponse } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { NonVegMark, StatusBadge, cn } from '@pk/ui';
import { Check, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { OrderCodeChip } from '@/components/common/OrderCodeChip';
import { ORDER_STATUS_LABEL } from '../lib/labels';

/** Hero block: eyebrow badge, serif headline, code chip, lead text, optional visual. */
export function OrderHero({
  order,
  icon,
  iconTone = 'neutral',
  title,
  statusLabel,
  children,
}: {
  order: OrderStatusResponse;
  /** Overrides the badge text (e.g. "Confirming payment" while the webhook is on its way). */
  statusLabel?: string;
  icon: ReactNode;
  iconTone?: 'success' | 'warning' | 'neutral' | 'destructive';
  title: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="order-title"
      className="relative overflow-hidden rounded-lg border border-border bg-card p-5 sm:p-8"
      data-testid="order-hero"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-full border [&_svg]:size-7',
            iconTone === 'success' && 'border-success/30 bg-success/15 text-success',
            iconTone === 'warning' && 'border-warning/30 bg-warning/15 text-warning',
            iconTone === 'destructive' && 'border-destructive/30 bg-destructive/10 text-destructive',
            iconTone === 'neutral' && 'border-border bg-muted text-accent-foreground',
          )}
        >
          {icon}
        </span>
        <div className="grid min-w-0 gap-3">
          <StatusBadge
            kind="order"
            status={order.status}
            label={statusLabel ?? ORDER_STATUS_LABEL[order.status]}
            className="w-fit"
            data-testid="order-status"
          />
          <h1
            id="order-title"
            className="font-serif text-3xl leading-tight font-medium text-balance text-foreground sm:text-4xl"
          >
            {title}
          </h1>
          <OrderCodeChip orderCode={order.orderCode} />
          {children && <div className="grid max-w-prose gap-2 text-pretty text-muted-foreground">{children}</div>}
        </div>
      </div>
    </section>
  );
}

/** Items + totals + "Delivering to <city>" (the full address is never returned to this page). */
export function OrderItemsCard({ order, footer }: { order: OrderStatusResponse; footer?: ReactNode }) {
  const jars = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section aria-labelledby="order-items-title" className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <h2 id="order-items-title" className="font-serif text-xl font-medium text-foreground">
          Your jars
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {jars} {jars === 1 ? 'jar' : 'jars'}
        </span>
      </div>
      <ul className="divide-y divide-border px-4 sm:px-6">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-start gap-3 py-3.5">
            <NonVegMark size="sm" className="mt-0.5" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {item.netWeightG} g · Qty {item.quantity} × {formatINR(item.unitPricePaise, { trimZeroPaise: true })}
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {formatINR(item.totalPricePaise, { trimZeroPaise: true })}
            </p>
          </li>
        ))}
      </ul>
      <dl className="grid gap-2 border-t border-border px-4 py-4 text-sm sm:px-6">
        <Row label="Subtotal" value={formatINR(order.subtotalPaise, { trimZeroPaise: true })} />
        <Row
          label="Shipping"
          value={
            order.shippingFeePaise === 0 ? (
              <span className="font-medium text-success">Free</span>
            ) : (
              formatINR(order.shippingFeePaise, { trimZeroPaise: true })
            )
          }
        />
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <dt className="font-semibold text-foreground">{order.paymentStatus === 'UNPAID' ? 'Total' : 'Total paid'}</dt>
          <dd className="text-xl font-semibold text-foreground tabular-nums" data-testid="order-total">
            {formatINR(order.totalPaise, { trimZeroPaise: true })}
          </dd>
        </div>
        <p className="text-xs text-muted-foreground">MRP inclusive of all taxes</p>
      </dl>
      <p className="flex items-center gap-2 border-t border-border bg-muted/50 px-4 py-3.5 text-sm text-foreground sm:px-6">
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-accent-foreground" />
        <span>
          Delivering to <span className="font-medium">{order.shippingCity}</span>
        </span>
      </p>
      {footer && <div className="border-t border-border px-4 py-4 sm:px-6">{footer}</div>}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/** Simple vertical "what happens next" list. `done` steps get a check, `current` a ring. */
export function StepList({
  steps,
}: {
  steps: { title: string; body: ReactNode; state: 'done' | 'current' | 'upcoming' }[];
}) {
  return (
    <ol className="grid gap-0">
      {steps.map((s, i) => (
        <li key={s.title} className="relative grid grid-cols-[2rem_1fr] gap-3 pb-6 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative grid size-8 place-items-center rounded-full border text-xs font-semibold tabular-nums',
              s.state === 'done' && 'border-success/30 bg-success/15 text-success',
              s.state === 'current' && 'border-ring bg-accent text-accent-foreground ring-2 ring-ring/30',
              s.state === 'upcoming' && 'border-border bg-card text-muted-foreground',
            )}
          >
            {s.state === 'done' ? <Check className="size-4" /> : i + 1}
          </span>
          <div className="grid gap-0.5 pt-1">
            <p className={cn('font-medium', s.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>
              {s.title}
              <span className="sr-only">
                {s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (in progress)' : ''}
              </span>
            </p>
            <div className="text-sm text-muted-foreground">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
