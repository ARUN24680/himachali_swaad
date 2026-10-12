import { ShipmentRowSchema, type OrderStatus, type ShipmentRow } from '@pk/shared';
import type { Queryable } from '../../config/db';

/** Raw SQL for shipments + tracking_events (migration 0004, D-01, D-07). */

const one = (rows: unknown[]): ShipmentRow | null => (rows[0] ? ShipmentRowSchema.parse(rows[0]) : null);

export async function findShipmentByOrderId(q: Queryable, orderId: string, lock = false) {
  const { rows } = await q.query(`SELECT * FROM shipments WHERE order_id = $1${lock ? ' FOR UPDATE' : ''}`, [orderId]);
  return one(rows);
}

export async function findShipmentByAwb(q: Queryable, awb: string) {
  const { rows } = await q.query('SELECT * FROM shipments WHERE awb_code = $1', [awb]);
  return one(rows);
}

/** Creates the row once; a re-run gets the existing one (idempotent booking, Phase 6 §6.5). */
export async function ensureShipment(
  q: Queryable,
  s: {
    orderId: string;
    deadWeightG: number;
    volumetricWeightG: number;
    lengthCm: number;
    breadthCm: number;
    heightCm: number;
  },
): Promise<ShipmentRow> {
  await q.query(
    `INSERT INTO shipments (order_id, dead_weight_g, volumetric_weight_g, length_cm, breadth_cm, height_cm)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (order_id) DO NOTHING`,
    [s.orderId, s.deadWeightG, s.volumetricWeightG, s.lengthCm, s.breadthCm, s.heightCm],
  );
  return (await findShipmentByOrderId(q, s.orderId))!;
}

export async function incrementBookingAttempts(q: Queryable, shipmentId: string): Promise<void> {
  await q.query('UPDATE shipments SET booking_attempts = booking_attempts + 1 WHERE id = $1', [shipmentId]);
}

export async function setShiprocketIds(q: Queryable, id: string, shiprocketOrderId: string, shipmentId: string) {
  await q.query(
    `UPDATE shipments SET shiprocket_order_id = $2, shiprocket_shipment_id = $3, last_error = NULL WHERE id = $1`,
    [id, shiprocketOrderId, shipmentId],
  );
}

export async function setAwb(
  q: Queryable,
  id: string,
  a: { awb: string; courierId: number; courierName: string; freightPaise: number; etd: string | null },
) {
  await q.query(
    `UPDATE shipments SET awb_code = $2, courier_company_id = $3, courier_name = $4, freight_paise = $5,
                          etd = $6::date, last_error = NULL
      WHERE id = $1`,
    [id, a.awb, a.courierId, a.courierName, a.freightPaise, a.etd],
  );
}

export async function setLabelKey(q: Queryable, id: string, key: string): Promise<void> {
  await q.query('UPDATE shipments SET label_key = $2 WHERE id = $1', [id, key]);
}

export async function setLastError(q: Queryable, orderId: string, error: string): Promise<void> {
  await q.query('UPDATE shipments SET last_error = $2 WHERE order_id = $1', [orderId, error.slice(0, 1000)]);
}

export async function setPickupDateIfUnset(q: Queryable, orderId: string, date: string): Promise<void> {
  await q.query(
    'UPDATE shipments SET pickup_scheduled_for = $2::date WHERE order_id = $1 AND pickup_scheduled_for IS NULL',
    [orderId, date],
  );
}

export async function setPickupBooked(
  q: Queryable,
  id: string,
  p: { pickupToken: string | null; manifestKey: string | null; pickupDate: string },
): Promise<void> {
  await q.query(
    `UPDATE shipments SET pickup_token = $2, manifest_key = COALESCE($3, manifest_key), pickup_requested_at = NOW(),
                          pickup_scheduled_for = $4::date, last_error = NULL
      WHERE id = $1`,
    [id, p.pickupToken, p.manifestKey, p.pickupDate],
  );
}

export async function markCancelled(q: Queryable, id: string): Promise<void> {
  await q.query('UPDATE shipments SET cancelled_at = COALESCE(cancelled_at, NOW()) WHERE id = $1', [id]);
}

export async function setChargedWeight(q: Queryable, id: string, grams: number): Promise<void> {
  await q.query('UPDATE shipments SET charged_weight_g = $2 WHERE id = $1', [id, grams]);
}

export async function setEtd(q: Queryable, id: string, etd: string): Promise<void> {
  await q.query('UPDATE shipments SET etd = $2::date WHERE id = $1', [id, etd]);
}

/** Returns false when the same (shipment, status, time) is already stored — a duplicate event. */
export async function insertTrackingEvent(
  q: Queryable,
  e: {
    shipmentId: string;
    statusCode: string | null;
    statusText: string;
    location: string | null;
    eventTime: Date;
    source: 'WEBHOOK' | 'POLL';
    raw: unknown;
  },
): Promise<boolean> {
  const { rowCount } = await q.query(
    `INSERT INTO tracking_events (shipment_id, status_code, status_text, location, event_time, source, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (shipment_id, status_text, event_time) DO NOTHING`,
    [
      e.shipmentId,
      e.statusCode,
      e.statusText.slice(0, 80),
      e.location?.slice(0, 120) ?? null,
      e.eventTime,
      e.source,
      e.raw,
    ],
  );
  return rowCount === 1;
}

