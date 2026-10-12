import type { Queryable } from '../../config/db';

/** Read-only joins for the customer tracking view (Phase 8 §8.1) and My Orders (§8.3). */

export interface TrackItemRow {
  order_item_id: string;
  title: string;
  net_weight_g: number;
  quantity: number;
  batch_code: string | null;
  manufactured_at: string | null; // DATE as 'YYYY-MM-DD'
}

/** Items with the oldest-made batch their jars came from (any allocation state — cancelled orders keep history). */
export async function listTrackItems(q: Queryable, orderId: string): Promise<TrackItemRow[]> {
  const { rows } = await q.query<TrackItemRow>(
    `SELECT DISTINCT ON (oi.id) oi.id AS order_item_id, oi.title, oi.net_weight_g, oi.quantity,
            b.batch_code, b.manufactured_at
       FROM order_items oi
       LEFT JOIN order_item_allocations a ON a.order_item_id = oi.id
       LEFT JOIN inventory_batches b ON b.id = a.batch_id
      WHERE oi.order_id = $1
      ORDER BY oi.id, b.manufactured_at NULLS LAST, b.batch_code`,
    [orderId],
  );
  return rows;
}

export interface TrackShipmentRow {
  id: string;
  awb_code: string | null;
  courier_name: string | null;
  etd: string | null;
  updated_at: Date;
}

export async function findTrackShipment(q: Queryable, orderId: string): Promise<TrackShipmentRow | null> {
  const { rows } = await q.query<TrackShipmentRow>(
    'SELECT id, awb_code, courier_name, etd, updated_at FROM shipments WHERE order_id = $1',
    [orderId],
  );
  return rows[0] ?? null;
}

export async function listScans(q: Queryable, shipmentId: string) {
  const { rows } = await q.query<{
    status_text: string;
    status_code: string | null;
    location: string | null;
    event_time: Date;
  }>(
    `SELECT status_text, status_code, location, event_time FROM tracking_events
      WHERE shipment_id = $1 ORDER BY event_time, id`,
    [shipmentId],
  );
  return rows;
}

export interface MyOrderRow {
  order_code: string;
  status: string;
  payment_status: string;
  total_paise: number;
  created_at: Date;
  item_count: number;
  first_item_title: string;
  total: number;
}

/**
 * The customer's orders: placed while signed in (user_id) or as a guest with the phone they have
 * since verified by OTP (D-18). Unpaid / expired checkout attempts are not orders to the customer.
 */
export async function listMyOrders(
  q: Queryable,
  userId: string,
  page: number,
  pageSize: number,
): Promise<MyOrderRow[]> {
  const { rows } = await q.query<MyOrderRow>(
    `WITH me AS (SELECT phone FROM users WHERE id = $1)
     SELECT o.order_code, o.status, o.payment_status, o.total_paise, o.created_at,
            (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS item_count,
            (SELECT title FROM order_items WHERE order_id = o.id ORDER BY product_id, id LIMIT 1) AS first_item_title,
            count(*) OVER ()::int AS total
       FROM orders o, me
      WHERE (o.user_id = $1 OR (me.phone IS NOT NULL AND o.customer_phone = me.phone))
        AND o.status NOT IN ('PENDING_PAYMENT', 'EXPIRED')
      ORDER BY o.created_at DESC, o.id
      LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );
  return rows;
}
