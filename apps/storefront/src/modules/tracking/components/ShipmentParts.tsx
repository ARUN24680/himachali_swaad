'use client';

import type { TrackResponse } from '@pk/shared';
import { formatINR } from '@pk/shared/money';
import { Alert, NonVegMark, StatusBadge, buttonVariants, cn } from '@pk/ui';
import { CalendarClock, Check, Copy, ExternalLink, House, RotateCcw, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { policy } from '@/config/site';
import { OrderCodeChip } from '@/components/common/OrderCodeChip';
import { orderStatusLabel } from '@/lib/order-status';
import { formatDay, formatWhen } from '../lib/format';

type Shipment = TrackResponse;

/** Calm, customer-facing headline per order status (the badge carries the formal status). */
function headline(o: Shipment): string {
  const city = o.destinationCity;
  switch (o.status) {
    case 'CONFIRMED':
    case 'AWAITING_PACKING':
      return 'Confirmed — your jars are being packed';
    case 'PACKED':
    case 'PICKUP_SCHEDULED':
      return 'Packed, sealed and waiting for the courier';
    case 'IN_TRANSIT':
      return `On its way to ${city}`;
    case 'OUT_FOR_DELIVERY':
      return `Out for delivery in ${city} today`;
    case 'DELIVERY_FAILED':
      return 'The courier couldn’t deliver today';
    case 'DELIVERED':
      return `Delivered in ${city}`;
    case 'RTO_IN_TRANSIT':
      return 'Your parcel is on its way back to us';
    case 'RTO_DELIVERED':
      return 'Your parcel came back to us';
    case 'CANCELLED':
      return 'This order was cancelled';
    case 'LOST':
      return 'Your parcel went missing in transit';
    case 'PENDING_PAYMENT':
      return 'Waiting for payment confirmation';
    case 'EXPIRED':
      return 'Payment window ended';
    default:
      return orderStatusLabel(o.status);
  }
}

const ACTIVE = new Set([
  'CONFIRMED',
  'AWAITING_PACKING',
  'PACKED',
  'PICKUP_SCHEDULED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
]);

/** Status badge, story headline, first name + destination city (the only PII /track returns), order code. */
export function ShipmentHeader({
  order,
  as: Heading = 'h2',
  headingId = 'shipment-title',
  action,
}: {
  order: Shipment;
  as?: 'h1' | 'h2';
  headingId?: string;
  /** Top-right slot (e.g. Refresh). */
  action?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="grid content-start gap-4 rounded-lg border border-border bg-card p-5 sm:p-7"
      data-testid="shipment-header"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge
          kind="order"
          status={order.status}
          label={orderStatusLabel(order.status)}
          data-testid="shipment-status"
        />
        {action}
      </div>
      <div className="grid gap-2">
        <Heading
          id={headingId}
          tabIndex={-1}
          className="font-serif text-2xl leading-tight font-medium text-balance text-foreground outline-none sm:text-3xl"
        >
          {headline(order)}
        </Heading>
        <p className="text-pretty text-muted-foreground">
          Namaste <span className="font-medium text-foreground">{order.customerFirstName}</span> —{' '}
          {order.status === 'DELIVERED'
            ? 'your jars reached '
            : ACTIVE.has(order.status)
              ? 'your order is headed to '
              : 'order for delivery in '}
          <span className="font-medium text-foreground">{order.destinationCity}</span>.
        </p>
      </div>
      <OrderCodeChip orderCode={order.orderCode} />
    </section>
  );
}

/**
 * Deep-pine band with the date that matters most: the courier ETD while moving, the delivery day once
 * delivered. Renders nothing for cancelled / returned orders.
 */
export function hasArrivalPanel(order: Shipment): boolean {
  return order.status === 'DELIVERED'
    ? order.timeline.some((e) => e.key === 'DELIVERED')
    : ACTIVE.has(order.status) && !!order.etd;
}

export function ArrivalPanel({ order }: { order: Shipment }) {
  if (!hasArrivalPanel(order)) return null;
  const delivered = order.status === 'DELIVERED' ? order.timeline.findLast((e) => e.key === 'DELIVERED') : undefined;
  return (
    <section
      aria-label={delivered ? 'Delivery date' : 'Estimated delivery'}
      className="relative grid content-between gap-6 overflow-hidden rounded-lg bg-secondary p-5 text-secondary-foreground sm:p-7"
      data-testid="arrival-panel"
    >
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase opacity-80">
        {delivered ? (
          <House aria-hidden="true" className="size-4" />
        ) : (
          <CalendarClock aria-hidden="true" className="size-4" />
        )}
        {delivered ? 'Delivered on' : 'Estimated delivery'}
      </div>
      <p className="font-serif text-3xl leading-tight font-medium sm:text-4xl" data-testid="arrival-date">
        {formatDay(delivered ? delivered.at : (order.etd as string), { weekday: true, year: false })}
      </p>
      <p className="text-sm opacity-80">
        {delivered
          ? 'Store it somewhere cool and always use a dry spoon.'
          : 'Courier estimate — the date can shift by a day on mountain and remote routes.'}
      </p>
    </section>
  );
}

/** Jars with batch code + bottled date (FSSAI traceability, and the brand's small-batch story). */
export function ShipmentItems({ order, footer }: { order: Pick<Shipment, 'items'>; footer?: ReactNode }) {
  const jars = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section aria-labelledby="shipment-items-title" className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <h2 id="shipment-items-title" className="font-serif text-xl font-medium text-foreground">
          Your jars
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {jars} {jars === 1 ? 'jar' : 'jars'}
        </span>
      </div>
      <ul className="divide-y divide-border px-4 sm:px-6">
        {order.items.map((item, i) => (
          <li
            key={`${item.title}-${item.batchCode ?? i}`}
            className="flex items-start gap-3 py-4"
            data-testid="shipment-item"
          >
            <NonVegMark size="sm" className="mt-0.5" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {item.netWeightG} g · Qty {item.quantity}
              </p>
              {(item.batchCode || item.manufacturedAt) && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {item.batchCode && (
                    <span className="rounded-sm border border-tertiary/30 bg-tertiary/15 px-1.5 py-0.5 font-mono text-tertiary tabular-nums">
                      Batch {item.batchCode}
                    </span>
                  )}
                  {item.manufacturedAt && (
                    <span className="tabular-nums">Bottled in Himachal on {formatDay(item.manufacturedAt)}</span>
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {footer && <div className="border-t border-border px-4 py-4 sm:px-6">{footer}</div>}
    </section>
  );
}

/** Courier name, AWB (copyable) and the courier's own tracking page. */
export function CourierCard({ order }: { order: Pick<Shipment, 'courier' | 'status'> }) {
  const { courier } = order;
  return (
    <section
      aria-labelledby="courier-title"
      className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:p-6"
      data-testid="courier-card"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-muted text-accent-foreground [&_svg]:size-4.5"
        >
          <Truck />
        </span>
        <div className="grid min-w-0">
          <h2 id="courier-title" className="font-serif text-lg font-medium text-foreground">
            Courier
          </h2>
          <p className="truncate text-sm text-muted-foreground">{courier?.name ?? 'Courier partner'}</p>
        </div>
      </div>
      {courier ? (
        <>
          <div className="grid gap-1">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Air waybill (AWB)</p>
            <AwbCopy awb={courier.awb} />
          </div>
          <a
            href={courier.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            data-testid="courier-link"
          >
            Track on courier site
            <ExternalLink aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">
          {ACTIVE.has(order.status)
            ? 'The AWB number and courier link appear here as soon as your parcel is handed over.'
            : 'No courier shipment for this order.'}
        </p>
      )}
    </section>
  );
}

function AwbCopy({ awb }: { awb: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(awb);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the AWB is still selectable text
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 py-1 pr-1 pl-3">
      <span
        className="min-w-0 font-mono text-base font-semibold break-all text-foreground select-all"
        data-testid="awb"
      >
        {awb}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'AWB copied' : `Copy AWB ${awb}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4.5"
      >
        {copied ? <Check aria-hidden="true" className="text-success" /> : <Copy aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}

/** Refund state for cancelled / returned orders (amounts from integer paise). */
export function RefundCard({ order }: { order: Pick<Shipment, 'refund' | 'timeline'> }) {
  const { refund } = order;
  if (!refund) return null;
  const amount = formatINR(refund.amountPaise, { trimZeroPaise: true });
  const timeline = policy.refundTimeline ? `within ${policy.refundTimeline}` : 'within a few working days';
  const processedAt = order.timeline.findLast((e) => e.key === 'REFUND')?.at;
  const tone = refund.status === 'FAILED' ? 'warning' : refund.status === 'PROCESSED' ? 'success' : 'info';
  const text =
    refund.status === 'PROCESSED'
      ? `Refund of ${amount} completed${processedAt ? ` on ${formatWhen(processedAt)}` : ''}. Your bank may take a day or two to show it.`
      : refund.status === 'FAILED'
        ? `Your refund of ${amount} hit a snag at the bank. We’re retrying and our team has been alerted — no action needed from you.`
        : `Refund of ${amount} started to your original payment method. It usually arrives ${timeline}.`;
  return (
    <Alert tone={tone} role="status" className="text-foreground" data-testid="refund-card">
      <RotateCcw aria-hidden="true" />
      <span>{text}</span>
    </Alert>
  );
}
