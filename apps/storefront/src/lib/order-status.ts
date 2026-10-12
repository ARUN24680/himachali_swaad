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

/** Label for a status string from the API (unknown values fall back to a readable form). */
export const orderStatusLabel = (status: string): string =>
  ORDER_STATUS_LABEL[status as OrderStatus] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');