/** Latest event wins; an older event arriving late doesn't overwrite the summary. */
export async function updateLastStatus(q: Queryable, id: string, text: string, at: Date): Promise<void> {
  await q.query(
    `UPDATE shipments SET last_status_text = $2, last_status_at = $3
      WHERE id = $1 AND (last_status_at IS NULL OR last_status_at <= $3)`,
    [id, text.slice(0, 80), at],
  );
}

export async function listTrackingEvents(q: Queryable, shipmentId: string) {
  const { rows } = await q.query<{ status_text: string; event_time: Date; source: string }>(
    'SELECT status_text, event_time, source FROM tracking_events WHERE shipment_id = $1 ORDER BY event_time, id',
    [shipmentId],
  );
  return rows;
}

// ── Reads joined with other tables (read-only, for the booking payload) ──────────────────────────

export interface PickupLocationForShipping {
  id: string;
  code: string;
  pincode: string;
  shiprocket_pickup_name: string | null;
}

export async function findPickupLocation(q: Queryable, id: string): Promise<PickupLocationForShipping | null> {
  const { rows } = await q.query<PickupLocationForShipping>(
    'SELECT id, code, pincode, shiprocket_pickup_name FROM pickup_locations WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

/** Oldest active kitchen's pincode — the origin for storefront serviceability checks. */
export async function findDefaultPickupPincode(q: Queryable): Promise<string | null> {
  const { rows } = await q.query<{ pincode: string }>(
    'SELECT pincode FROM pickup_locations WHERE is_active ORDER BY created_at, id LIMIT 1',
  );
  return rows[0]?.pincode ?? null;
}

export interface ItemPackaging {
  product_id: string;
  quantity: number;
  net_weight_g: number;
  packed_weight_g: number | null;
  package_length_cm: number;
  package_breadth_cm: number;
  package_height_cm: number;
}

/** D-33: weights/dimensions come from the product columns — never hardcoded. */
export async function listItemPackaging(q: Queryable, orderId: string): Promise<ItemPackaging[]> {
  const { rows } = await q.query<ItemPackaging>(
    `SELECT oi.product_id, oi.quantity, oi.net_weight_g, p.packed_weight_g,
            p.package_length_cm::float8 AS package_length_cm, p.package_breadth_cm::float8 AS package_breadth_cm,
            p.package_height_cm::float8 AS package_height_cm
       FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.product_id`,
    [orderId],
  );
  return rows;
}

export interface PickupCandidate {
  order_id: string;
  order_code: string;
  shipment_id: string;
  shiprocket_shipment_id: string;
  pickup_location_id: string;
  packed_at: Date | null;
  pickup_scheduled_for: string | null;
}

/** PACKED orders with an AWB whose pickup isn't booked yet. */
export async function listPickupCandidates(q: Queryable, limit: number): Promise<PickupCandidate[]> {
  const { rows } = await q.query<PickupCandidate>(
    `SELECT o.id AS order_id, o.order_code, s.id AS shipment_id, s.shiprocket_shipment_id, o.pickup_location_id,
            o.packed_at, s.pickup_scheduled_for
       FROM orders o JOIN shipments s ON s.order_id = o.id
      WHERE o.status = 'PACKED' AND s.awb_code IS NOT NULL AND s.pickup_token IS NULL AND s.cancelled_at IS NULL
      ORDER BY o.packed_at NULLS FIRST, o.id
      LIMIT $1`,
    [limit],
  );
  return rows;
}

const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'PICKUP_SCHEDULED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'RTO_IN_TRANSIT',
];

export interface ActiveShipment {
  order_id: string;
  order_status: OrderStatus;
  shipment_id: string;
  awb_code: string;
  dead_weight_g: number | null;
  charged_weight_g: number | null;
  pickup_requested_at: Date | null;
}

/** POLL_TRACKING: shipments between pickup and a terminal status (07 §4.4). */
export async function listActiveShipments(q: Queryable, limit: number): Promise<ActiveShipment[]> {
  const { rows } = await q.query<ActiveShipment>(
    `SELECT o.id AS order_id, o.status AS order_status, s.id AS shipment_id, s.awb_code, s.dead_weight_g,
            s.charged_weight_g, s.pickup_requested_at
       FROM orders o JOIN shipments s ON s.order_id = o.id
      WHERE o.status = ANY($1::order_status[]) AND s.awb_code IS NOT NULL
      ORDER BY s.last_status_at NULLS FIRST, s.id
      LIMIT $2`,
    [ACTIVE_STATUSES, limit],
  );
  return rows;
}

/** CONFIRMED orders whose booking is done (AWB) but the label step never finished. */
export async function listLabelPending(q: Queryable, limit: number): Promise<{ order_id: string }[]> {
  const { rows } = await q.query<{ order_id: string }>(
    `SELECT o.id AS order_id FROM orders o JOIN shipments s ON s.order_id = o.id
      WHERE o.status = 'CONFIRMED' AND s.awb_code IS NOT NULL AND s.cancelled_at IS NULL
        AND o.confirmed_at < NOW() - INTERVAL '5 minutes'
      LIMIT $1`,
    [limit],
  );
  return rows;
}
