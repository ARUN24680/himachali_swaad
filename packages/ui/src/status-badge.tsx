import { Badge, type BadgeProps } from './components/badge';

export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'neutral';

/**
 * Status → tone mapping lives ONLY here (Rules §1.4). Order statuses are added in Phase 5
 * (07-order-state-machine.md); batch shelf status + product LIVE/DRAFT in Phase 3.
 * Note: `EXPIRED` means an expired batch here — an expired *order* (neutral, Rules §1.4) must pass
 * an explicit `label` + its own key when order statuses land in Phase 5.
 */
export const STATUS_TONES: Record<string, StatusTone> = {
  // Orders / payments
  DELIVERED: 'success',
  PAID: 'success',
  AWAITING_PACKING: 'warning',
  DELIVERY_FAILED: 'warning',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'info',
  CANCELLED: 'destructive',
  LOST: 'destructive',
  PENDING_PAYMENT: 'neutral',
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

const humanize = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');

export function StatusBadge({
  status,
  label,
  ...props
}: { status: string; label?: string } & Omit<BadgeProps, 'tone' | 'children'>) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} {...props}>
      {label ?? humanize(status)}
    </Badge>
  );
}
