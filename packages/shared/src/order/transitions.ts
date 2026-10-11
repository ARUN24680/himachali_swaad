import type { ActorType, OrderStatus, PaymentStatus } from './statuses';

/**
 * Allowed order transitions — exactly architecture/07 §1.2 (D-29). transitionOrder() refuses
 * anything not listed here with 409 ILLEGAL_TRANSITION.
 */
export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly ActorType[];
}

const rule = (from: OrderStatus, to: readonly OrderStatus[], actors: readonly ActorType[]): TransitionRule[] =>
  to.map((t) => ({ from, to: t, actors }));

export const ORDER_TRANSITIONS: readonly TransitionRule[] = [
  ...rule('PENDING_PAYMENT', ['CONFIRMED'], ['RAZORPAY', 'CUSTOMER']),
  ...rule('PENDING_PAYMENT', ['EXPIRED'], ['SYSTEM']),
  ...rule('EXPIRED', ['CONFIRMED'], ['RAZORPAY']),
  ...rule('EXPIRED', ['CANCELLED'], ['RAZORPAY']),
  ...rule('CONFIRMED', ['AWAITING_PACKING'], ['SYSTEM']),
  ...rule('CONFIRMED', ['CANCELLED'], ['CUSTOMER', 'ADMIN']),
  ...rule('AWAITING_PACKING', ['PACKED'], ['KITCHEN_PARTNER', 'ADMIN']),
  ...rule('AWAITING_PACKING', ['CANCELLED'], ['CUSTOMER', 'ADMIN']),
  ...rule('PACKED', ['PICKUP_SCHEDULED'], ['SYSTEM']),
  ...rule('PACKED', ['CANCELLED'], ['ADMIN']),
  ...rule('PICKUP_SCHEDULED', ['IN_TRANSIT'], ['SHIPROCKET']),
  ...rule('PICKUP_SCHEDULED', ['CANCELLED'], ['ADMIN']),
  ...rule('IN_TRANSIT', ['OUT_FOR_DELIVERY', 'DELIVERED', 'RTO_IN_TRANSIT', 'LOST'], ['SHIPROCKET']),
  ...rule('OUT_FOR_DELIVERY', ['DELIVERED', 'DELIVERY_FAILED', 'IN_TRANSIT'], ['SHIPROCKET']),
  ...rule('DELIVERY_FAILED', ['OUT_FOR_DELIVERY', 'RTO_IN_TRANSIT'], ['SHIPROCKET', 'ADMIN']),
  ...rule('RTO_IN_TRANSIT', ['RTO_DELIVERED', 'LOST'], ['SHIPROCKET']),
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): boolean {
  return ORDER_TRANSITIONS.some((r) => r.from === from && r.to === to && r.actors.includes(actor));
}

/** Statuses an actor may cancel from (07 §1.2: customer only before packing). */
export function cancellableBy(actor: 'CUSTOMER' | 'ADMIN'): OrderStatus[] {
  return ORDER_TRANSITIONS.filter((r) => r.to === 'CANCELLED' && r.actors.includes(actor)).map((r) => r.from);
}

/** Payment summary transitions — architecture/07 §2. */
export const PAYMENT_TRANSITIONS: readonly { from: PaymentStatus; to: PaymentStatus }[] = [
  { from: 'UNPAID', to: 'PAID' },
  { from: 'PAID', to: 'REFUND_PENDING' },
  { from: 'REFUND_PENDING', to: 'PARTIALLY_REFUNDED' },
  { from: 'REFUND_PENDING', to: 'REFUNDED' },
  { from: 'REFUND_PENDING', to: 'PAID' },
];

export function canPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** Order status → the timestamp column it stamps (transitionOrder's whitelisted mapping, 07 §4.5). */
export const STATUS_TIMESTAMP_COLUMN: Partial<
  Record<OrderStatus, 'confirmed_at' | 'packed_at' | 'shipped_at' | 'delivered_at' | 'cancelled_at'>
> = {
  CONFIRMED: 'confirmed_at',
  PACKED: 'packed_at',
  IN_TRANSIT: 'shipped_at',
  DELIVERED: 'delivered_at',
  CANCELLED: 'cancelled_at',
};
