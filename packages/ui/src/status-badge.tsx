import { Badge, type BadgeProps } from './components/badge';

export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'neutral';

/**
 * Status → tone mapping lives ONLY here (Rules §1.4). Order + payment statuses per
 * architecture/07-order-state-machine.md (Phase 5); batch shelf status + product LIVE/DRAFT in Phase 3.
 *
 * `EXPIRED` is ambiguous: an expired *batch* is destructive, an expired *order* (unpaid, jars released)
 * is neutral (Rules §1.4). Pass `kind="order"` to read ORDER_STATUS_TONES first.
 */
export const STATUS_TONES: Record<string, StatusTone> = {
  // Orders (07 §1)
  PENDING_PAYMENT: 'neutral',
  CONFIRMED: 'success',
  AWAITING_PACKING: 'warning',
  PACKED: 'info',
  PICKUP_SCHEDULED: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERY_FAILED: 'warning',
  DELIVERED: 'success',
  RTO_IN_TRANSIT: 'warning',
  RTO_DELIVERED: 'neutral',
  CANCELLED: 'destructive',
  LOST: 'destructive',
  // Payments (07 §2)
  UNPAID: 'neutral',
  PAID: 'success',
  REFUND_PENDING: 'warning',
  PARTIALLY_REFUNDED: 'info',
  REFUNDED: 'info',
  // Batch shelf status (Phase 3 §3.6, D-24)
  FRESH: 'success',
  AGING: 'warning',
  NOT_SELLABLE: 'neutral',
  EXPIRED: 'destructive',
  // Product catalog status (Phase 3 §3.7)
  LIVE: 'success',
  DRAFT: 'neutral',
  // Storefront stock badge (D-49 d) — label carries the real count ("Only 4 jars left")
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  SOLD_OUT: 'neutral',
};

/** Order-only overrides for keys that mean something else elsewhere. */
export const ORDER_STATUS_TONES: Record<string, StatusTone> = {
  EXPIRED: 'neutral',
};

const humanize = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');

export function statusTone(status: string, kind?: 'order'): StatusTone {
  return (kind === 'order' ? ORDER_STATUS_TONES[status] : undefined) ?? STATUS_TONES[status] ?? 'neutral';
}

export function StatusBadge({
  status,
  label,
  kind,
  ...props
}: { status: string; label?: string; kind?: 'order' } & Omit<BadgeProps, 'tone' | 'children'>) {
  return (
    <Badge tone={statusTone(status, kind)} data-status={status} {...props}>
      {label ?? humanize(status)}
    </Badge>
  );
}
