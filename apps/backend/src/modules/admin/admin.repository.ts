import type { AdminOrderTab } from '@pk/shared';
import type { Queryable } from '../../config/db';

/**
 * Read models for the admin console (Phase 9). Read-only joins across modules' tables — writes stay
 * in their owning modules (09 §2). Every filter is a bound parameter; sort keys come from a whitelist.
 */

/** Orders the customer actually placed (unpaid / expired checkout attempts are noise here). */
const REAL = `o.status NOT IN ('PENDING_PAYMENT', 'EXPIRED')`;

const TAB_SQL: Record<AdminOrderTab, string> = {
  all: 'TRUE',
  attention: `(o.ops_issue IS NOT NULL OR o.status = 'DELIVERY_FAILED')`,
  awaiting_packing: `o.status IN ('CONFIRMED', 'AWAITING_PACKING')`,
  in_transit: `o.status IN ('PACKED', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')`,
  ndr: `o.status = 'DELIVERY_FAILED'`,
  rto: `o.status IN ('RTO_IN_TRANSIT', 'RTO_DELIVERED', 'LOST')`,
  delivered: `o.status = 'DELIVERED'`,
  cancelled: `o.status = 'CANCELLED'`,
};

const SORT_SQL = {
  created_desc: 'o.created_at DESC, o.id',
  created_asc: 'o.created_at ASC, o.id',
  total_desc: 'o.total_paise DESC, o.created_at DESC',
  total_asc: 'o.total_paise ASC, o.created_at DESC',
} as const;

export interface OrderFilter {
  q?: string;
  from?: string;
  to?: string;
  statuses: string[];
}

