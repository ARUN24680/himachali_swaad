import {
  OrderItemRowSchema,
  OrderRowSchema,
  StatusLogRowSchema,
  type ActorType,
  type OrderRow,
  type OrderStatus,
  type ShippingAddressSnapshot,
} from '@pk/shared';
import type { Queryable } from '../../config/db';

/** Raw SQL for orders, order_items and order_status_logs (D-01, D-07). */

const one = (rows: unknown[]): OrderRow | null => (rows[0] ? OrderRowSchema.parse(rows[0]) : null);

type Lock = 'none' | 'update' | 'skip-locked';
const lockSql = (lock: Lock) =>
  lock === 'update' ? ' FOR UPDATE' : lock === 'skip-locked' ? ' FOR UPDATE SKIP LOCKED' : '';

export async function findOrderById(q: Queryable, id: string, lock: Lock = 'none') {
  const { rows } = await q.query(`SELECT * FROM orders WHERE id = $1${lockSql(lock)}`, [id]);
  return one(rows);
}

export async function findOrderByCode(q: Queryable, orderCode: string, lock: Lock = 'none') {
  const { rows } = await q.query(`SELECT * FROM orders WHERE order_code = $1${lockSql(lock)}`, [orderCode]);
  return one(rows);
}

export async function findOrderByIdempotencyKey(q: Queryable, key: string) {
  const { rows } = await q.query('SELECT * FROM orders WHERE idempotency_key = $1', [key]);
  return one(rows);
}

export async function findOrderByGatewayOrderId(q: Queryable, gatewayOrderId: string, lock: Lock = 'none') {
  const { rows } = await q.query(`SELECT * FROM orders WHERE gateway_order_id = $1${lockSql(lock)}`, [gatewayOrderId]);
  return one(rows);
}

export interface NewOrder {
  orderCode: string;
  idempotencyKey: string;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: ShippingAddressSnapshot;
  whatsappOptIn: boolean;
  pickupLocationId: string;
  subtotalPaise: number;
  shippingFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  taxPaise: number;
  reservationTtlMinutes: number;
}

/**
 * Returns null when a UNIQUE value already exists (order_code clash → caller retries with a new
 * code; idempotency_key clash → a concurrent double-submit won, caller returns that order).
 * ON CONFLICT DO NOTHING keeps the transaction usable (a raised 23505 would abort it).
 */
export async function insertOrder(q: Queryable, o: NewOrder): Promise<OrderRow | null> {
  const { rows } = await q.query(
    `INSERT INTO orders (order_code, idempotency_key, user_id, customer_name, customer_phone, customer_email,
                         shipping_address, whatsapp_opt_in, whatsapp_opt_in_at, pickup_location_id,
                         subtotal_paise, shipping_fee_paise, discount_paise, total_paise, tax_paise,
                         reservation_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 THEN NOW() END, $9, $10, $11, $12, $13, $14,
             NOW() + make_interval(mins => $15::int))
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      o.orderCode,
      o.idempotencyKey,
      o.userId,
      o.customerName,
      o.customerPhone,
      o.customerEmail,
      o.shippingAddress,
      o.whatsappOptIn,
      o.pickupLocationId,
      o.subtotalPaise,
      o.shippingFeePaise,
      o.discountPaise,
      o.totalPaise,
      o.taxPaise,
      o.reservationTtlMinutes,
    ],
  );
  return one(rows);
}

export async function setPickupLocation(q: Queryable, orderId: string, pickupLocationId: string): Promise<void> {
  await q.query('UPDATE orders SET pickup_location_id = $2 WHERE id = $1', [orderId, pickupLocationId]);
}

export async function setGatewayOrderId(q: Queryable, orderId: string, gatewayOrderId: string): Promise<void> {
  await q.query('UPDATE orders SET gateway_order_id = $2 WHERE id = $1', [orderId, gatewayOrderId]);
}

export type StatusTimestampColumn = 'packed_at' | 'shipped_at' | 'delivered_at' | 'cancelled_at' | 'confirmed_at';
const TIMESTAMP_COLUMNS: ReadonlySet<StatusTimestampColumn> = new Set([
  'packed_at',
  'shipped_at',
  'delivered_at',
  'cancelled_at',
  'confirmed_at',
]);

/**
 * THE ONLY statement in the codebase that changes orders.status (D-29) — called solely by
 * transitionOrder(). Optimistic guard `AND status = $2`; returns false if someone else moved it.
 * `timestampColumn` comes from a closed whitelist, never from input.
 */
export async function updateOrderStatusGuarded(
  q: Queryable,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  extra: { timestampColumn: StatusTimestampColumn | null; cancelReason: string | null },
): Promise<boolean> {
  if (extra.timestampColumn && !TIMESTAMP_COLUMNS.has(extra.timestampColumn)) {
    throw new Error(`Unexpected timestamp column ${extra.timestampColumn}`);
  }
  const stamp = extra.timestampColumn ? `, ${extra.timestampColumn} = COALESCE(${extra.timestampColumn}, NOW())` : '';
  const res = await q.query(
    `UPDATE orders SET status = $3, cancel_reason = COALESCE($4, cancel_reason)${stamp}
      WHERE id = $1 AND status = $2`,
    [orderId, from, to, extra.cancelReason],
  );
  return res.rowCount === 1;
}

export async function insertStatusLog(
  q: Queryable,
  l: {
    orderId: string;
    from: OrderStatus | null;
    to: OrderStatus;
    actor: ActorType;
    actorId: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await q.query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, actor_type, actor_id, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [l.orderId, l.from, l.to, l.actor, l.actorId, l.reason, l.metadata],
  );
}

export async function listStatusLogs(q: Queryable, orderId: string) {
  const { rows } = await q.query('SELECT * FROM order_status_logs WHERE order_id = $1 ORDER BY id', [orderId]);
  return rows.map((r) => StatusLogRowSchema.parse(r));
}

/** Admin "resolve issue": clears ops_issue, returns what it was (audit before). */
export async function clearOpsIssue(q: Queryable, orderId: string): Promise<string | null> {
  const { rows } = await q.query<{ ops_issue: string | null }>(
    'SELECT ops_issue FROM orders WHERE id = $1 FOR UPDATE',
    [orderId],
  );
  await q.query('UPDATE orders SET ops_issue = NULL WHERE id = $1', [orderId]);
  return rows[0]?.ops_issue ?? null;
}

/** Appends to ops_issue (NOT NULL = needs admin attention). */
export async function appendOpsIssue(q: Queryable, orderId: string, issue: string): Promise<void> {
  await q.query(
    `UPDATE orders SET ops_issue = CASE WHEN ops_issue IS NULL THEN $2 ELSE ops_issue || E'\\n' || $2 END
      WHERE id = $1`,
    [orderId, issue],
  );
}

export async function insertOrderItem(
  q: Queryable,
  i: {
    orderId: string;
    productId: string;
    sku: string;
    title: string;
    netWeightG: number;
    quantity: number;
    unitPricePaise: number;
    hsnCode: string;
    gstRateBp: number;
  },
): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO order_items (order_id, product_id, sku, title, net_weight_g, quantity, unit_price_paise,
                              total_price_paise, hsn_code, gst_rate_bp)
     VALUES ($1, $2, $3, $4, $5, $6::int, $7::bigint, $7::bigint * $6::int, $8, $9)
     RETURNING id`,
    [i.orderId, i.productId, i.sku, i.title, i.netWeightG, i.quantity, i.unitPricePaise, i.hsnCode, i.gstRateBp],
  );
  return rows[0]!.id;
}

