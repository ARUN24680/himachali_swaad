import type { OrderStatus } from '@pk/shared/order';

/** Customer-facing wording for order statuses (the StatusBadge tone comes from @pk/ui). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  EXPIRED: 'Payment window ended',
  CONFIRMED: 'Confirmed',
  AWAITING_PACKING: 'Being packed',
  PACKED: 'Packed',
  PICKUP_SCHEDULED: 'Pickup scheduled',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERY_FAILED: 'Delivery attempt failed',
  DELIVERED: 'Delivered',
  RTO_IN_TRANSIT: 'Returning to us',
  RTO_DELIVERED: 'Returned to us',
  CANCELLED: 'Cancelled',
  LOST: 'Lost in transit',
};

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