/** WHERE fragments shared by the list and the tab counts (q / dates / explicit statuses). */
function baseWhere(f: OrderFilter, params: unknown[]): string {
  const parts = [REAL];
  if (f.q) {
    const q = f.q.trim();
    const digits = q.replace(/\D/g, '');
    const phone = /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : /^91[6-9]\d{9}$/.test(digits) ? `+${digits}` : null;
    params.push(q.toUpperCase());
    const codeIdx = params.length;
    params.push(phone);
    const phoneIdx = params.length;
    params.push(q);
    const awbIdx = params.length;
    parts.push(
      `(o.order_code = $${codeIdx} OR o.order_code LIKE '%' || $${codeIdx} || '%'
        OR ($${phoneIdx}::text IS NOT NULL AND o.customer_phone = $${phoneIdx})
        OR s.awb_code = $${awbIdx})`,
    );
  }
  if (f.from) {
    params.push(f.from);
    parts.push(`o.created_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  }
  if (f.to) {
    params.push(f.to);
    parts.push(`o.created_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  }
  if (f.statuses.length) {
    params.push(f.statuses);
    parts.push(`o.status::text = ANY($${params.length}::text[])`);
  }
  return parts.join(' AND ');
}

export interface AdminOrderListRow {
  order_code: string;
  created_at: Date;
  customer_name: string;
  city: string;
  state: string;
  items_summary: string;
  total_paise: number;
  payment_status: string;
  status: string;
  courier_name: string | null;
  awb_code: string | null;
  ops_issue: string | null;
}

const LIST_COLUMNS = `o.order_code, o.created_at, o.customer_name, o.shipping_address->>'city' AS city,
  o.shipping_address->>'state' AS state, o.total_paise, o.payment_status, o.status, o.ops_issue,
  s.courier_name, s.awb_code,
  (SELECT string_agg(oi.quantity || '× ' || oi.title || ' ' || oi.net_weight_g || 'g', ', ' ORDER BY oi.product_id)
     FROM order_items oi WHERE oi.order_id = o.id) AS items_summary`;

export async function listAdminOrders(
  q: Queryable,
  f: OrderFilter & { tab: AdminOrderTab; page: number; pageSize: number; sort: keyof typeof SORT_SQL },
) {
  const params: unknown[] = [];
  const where = `${baseWhere(f, params)} AND ${TAB_SQL[f.tab]}`;
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const { rows } = await q.query<AdminOrderListRow & { total: number }>(
    `SELECT ${LIST_COLUMNS}, count(*) OVER ()::int AS total
       FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
      WHERE ${where}
      ORDER BY ${SORT_SQL[f.sort]}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function countAdminOrdersByTab(q: Queryable, f: OrderFilter): Promise<Record<AdminOrderTab, number>> {
  const params: unknown[] = [];
  const where = baseWhere(f, params);
  const cols = (Object.keys(TAB_SQL) as AdminOrderTab[])
    .map((tab) => `count(*) FILTER (WHERE ${TAB_SQL[tab]})::int AS "${tab}"`)
    .join(', ');
  const { rows } = await q.query<Record<AdminOrderTab, number>>(
    `SELECT ${cols} FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE ${where}`,
    params,
  );
  return rows[0]!;
}

export async function listOrdersForCustomer(q: Queryable, phone: string) {
  const { rows } = await q.query<AdminOrderListRow>(
    `SELECT ${LIST_COLUMNS} FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
      WHERE ${REAL} AND o.customer_phone = $1 ORDER BY o.created_at DESC LIMIT 200`,
    [phone],
  );
  return rows;
}

// ── Order detail pieces ────────────────────────────────────────────────────────────────────────

export async function listAllocations(q: Queryable, orderId: string) {
  const { rows } = await q.query<{
    order_item_id: string;
    batch_code: string;
    quantity: number;
    manufactured_at: string;
    expiry_date: string;
    status: string;
  }>(
    `SELECT a.order_item_id, b.batch_code, a.quantity, b.manufactured_at, b.expiry_date, a.status
       FROM order_item_allocations a
       JOIN order_items oi ON oi.id = a.order_item_id
       JOIN inventory_batches b ON b.id = a.batch_id
      WHERE oi.order_id = $1
      ORDER BY oi.product_id, b.expiry_date, b.batch_code`,
    [orderId],
  );
  return rows;
}

export async function listPayments(q: Queryable, orderId: string) {
  const { rows } = await q.query<{
    id: string;
    gateway_payment_id: string | null;
    amount_paise: number;
    method: string | null;
    status: string;
    fee_paise: number | null;
    fee_tax_paise: number | null;
    error_code: string | null;
    created_at: Date;
  }>(
    `SELECT id, gateway_payment_id, amount_paise, method, status, fee_paise, fee_tax_paise, error_code, created_at
       FROM payments WHERE order_id = $1 ORDER BY created_at`,
    [orderId],
  );
  return rows;
}

export async function listRefunds(q: Queryable, orderId: string) {
  const { rows } = await q.query<{
    id: string;
    amount_paise: number;
    reason: string;
    status: string;
    notes: string | null;
    created_at: Date;
    processed_at: Date | null;
  }>(
    `SELECT id, amount_paise, reason, status, notes, created_at, processed_at FROM refunds
      WHERE order_id = $1 ORDER BY created_at`,
    [orderId],
  );
  return rows;
}

export async function findShipmentDetail(q: Queryable, orderId: string) {
  const { rows } = await q.query<{
    id: string;
    courier_name: string | null;
    awb_code: string | null;
    etd: string | null;
    dead_weight_g: number | null;
    charged_weight_g: number | null;
    freight_paise: number | null;
    rto_freight_paise: number | null;
    pickup_scheduled_for: string | null;
    label_key: string | null;
    last_status_text: string | null;
    last_error: string | null;
    booking_attempts: number;
  }>(
    `SELECT id, courier_name, awb_code, etd, dead_weight_g, charged_weight_g, freight_paise, rto_freight_paise,
            pickup_scheduled_for, label_key, last_status_text, last_error, booking_attempts
       FROM shipments WHERE order_id = $1`,
    [orderId],
  );
  return rows[0] ?? null;
}

export async function listTrackingEvents(q: Queryable, shipmentId: string) {
  const { rows } = await q.query<{ status_text: string; location: string | null; event_time: Date; source: string }>(
    'SELECT status_text, location, event_time, source FROM tracking_events WHERE shipment_id = $1 ORDER BY event_time, id',
    [shipmentId],
  );
  return rows;
}

export async function listNotifications(q: Queryable, orderId: string) {
  const { rows } = await q.query<{
    channel: string;
    template: string;
    status: string;
    recipient: string;
    error: string | null;
    created_at: Date;
  }>(
    `SELECT channel, template, status, recipient, error, created_at FROM notifications_log
      WHERE order_id = $1 ORDER BY created_at`,
    [orderId],
  );
  return rows;
}

export async function listOrderNotes(q: Queryable, orderId: string) {
  const { rows } = await q.query<{ text: string; by: string | null; at: Date }>(
    `SELECT a.after->>'text' AS text, u.email::text AS by, a.created_at AS at
       FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.action = 'ORDER_NOTE' AND a.entity_type = 'order' AND a.entity_id = $1
      ORDER BY a.id`,
    [orderId],
  );
  return rows;
}

export async function findKitchen(q: Queryable, id: string) {
  const { rows } = await q.query<{ code: string; name: string }>(
    'SELECT code, name FROM pickup_locations WHERE id = $1',
    [id],
  );
  return rows[0] ?? { code: '—', name: '—' };
}

// ── Dashboard (§9.2) ─────────────────────────────────────────────────────────────────────────────

/** Revenue = captured orders by IST confirm day (gross incl. GST; ex-GST via orders.tax_paise). */
export async function dashboardNumbers(q: Queryable, sellableBufferDays: number) {
  const { rows } = await q.query<{
    awaiting_packing: number;
    needs_attention: number;
    ndr: number;
    in_transit: number;
    today_gross: number;
    today_ex: number;
    today_orders: number;
    month_gross: number;
    month_ex: number;
    month_orders: number;
    sellable_jars: number;
    expiring_30: number;
  }>(
    `WITH paid AS (
       SELECT o.total_paise, o.tax_paise, (o.confirmed_at AT TIME ZONE 'Asia/Kolkata')::date AS d
         FROM orders o WHERE o.confirmed_at IS NOT NULL AND o.status <> 'EXPIRED')
     SELECT
       (SELECT count(*) FROM orders WHERE status = 'AWAITING_PACKING')::int AS awaiting_packing,
       (SELECT count(*) FROM orders WHERE ops_issue IS NOT NULL OR status = 'DELIVERY_FAILED')::int AS needs_attention,
       (SELECT count(*) FROM orders WHERE status = 'DELIVERY_FAILED')::int AS ndr,
       (SELECT count(*) FROM orders WHERE status IN ('PICKUP_SCHEDULED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'))::int AS in_transit,
       COALESCE((SELECT sum(total_paise) FROM paid WHERE d = ist_today()), 0)::bigint AS today_gross,
       COALESCE((SELECT sum(total_paise - tax_paise) FROM paid WHERE d = ist_today()), 0)::bigint AS today_ex,
       (SELECT count(*) FROM paid WHERE d = ist_today())::int AS today_orders,
       COALESCE((SELECT sum(total_paise) FROM paid WHERE d >= date_trunc('month', ist_today())::date), 0)::bigint AS month_gross,
       COALESCE((SELECT sum(total_paise - tax_paise) FROM paid WHERE d >= date_trunc('month', ist_today())::date), 0)::bigint AS month_ex,
       (SELECT count(*) FROM paid WHERE d >= date_trunc('month', ist_today())::date)::int AS month_orders,
       COALESCE((SELECT sum(available_stock) FROM inventory_batches WHERE expiry_date >= ist_today() + $1::int), 0)::int AS sellable_jars,
       (SELECT count(*) FROM inventory_batches WHERE available_stock > 0
          AND expiry_date BETWEEN ist_today() AND ist_today() + 30)::int AS expiring_30`,
    [sellableBufferDays],
  );
  return rows[0]!;
}

export async function ordersPerDay(q: Queryable, days: number) {
  const { rows } = await q.query<{ date: string; orders: number; gross_paise: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS date, count(o.id)::int AS orders, COALESCE(sum(o.total_paise), 0)::bigint AS gross_paise
       FROM generate_series(ist_today() - ($1::int - 1), ist_today(), interval '1 day') AS d
       LEFT JOIN orders o ON o.confirmed_at IS NOT NULL AND o.status <> 'EXPIRED'
                         AND (o.confirmed_at AT TIME ZONE 'Asia/Kolkata')::date = d::date
      GROUP BY d ORDER BY d`,
    [days],
  );
  return rows;
}

export async function revenueByProductThisMonth(q: Queryable) {
  const { rows } = await q.query<{ title: string; jars: number; gross_paise: number }>(
    `SELECT oi.title, sum(oi.quantity)::int AS jars, sum(oi.total_price_paise)::bigint AS gross_paise
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.confirmed_at IS NOT NULL AND o.status NOT IN ('EXPIRED', 'CANCELLED')
        AND (o.confirmed_at AT TIME ZONE 'Asia/Kolkata')::date >= date_trunc('month', ist_today())::date
      GROUP BY oi.title ORDER BY gross_paise DESC LIMIT 12`,
  );
  return rows;
}

// ── Customers (§9.5) ─────────────────────────────────────────────────────────────────────────────

const CUSTOMER_SORT = {
  last_order_desc: 'last_order_at DESC',
  ltv_desc: 'ltv DESC, last_order_at DESC',
  orders_desc: 'orders_count DESC, last_order_at DESC',
} as const;

export interface CustomerAggRow {
  phone: string;
  user_id: string | null;
  name: string;
  email: string | null;
  orders_count: number;
  ltv: number;
  last_order_at: Date;
  rto_count: number;
  total: number;
}

/** Users + guest phones folded by phone (one person = one phone, D-18). */
export async function listCustomers(
  q: Queryable,
  p: { q?: string; page: number; pageSize: number; sort: keyof typeof CUSTOMER_SORT; phone?: string },
): Promise<CustomerAggRow[]> {
  const params: unknown[] = [];
  const filters: string[] = [];
  if (p.phone) {
    params.push(p.phone);
    filters.push(`agg.phone = $${params.length}`);
  }
  if (p.q) {
    params.push(`%${p.q.trim()}%`);
    filters.push(`(agg.phone ILIKE $${params.length} OR agg.name ILIKE $${params.length})`);
  }
  params.push(p.pageSize, (p.page - 1) * p.pageSize);
  const { rows } = await q.query<CustomerAggRow>(
    `WITH agg AS (
       SELECT o.customer_phone AS phone,
              (array_agg(o.customer_name ORDER BY o.created_at DESC))[1] AS name,
              (array_agg(o.customer_email ORDER BY o.created_at DESC) FILTER (WHERE o.customer_email IS NOT NULL))[1] AS email,
              count(*)::int AS orders_count,
              COALESCE(sum(o.total_paise) FILTER (WHERE o.status NOT IN ('CANCELLED')), 0)::bigint AS ltv,
              max(o.created_at) AS last_order_at,
              count(*) FILTER (WHERE o.status IN ('RTO_IN_TRANSIT', 'RTO_DELIVERED'))::int AS rto_count
         FROM orders o WHERE ${REAL}
        GROUP BY o.customer_phone)
     SELECT agg.*, u.id AS user_id, count(*) OVER ()::int AS total
       FROM agg LEFT JOIN users u ON u.phone = agg.phone AND u.role = 'CUSTOMER'
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY ${CUSTOMER_SORT[p.sort]}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function listCustomerAddresses(q: Queryable, userId: string) {
  const { rows } = await q.query<{
    id: string;
    line1: string;
    city: string;
    state: string;
    pincode: string;
    is_default: boolean;
  }>(
    'SELECT id, line1, city, state, pincode, is_default FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at',
    [userId],
  );
  return rows;
}

// ── Inventory expiry alerts (§9.6) ───────────────────────────────────────────────────────────────

/** Batches with stock whose sellable window (expiry − buffer, D-24) closes within `days`. */
export async function listExpiryAlerts(q: Queryable, bufferDays: number, days: number) {
  const { rows } = await q.query<{
    batch_id: string;
    batch_code: string;
    product_title: string;
    kitchen_code: string;
    available_stock: number;
    expiry_date: string;
    sellable_until: string;
    days_left: number;
  }>(
    `SELECT b.id AS batch_id, b.batch_code, p.title AS product_title, pl.code AS kitchen_code, b.available_stock,
            b.expiry_date, to_char(b.expiry_date - $1::int, 'YYYY-MM-DD') AS sellable_until,
            (b.expiry_date - $1::int - ist_today())::int AS days_left
       FROM inventory_batches b
       JOIN products p ON p.id = b.product_id
       JOIN pickup_locations pl ON pl.id = b.pickup_location_id
      WHERE b.available_stock > 0
        AND b.expiry_date - $1::int BETWEEN ist_today() AND ist_today() + $2::int
      ORDER BY b.expiry_date, b.batch_code`,
    [bufferDays, days],
  );
  return rows;
}

// ── Audit log + webhook failures (§9.11) ─────────────────────────────────────────────────────────

export async function listAuditLog(
  q: Queryable,
  p: { action?: string; entityType?: string; entityId?: string; page: number; pageSize: number },
) {
  const params: unknown[] = [
    p.action ?? null,
    p.entityType ?? null,
    p.entityId ?? null,
    p.pageSize,
    (p.page - 1) * p.pageSize,
  ];
  const { rows } = await q.query<{
    id: number;
    action: string;
    entity_type: string;
    entity_id: string;
    actor_id: string | null;
    actor_email: string | null;
    before: unknown;
    after: unknown;
    ip: string | null;
    created_at: Date;
    total: number;
  }>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_id, u.email::text AS actor_email, a.before, a.after,
            host(a.ip) AS ip, a.created_at, count(*) OVER ()::int AS total
       FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE ($1::text IS NULL OR a.action = $1) AND ($2::text IS NULL OR a.entity_type = $2)
        AND ($3::text IS NULL OR a.entity_id = $3)
      ORDER BY a.id DESC LIMIT $4 OFFSET $5`,
    params,
  );
  return rows;
}

export async function listWebhookFailures(q: Queryable, limit = 200) {
  const { rows } = await q.query<{
    id: number;
    provider: string;
    event_type: string;
    received_at: Date;
    attempts: number;
    last_error: string | null;
    processed_at: Date | null;
  }>(
    `SELECT id, provider, event_type, received_at, attempts, last_error, processed_at FROM webhook_events
      WHERE last_error IS NOT NULL ORDER BY received_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function findWebhookEvent(q: Queryable, id: number) {
  const { rows } = await q.query<{ id: number; provider: string; event_type: string; payload: unknown }>(
    'SELECT id, provider, event_type, payload FROM webhook_events WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

// ── Ops alerts + ops metrics (Phase 10 §10.3) ────────────────────────────────────────────────────

export async function opsAlertCounts(q: Queryable) {
  const { rows } = await q.query<{ ops_issues_over_1h: number; webhook_failures_1h: number; payments_stuck: number }>(
    `SELECT
       (SELECT count(*) FROM orders WHERE ops_issue IS NOT NULL AND updated_at < NOW() - INTERVAL '1 hour')::int AS ops_issues_over_1h,
       (SELECT count(*) FROM webhook_events WHERE last_error IS NOT NULL AND processed_at IS NULL
          AND received_at > NOW() - INTERVAL '1 hour')::int AS webhook_failures_1h,
       (SELECT count(*) FROM orders WHERE status = 'PENDING_PAYMENT'
          AND reservation_expires_at < NOW() - INTERVAL '10 minutes')::int AS payments_stuck`,
  );
  return rows[0]!;
}

/** Last 24 h orders per IST hour, 30-day refund / NDR / RTO figures for the ops dashboard. */
export async function opsMetrics(q: Queryable) {
  const [hours, rates] = await Promise.all([
    q.query<{ hour: string; orders: number }>(
      `SELECT to_char(h, 'YYYY-MM-DD"T"HH24:00') AS hour, count(o.id)::int AS orders
         FROM generate_series(date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '23 hours',
                              date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata'), INTERVAL '1 hour') AS h
         LEFT JOIN orders o ON o.confirmed_at IS NOT NULL
                           AND date_trunc('hour', o.confirmed_at AT TIME ZONE 'Asia/Kolkata') = h
        GROUP BY h ORDER BY h`,
    ),
    q.query<{ refunds: number; refunded_paise: number; shipped: number; ndr: number; rto: number }>(
      `SELECT
         (SELECT count(*) FROM refunds WHERE created_at > NOW() - INTERVAL '30 days' AND reason <> 'DUPLICATE_PAYMENT')::int AS refunds,
         (SELECT COALESCE(sum(amount_paise), 0) FROM refunds WHERE status = 'PROCESSED'
            AND created_at > NOW() - INTERVAL '30 days')::bigint AS refunded_paise,
         (SELECT count(*) FROM orders WHERE shipped_at > NOW() - INTERVAL '30 days')::int AS shipped,
         (SELECT count(DISTINCT l.order_id) FROM order_status_logs l JOIN orders o ON o.id = l.order_id
            WHERE l.to_status = 'DELIVERY_FAILED' AND o.shipped_at > NOW() - INTERVAL '30 days')::int AS ndr,
         (SELECT count(DISTINCT l.order_id) FROM order_status_logs l JOIN orders o ON o.id = l.order_id
            WHERE l.to_status = 'RTO_IN_TRANSIT' AND o.shipped_at > NOW() - INTERVAL '30 days')::int AS rto`,
    ),
  ]);
  return { hours: hours.rows, rates: rates.rows[0]! };
}