/** Items sorted by product_id — the lock order every stock path uses (D-23). */
export async function listOrderItems(q: Queryable, orderId: string) {
  const { rows } = await q.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_id', [orderId]);
  return rows.map((r) => OrderItemRowSchema.parse(r));
}

/** EXPIRE_RESERVATIONS candidates — read WITHOUT locks (07 §4.4 step 1). */
export async function listExpiredPendingOrders(q: Queryable, limit: number) {
  const { rows } = await q.query<{ id: string; gateway_order_id: string | null }>(
    `SELECT id, gateway_order_id FROM orders
      WHERE status = 'PENDING_PAYMENT' AND reservation_expires_at < NOW()
      ORDER BY reservation_expires_at
      LIMIT $1`,
    [limit],
  );
  return rows;
}

/** RECONCILE_CONFIRMED: confirmed > 5 min ago and still waiting on follow-up work. */
export async function listStaleConfirmedOrders(q: Queryable, limit: number) {
  const { rows } = await q.query<{ id: string; needs_invoice: boolean; status: OrderStatus }>(
    `SELECT id, status, (invoice_key IS NULL) AS needs_invoice FROM orders
      WHERE confirmed_at < NOW() - INTERVAL '5 minutes'
        AND (status = 'CONFIRMED' OR (invoice_key IS NULL AND payment_status IN ('PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED')
                                      AND status NOT IN ('PENDING_PAYMENT', 'EXPIRED')))
      ORDER BY confirmed_at
      LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function setInvoiceNumber(q: Queryable, orderId: string, invoiceNumber: string): Promise<void> {
  await q.query('UPDATE orders SET invoice_number = $2 WHERE id = $1 AND invoice_number IS NULL', [
    orderId,
    invoiceNumber,
  ]);
}

export async function setInvoiceKey(q: Queryable, orderId: string, key: string): Promise<void> {
  await q.query('UPDATE orders SET invoice_key = $2 WHERE id = $1', [orderId, key]);
}

/** Gap-free invoice number for a financial year (doc 01 §Invoice Number Allocation): the row lock is held till COMMIT. */
export async function nextInvoiceSeq(q: Queryable, financialYear: string): Promise<number> {
  await q.query(
    'INSERT INTO invoice_sequences (financial_year, last_number) VALUES ($1, 0) ON CONFLICT (financial_year) DO NOTHING',
    [financialYear],
  );
  const { rows } = await q.query<{ last_number: number }>(
    'UPDATE invoice_sequences SET last_number = last_number + 1 WHERE financial_year = $1 RETURNING last_number',
    [financialYear],
  );
  return rows[0]!.last_number;
}

export async function findPickupLocationForInvoice(q: Queryable, id: string) {
  const { rows } = await q.query<{ fssai_license_no: string | null; state: string }>(
    'SELECT fssai_license_no, state FROM pickup_locations WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserPhone(q: Queryable, userId: string): Promise<string | null> {
  const { rows } = await q.query<{ phone: string | null }>('SELECT phone FROM users WHERE id = $1', [userId]);
  return rows[0]?.phone ?? null;
}

/** Oldest active kitchen — placeholder pickup location until the first allocation decides it. */
export async function findDefaultPickupLocationId(q: Queryable): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    'SELECT id FROM pickup_locations WHERE is_active ORDER BY created_at, id LIMIT 1',
  );
  return rows[0]?.id ?? null;
}
