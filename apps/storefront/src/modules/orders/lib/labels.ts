import type { OrderStatus } from '@pk/shared/order';

export { ORDER_STATUS_LABEL, orderStatusLabel } from '@/lib/order-status';

/** Statuses after payment where the order is moving forward (success layout). */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'CONFIRMED',
  'AWAITING_PACKING',
  'PACKED',
  'PICKUP_SCHEDULED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
];

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(
    new Date(iso),
  );
