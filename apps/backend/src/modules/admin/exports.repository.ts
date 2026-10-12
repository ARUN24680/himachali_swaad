import type { Queryable } from '../../config/db';

/** Read-only queries behind the CSV exports (Phase 9 §9.10). Dates are IST calendar days. */
const IST_RANGE = (col: string) => `(${col} AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;

export async function ordersExport(q: Queryable, from: string, to: string) {
  const { rows } = await q.query<{
    order_code: string;
    created_ist: string;
    status: string;
    payment_status: string;
    customer_name: string;
    city: string;
    state: string;
    items: string;
    subtotal_paise: number;
    shipping_fee_paise: number;
    tax_paise: number;
    total_paise: number;
    refunded_paise: number;
    courier_name: string | null;
    awb_code: string | null;
    invoice_number: string | null;
  }>(
    `SELECT o.order_code, to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS created_ist,
            o.status, o.payment_status, o.customer_name, o.shipping_address->>'city' AS city,
            o.shipping_address->>'state' AS state,
            (SELECT string_agg(oi.quantity || 'x ' || oi.sku, '; ' ORDER BY oi.sku) FROM order_items oi WHERE oi.order_id = o.id) AS items,
            o.subtotal_paise, o.shipping_fee_paise, o.tax_paise, o.total_paise,
            (SELECT COALESCE(sum(amount_paise), 0) FROM refunds r WHERE r.order_id = o.id AND r.status = 'PROCESSED')::bigint AS refunded_paise,
            s.courier_name, s.awb_code, o.invoice_number
       FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
      WHERE o.status NOT IN ('PENDING_PAYMENT', 'EXPIRED') AND ${IST_RANGE('o.created_at')}
      ORDER BY o.created_at`,
    [from, to],
  );
  return rows;
}

/**
 * GST summary for the CA: invoiced orders by invoice month (IST confirm day), HSN and rate. Tax per
 * line = the GST-inclusive share stored on the order (D-26); the sum equals Σ orders.tax_paise.
 */
export async function gstSummary(q: Queryable, from: string, to: string) {
  const { rows } = await q.query<{
    month: string;
    hsn_code: string;
    gst_rate_bp: number;
    orders: number;
    quantity: number;
    gross_paise: number;
    tax_paise: number;
  }>(
    `SELECT to_char(o.confirmed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, oi.hsn_code, oi.gst_rate_bp,
            count(DISTINCT o.id)::int AS orders, sum(oi.quantity)::int AS quantity,
            sum(oi.total_price_paise)::bigint AS gross_paise,
            sum(round(oi.total_price_paise::numeric * oi.gst_rate_bp / (10000 + oi.gst_rate_bp)))::bigint AS tax_paise
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.confirmed_at IS NOT NULL AND o.status NOT IN ('PENDING_PAYMENT', 'EXPIRED') AND ${IST_RANGE('o.confirmed_at')}
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
    [from, to],
  );
  return rows;
}

export async function ledgerExport(q: Queryable, from: string, to: string) {
  const { rows } = await q.query<{
    at_ist: string;
    batch_code: string;
    title: string;
    kitchen_code: string;
    movement_type: string;
    quantity_delta: number;
    order_code: string | null;
    reason: string | null;
  }>(
    `SELECT to_char(m.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS at_ist, b.batch_code, p.title,
            pl.code AS kitchen_code, m.movement_type, m.quantity_delta, o.order_code, m.reason
       FROM inventory_movements m
       JOIN inventory_batches b ON b.id = m.batch_id
       JOIN products p ON p.id = b.product_id
       JOIN pickup_locations pl ON pl.id = b.pickup_location_id
       LEFT JOIN orders o ON o.id = m.order_id
      WHERE ${IST_RANGE('m.created_at')}
      ORDER BY m.created_at, m.id`,
    [from, to],
  );
  return rows;
}

export async function customersExport(q: Queryable) {
  const { rows } = await q.query<{
    phone: string;
    name: string;
    email: string | null;
    orders_count: number;
    ltv: number;
    last_order_ist: string;
    rto_count: number;
  }>(
    `SELECT o.customer_phone AS phone, (array_agg(o.customer_name ORDER BY o.created_at DESC))[1] AS name,
            (array_agg(o.customer_email ORDER BY o.created_at DESC) FILTER (WHERE o.customer_email IS NOT NULL))[1] AS email,
            count(*)::int AS orders_count,
            COALESCE(sum(o.total_paise) FILTER (WHERE o.status <> 'CANCELLED'), 0)::bigint AS ltv,
            to_char(max(o.created_at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS last_order_ist,
            count(*) FILTER (WHERE o.status IN ('RTO_IN_TRANSIT', 'RTO_DELIVERED'))::int AS rto_count
       FROM orders o WHERE o.status NOT IN ('PENDING_PAYMENT', 'EXPIRED')
      GROUP BY o.customer_phone ORDER BY max(o.created_at) DESC`,
  );
  return rows;
}

export async function settlementExport(q: Queryable, settlementId: string) {
  const { rows } = await q.query<{
    order_code: string;
    status: string;
    closed_at: Date;
    jars: number;
    revenue_ex_gst_paise: number;
    raw_cost_paise: number;
    packaging_cost_paise: number;
    freight_paise: number;
    gateway_fee_paise: number;
    refunds_paise: number;
    rto_freight_paise: number;
    net_paise: number;
  }>(
    `SELECT o.order_code, o.status, si.closed_at, si.jars, si.revenue_ex_gst_paise, si.raw_cost_paise, si.packaging_cost_paise,
            si.freight_paise, si.gateway_fee_paise, si.refunds_paise, si.rto_freight_paise, si.net_paise
       FROM settlement_items si JOIN orders o ON o.id = si.order_id
      WHERE si.settlement_id = $1 ORDER BY si.closed_at, o.order_code`,
    [settlementId],
  );
  return rows;
}
