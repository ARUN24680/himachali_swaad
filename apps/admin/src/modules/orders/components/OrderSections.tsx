import { formatINR, type AdminOrderDetail, type TimelineEntry } from '@pk/shared';
import { Badge, StatusBadge, cn } from '@pk/ui';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatCalendarDate, formatDateTimeFull } from '@/lib/dates';
import { formatPhone, humanize, REFUND_REASON_LABEL, TEMPLATE_LABEL, whatsappUrl } from './orderMeta';

/** Titled block inside the order drawer. */
export function DetailBlock({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Label / value rows (definition list). */
export function Facts({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
    {children}
  </p>
);

const DOT: Record<TimelineEntry['tone'], string> = {
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

/** Customer-facing milestones (same TimelineEntry + tones as /track, D-55). */
export function OrderTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <Empty>No milestones yet.</Empty>;
  return (
    <ol className="grid">
      {entries.map((e, i) => (
        <li key={`${e.key}-${e.at}`} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-4 last:pb-0">
          {i < entries.length - 1 && (
            <span aria-hidden="true" className="absolute top-4 bottom-0 left-[0.5625rem] w-px bg-border" />
          )}
          <span aria-hidden="true" className={cn('mt-1.5 size-3 rounded-full ring-4 ring-card', DOT[e.tone])} />
          <div className="grid gap-0.5">
            <p className="text-sm font-medium">{e.label}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatDateTimeFull(e.at)}
              {e.detail && <> · {e.detail}</>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CustomerBlock({ d }: { d: AdminOrderDetail }) {
  const { customer, shippingAddress: a } = d;
  const linkClass =
    'inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4';
  return (
    <DetailBlock title="Customer">
      <div className="grid gap-1">
        <p className="font-medium">{customer.name}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatPhone(customer.phone)}
          {customer.email && <> · {customer.email}</>}
        </p>
        <p className="text-xs text-muted-foreground">
          {customer.userId ? 'Has an account' : 'Guest checkout'} · WhatsApp updates{' '}
          {d.order.whatsappOptIn ? 'on' : 'off'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappUrl(
            customer.phone,
            `Hi ${customer.name.split(' ')[0]}, about your Pahadi Khatki order ${d.order.orderCode}`,
          )}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          <MessageCircle aria-hidden="true" />
          WhatsApp
        </a>
        <a href={`tel:${customer.phone}`} className={linkClass}>
          <Phone aria-hidden="true" />
          Call
        </a>
        {customer.email && (
          <a href={`mailto:${customer.email}`} className={linkClass}>
            <Mail aria-hidden="true" />
            Email
          </a>
        )}
      </div>
      <address className="rounded-lg bg-muted/60 px-4 py-3 text-sm leading-relaxed not-italic">
        <span className="font-medium">{a.fullName}</span> · <span className="tabular-nums">{formatPhone(a.phone)}</span>
        <br />
        {a.line1}
        {a.line2 && <>, {a.line2}</>}
        {a.landmark && (
          <>
            <br />
            Near {a.landmark}
          </>
        )}
        <br />
        {a.city}, {a.state} – <span className="tabular-nums">{a.pincode}</span>
      </address>
    </DetailBlock>
  );
}

export function ItemsBlock({ d }: { d: AdminOrderDetail }) {
  const o = d.order;
  return (
    <DetailBlock
      title="Items & batches"
      aside={<span className="text-xs text-muted-foreground">{d.kitchen.name}</span>}
    >
      <ul className="grid gap-3">
        {d.items.map((it) => (
          <li key={it.sku} className="grid gap-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{it.title}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {it.sku} · {it.quantity} × {formatINR(it.unitPricePaise)}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{formatINR(it.totalPricePaise)}</span>
            </div>
            {it.allocations.length > 0 ? (
              <ul className="grid gap-1.5">
                {it.allocations.map((al) => (
                  <li key={al.batchCode} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge tone="batch">{al.batchCode}</Badge>
                    <span className="tabular-nums">
                      × {al.quantity} · made {formatCalendarDate(al.manufacturedAt)} · exp{' '}
                      {formatCalendarDate(al.expiryDate)}
                    </span>
                    <StatusBadge status={al.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No batch allocated yet.</p>
            )}
          </li>
        ))}
      </ul>
      <dl className="grid gap-1.5 rounded-lg bg-muted/60 px-4 py-3 text-sm tabular-nums">
        {(
          [
            ['Subtotal', formatINR(o.subtotalPaise)],
            ['Shipping', o.shippingFeePaise ? formatINR(o.shippingFeePaise) : 'Free'],
            ...(o.discountPaise ? ([['Discount', `− ${formatINR(o.discountPaise)}`]] as const) : []),
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
          <dt>Total (incl. GST)</dt>
          <dd>{formatINR(o.totalPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <dt>GST included</dt>
          <dd>{formatINR(o.taxPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <dt>Still refundable</dt>
          <dd>{formatINR(d.refundablePaise)}</dd>
        </div>
      </dl>
    </DetailBlock>
  );
}

export function StatusLogBlock({ d }: { d: AdminOrderDetail }) {
  return (
    <DetailBlock title="Status log">
      {d.statusLog.length === 0 ? (
        <Empty>No status changes recorded.</Empty>
      ) : (
        <ol className="grid gap-2">
          {d.statusLog.map((s) => (
            <li key={`${s.to}-${s.at}`} className="grid gap-1 rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                {s.from && (
                  <>
                    <StatusBadge status={s.from} kind="order" />
                    <span aria-hidden="true" className="text-muted-foreground">
                      →
                    </span>
                    <span className="sr-only">to</span>
                  </>
                )}
                <StatusBadge status={s.to} kind="order" />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatDateTimeFull(s.at)} · {s.actor}
                {s.reason && <> · {s.reason}</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </DetailBlock>
  );
}

export function PaymentsBlock({ d }: { d: AdminOrderDetail }) {
  return (
    <>
      <DetailBlock title="Payments">
        {d.payments.length === 0 ? (
          <Empty>No payment attempts.</Empty>
        ) : (
          <ul className="grid gap-2">
            {d.payments.map((p) => (
              <li key={p.id} className="grid gap-1 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums">{formatINR(p.amountPaise)}</span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {p.method ? humanize(p.method.toUpperCase()) : 'Method unknown'} ·{' '}
                  <span className="font-mono">{p.gatewayPaymentId ?? 'no gateway id'}</span> ·{' '}
                  {formatDateTimeFull(p.createdAt)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Gateway fee{' '}
                  {p.feePaise == null
                    ? 'not reported yet'
                    : `${formatINR(p.feePaise)} + GST ${formatINR(p.feeTaxPaise ?? 0)}`}
                  {p.errorCode && <span className="text-destructive"> · {p.errorCode}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DetailBlock>
      <DetailBlock title="Refunds">
        {d.refunds.length === 0 ? (
          <Empty>No refunds.</Empty>
        ) : (
          <ul className="grid gap-2">
            {d.refunds.map((r) => (
              <li key={r.id} className="grid gap-1 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums">{formatINR(r.amountPaise)}</span>
                  <Badge
                    tone={r.status === 'PROCESSED' ? 'success' : r.status === 'FAILED' ? 'destructive' : 'warning'}
                  >
                    {humanize(r.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {REFUND_REASON_LABEL[r.reason as keyof typeof REFUND_REASON_LABEL] ?? humanize(r.reason)} ·{' '}
                  {formatDateTimeFull(r.createdAt)}
                  {r.processedAt && <> · settled {formatDateTimeFull(r.processedAt)}</>}
                </p>
                {r.notes && <p className="text-xs">{r.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </DetailBlock>
    </>
  );
}

const grams = (g: number | null) => (g == null ? '—' : `${g} g`);

export function ShipmentBlock({ d }: { d: AdminOrderDetail }) {
  const s = d.shipment;
  if (!s) return <Empty>No shipment yet — it’s booked automatically after payment.</Empty>;
  return (
    <>
      <DetailBlock title="Shipment">
        <Facts
          rows={[
            ['Courier', s.courierName ?? 'Not assigned'],
            ['AWB', s.awbCode ? <span className="font-mono">{s.awbCode}</span> : '—'],
            ['Status', s.lastStatus ?? '—'],
            ['ETD', s.etd ?? '—'],
            ['Pickup', s.pickupScheduledFor ?? '—'],
            ['Weight', `${grams(s.deadWeightG)} dead · ${grams(s.chargedWeightG)} charged`],
            ['Freight', s.freightPaise == null ? 'Not billed yet' : formatINR(s.freightPaise)],
            ...(s.rtoFreightPaise != null
              ? ([['RTO freight', formatINR(s.rtoFreightPaise)]] as [string, ReactNode][])
              : []),
            ['Booking attempts', String(s.bookingAttempts)],
          ]}
        />
        {s.lastError && (
          <p
            role="note"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Last error: {s.lastError}
          </p>
        )}
      </DetailBlock>
      <DetailBlock title="Courier scans">
        {s.trackingEvents.length === 0 ? (
          <Empty>No courier scans yet.</Empty>
        ) : (
          <ol className="grid gap-2">
            {s.trackingEvents.map((t) => (
              <li key={`${t.at}-${t.statusText}`} className="grid gap-0.5 border-l-2 border-border pl-3 text-sm">
                <span className="font-medium">{t.statusText}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTimeFull(t.at)}
                  {t.location && <> · {t.location}</>} · {t.source.toLowerCase()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </DetailBlock>
    </>
  );
}

export function NotificationsBlock({ d }: { d: AdminOrderDetail }) {
  return (
    <DetailBlock title="Messages sent">
      {d.notifications.length === 0 ? (
        <Empty>No messages sent for this order.</Empty>
      ) : (
        <ul className="grid gap-2">
          {d.notifications.map((n) => (
            <li
              key={`${n.template}-${n.channel}-${n.createdAt}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="grid min-w-0">
                <span className="font-medium">
                  {TEMPLATE_LABEL[n.template as keyof typeof TEMPLATE_LABEL] ?? humanize(n.template.toUpperCase())}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {humanize(n.channel)} · {n.recipient} · {formatDateTimeFull(n.createdAt)}
                </span>
                {n.error && <span className="text-xs text-destructive">{n.error}</span>}
              </span>
              <Badge
                tone={
                  n.status === 'SENT' || n.status === 'DELIVERED' || n.status === 'READ'
                    ? 'success'
                    : n.status === 'FAILED'
                      ? 'destructive'
                      : 'neutral'
                }
              >
                {humanize(n.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </DetailBlock>
  );
}
