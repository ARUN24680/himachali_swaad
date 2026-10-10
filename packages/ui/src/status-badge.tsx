import { Badge, type BadgeProps } from './components/badge';

export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'neutral';

/**
 * Status → tone mapping lives ONLY here (Rules §1.4). Order statuses are added in Phase 5
 * (07-order-state-machine.md), batch freshness in Phase 3.
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
  // Batches
  FRESH: 'success',
  AGING: 'warning',
  EXPIRED: 'destructive',
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
