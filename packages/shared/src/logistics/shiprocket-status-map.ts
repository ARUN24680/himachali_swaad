import type { OrderStatus } from '../order/statuses';

/**
 * Shiprocket tracking status → order status (architecture/07 §5). The text mapping is primary —
 * every webhook/track payload carries the status label; the numeric `shipment_status_id` is the
 * fallback when a label is new to us. Ids come from Shiprocket's public API docs (Postman
 * "Shiprocket API" collection, status code table) — re-check against the account's panel (D-53).
 * Statuses without an order status are stored in tracking_events only.
 */
export type TrackingSignal =
  | { kind: 'status'; status: OrderStatus }
  /** No order change; admin should look (pickup problems, partial delivery, cancelled by courier). */
  | { kind: 'alert'; reason: string }
  | { kind: 'none' };

const S = (status: OrderStatus): TrackingSignal => ({ kind: 'status', status });
const ALERT = (reason: string): TrackingSignal => ({ kind: 'alert', reason });
const NONE: TrackingSignal = { kind: 'none' };

/** Keys are normalised: upper-case, `_`/`-` → space, single spaces. */
const BY_TEXT: Record<string, TrackingSignal> = {
  'PICKED UP': S('IN_TRANSIT'),
  SHIPPED: S('IN_TRANSIT'),
  'IN TRANSIT': S('IN_TRANSIT'),
  'REACHED AT DESTINATION HUB': S('IN_TRANSIT'),
  'REACHED DESTINATION HUB': S('IN_TRANSIT'),
  MISROUTED: S('IN_TRANSIT'),
  'REACHED WAREHOUSE': S('IN_TRANSIT'),
  'IN FLIGHT': S('IN_TRANSIT'),
  'HANDOVER TO COURIER': S('IN_TRANSIT'),
  'OUT FOR DELIVERY': S('OUT_FOR_DELIVERY'),
  DELIVERED: S('DELIVERED'),
  UNDELIVERED: S('DELIVERY_FAILED'),
  NDR: S('DELIVERY_FAILED'),
  'DELIVERY DELAYED': S('DELIVERY_FAILED'),
  'RTO INITIATED': S('RTO_IN_TRANSIT'),
  'RTO IN TRANSIT': S('RTO_IN_TRANSIT'),
  'RTO IN INTRANSIT': S('RTO_IN_TRANSIT'),
  'RTO OFD': S('RTO_IN_TRANSIT'),
  'RTO NDR': S('RTO_IN_TRANSIT'),
  'RTO DELIVERED': S('RTO_DELIVERED'),
  'RTO ACKNOWLEDGED': S('RTO_DELIVERED'),
  LOST: S('LOST'),
  DAMAGED: S('LOST'),
  DESTROYED: S('LOST'),
  'PICKUP EXCEPTION': ALERT('PICKUP_EXCEPTION'),
  'PICKUP ERROR': ALERT('PICKUP_ERROR'),
  CANCELED: ALERT('COURIER_CANCELLED'),
  CANCELLED: ALERT('COURIER_CANCELLED'),
  'PARTIAL DELIVERED': ALERT('PARTIAL_DELIVERED'),
  'DISPOSED OFF': ALERT('DISPOSED_OFF'),
  UNTRACEABLE: ALERT('UNTRACEABLE'),
  'PICKUP SCHEDULED': NONE,
  'PICKUP RESCHEDULED': NONE,
  'OUT FOR PICKUP': NONE,
  'AWB ASSIGNED': NONE,
  'MANIFEST GENERATED': NONE,
  'PICKUP GENERATED': NONE,
  'PICKUP QUEUED': NONE,
  'SHIPMENT BOOKED': NONE,
  DELAYED: NONE, // transit delay, not a failed attempt
};

/** Shiprocket `shipment_status_id` → label (the subset we act on, plus common no-ops). */
export const SHIPROCKET_STATUS_IDS: Record<number, string> = {
  6: 'SHIPPED',
  7: 'DELIVERED',
  8: 'CANCELED',
  9: 'RTO INITIATED',
  10: 'RTO DELIVERED',
  12: 'LOST',
  13: 'PICKUP ERROR',
  14: 'RTO ACKNOWLEDGED',
  15: 'PICKUP RESCHEDULED',
  17: 'OUT FOR DELIVERY',
  18: 'IN TRANSIT',
  19: 'OUT FOR PICKUP',
  20: 'PICKUP EXCEPTION',
  21: 'UNDELIVERED',
  22: 'DELAYED',
  23: 'PARTIAL DELIVERED',
  24: 'DESTROYED',
  25: 'DAMAGED',
  38: 'REACHED AT DESTINATION HUB',
  39: 'MISROUTED',
  40: 'RTO NDR',
  41: 'RTO OFD',
  42: 'PICKED UP',
  44: 'DISPOSED OFF',
  46: 'RTO IN INTRANSIT',
  48: 'REACHED WAREHOUSE',
  50: 'IN FLIGHT',
  51: 'HANDOVER TO COURIER',
  52: 'SHIPMENT BOOKED',
};

export const normalizeTrackingStatus = (text: string): string =>
  text.toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export function mapShiprocketStatus(text: string | null | undefined, statusId?: number | null): TrackingSignal {
  const byText = text ? BY_TEXT[normalizeTrackingStatus(text)] : undefined;
  if (byText) return byText;
  const label = statusId != null ? SHIPROCKET_STATUS_IDS[statusId] : undefined;
  return (label && BY_TEXT[label]) || NONE;
}
