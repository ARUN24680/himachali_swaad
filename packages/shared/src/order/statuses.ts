/**
 * Order + payment status vocabularies (architecture/07 §1–2, D-28). Zod-free so browser code can
 * import them via `@pk/shared/order`; the DB enums in migration 0003 must match these lists.
 */
export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'EXPIRED',
  'CONFIRMED',
  'AWAITING_PACKING',
  'PACKED',
  'PICKUP_SCHEDULED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'RTO_IN_TRANSIT',
  'RTO_DELIVERED',
  'CANCELLED',
  'LOST',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_ATTEMPT_STATUSES = ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED'] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export const ALLOCATION_STATUSES = ['RESERVED', 'COMMITTED', 'RELEASED'] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const REFUND_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const ACTOR_TYPES = ['SYSTEM', 'CUSTOMER', 'ADMIN', 'KITCHEN_PARTNER', 'RAZORPAY', 'SHIPROCKET'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Statuses after which nothing changes (EXPIRED is terminal except for a late payment, 07 §1). */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'RTO_DELIVERED', 'CANCELLED', 'LOST'];

export const REFUND_REASONS = [
  'CUSTOMER_CANCEL',
  'ADMIN_CANCEL',
  'LATE_PAYMENT_STOCKOUT',
  'AMOUNT_MISMATCH',
  'RTO',
  'DAMAGED',
  'LOST',
  /** A second captured payment on an already-paid order — refunded, order untouched. */
  'DUPLICATE_PAYMENT',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
