import type { Queryable } from '../../config/db';

export interface OrderRow {
  id: string;
  receipt: string;
  amount_paise: number;
  payable_paise: number;
  notes: Record<string, string>;
  status: 'created' | 'paid' | 'expired';
  expires_at: Date;
  hold_until: Date;
  created_at: Date;
  paid_at: Date | null;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  amount_paise: number;
  received_paise: number;
  utr: string;
  alert_id: number;
  created_at: Date;
}

export interface RefundRow {
  id: string;
  payment_id: string;
  amount_paise: number;
  status: 'pending' | 'processed' | 'failed';
  idempotency_key: string;
  notes: Record<string, string>;
  refund_utr: string | null;
  failure_reason: string | null;
  created_at: Date;
  settled_at: Date | null;
}

export async function lockAmount(q: Queryable, amountPaise: number): Promise<void> {
  await q.query(`SELECT pg_advisory_xact_lock(hashtextextended('upi-amount:' || $1::text, 0))`, [amountPaise]);
}

/** Payable amounts (amount − 0..99) already taken by an open order. */
export async function takenPayables(q: Queryable, amountPaise: number): Promise<Set<number>> {
  const r = await q.query<{ payable_paise: number }>(
    `SELECT payable_paise FROM upi_orders
      WHERE status = 'created' AND payable_paise BETWEEN $1 AND $2`,
    [amountPaise - 99, amountPaise],
  );
  return new Set(r.rows.map((row) => row.payable_paise));
}

/** Insert or nothing when another open order grabbed the same payable amount meanwhile. */
export async function insertOrder(
  q: Queryable,
  o: {
    id: string;
    receipt: string;
    amountPaise: number;
    payablePaise: number;
    notes: Record<string, string>;
    expiresAt: Date;
    holdUntil: Date;
  },
): Promise<OrderRow | null> {
  const r = await q.query<OrderRow>(
    `INSERT INTO upi_orders (id, receipt, amount_paise, payable_paise, notes, expires_at, hold_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (payable_paise) WHERE status = 'created' DO NOTHING
     RETURNING *`,
    [o.id, o.receipt, o.amountPaise, o.payablePaise, JSON.stringify(o.notes), o.expiresAt, o.holdUntil],
  );
  return r.rows[0] ?? null;
}

export async function findOrder(q: Queryable, id: string, lock = false): Promise<OrderRow | null> {
  const r = await q.query<OrderRow>(`SELECT * FROM upi_orders WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return r.rows[0] ?? null;
}

export async function findOrdersByReceipt(q: Queryable, receipt: string): Promise<OrderRow[]> {
  const r = await q.query<OrderRow>(`SELECT * FROM upi_orders WHERE receipt = $1 ORDER BY created_at DESC`, [receipt]);
  return r.rows;
}

/** The open order a credit of `amount` at `at` belongs to (at most one — partial unique index). */
export async function lockOpenOrderForCredit(q: Queryable, amountPaise: number, at: Date): Promise<OrderRow | null> {
  const r = await q.query<OrderRow>(
    `SELECT * FROM upi_orders
      WHERE status = 'created' AND payable_paise = $1
        AND created_at <= $2::timestamptz + INTERVAL '2 minutes' AND hold_until >= $2
      FOR UPDATE`,
    [amountPaise, at],
  );
  return r.rows[0] ?? null;
}

export async function markOrderPaid(q: Queryable, id: string): Promise<void> {
  await q.query(`UPDATE upi_orders SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status <> 'paid'`, [id]);
}

/** Frees the amounts of orders past their hold (late-payment grace included). */
export async function expireOverdue(q: Queryable, limit = 500): Promise<number> {
  const r = await q.query(
    `UPDATE upi_orders SET status = 'expired'
      WHERE id IN (SELECT id FROM upi_orders WHERE status = 'created' AND hold_until < NOW()
                    ORDER BY hold_until LIMIT $1 FOR UPDATE SKIP LOCKED)`,
    [limit],
  );
  return r.rowCount ?? 0;
}

export async function insertPayment(
  q: Queryable,
  p: { id: string; orderId: string; amountPaise: number; receivedPaise: number; utr: string; alertId: number },
): Promise<PaymentRow> {
  const r = await q.query<PaymentRow>(
    `INSERT INTO upi_payments (id, order_id, amount_paise, received_paise, utr, alert_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [p.id, p.orderId, p.amountPaise, p.receivedPaise, p.utr, p.alertId],
  );
  return r.rows[0]!;
}

export async function findPayment(q: Queryable, id: string, lock = false): Promise<PaymentRow | null> {
  const r = await q.query<PaymentRow>(`SELECT * FROM upi_payments WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return r.rows[0] ?? null;
}

export async function paymentByUtr(q: Queryable, utr: string): Promise<PaymentRow | null> {
  const r = await q.query<PaymentRow>(`SELECT * FROM upi_payments WHERE utr = $1`, [utr]);
  return r.rows[0] ?? null;
}

export async function listOrderPayments(q: Queryable, orderId: string): Promise<PaymentRow[]> {
  const r = await q.query<PaymentRow>(`SELECT * FROM upi_payments WHERE order_id = $1 ORDER BY created_at, id`, [
    orderId,
  ]);
  return r.rows;
}

export async function listRefunds(q: Queryable, paymentId: string): Promise<RefundRow[]> {
  const r = await q.query<RefundRow>(`SELECT * FROM upi_refunds WHERE payment_id = $1 ORDER BY created_at, id`, [
    paymentId,
  ]);
  return r.rows;
}

export async function refundByKey(q: Queryable, key: string): Promise<RefundRow | null> {
  const r = await q.query<RefundRow>(`SELECT * FROM upi_refunds WHERE idempotency_key = $1`, [key]);
  return r.rows[0] ?? null;
}

export async function insertRefund(
  q: Queryable,
  r: { id: string; paymentId: string; amountPaise: number; key: string; notes: Record<string, string> },
): Promise<RefundRow> {
  const res = await q.query<RefundRow>(
    `INSERT INTO upi_refunds (id, payment_id, amount_paise, idempotency_key, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [r.id, r.paymentId, r.amountPaise, r.key, JSON.stringify(r.notes)],
  );
  return res.rows[0]!;
}

export async function findRefund(q: Queryable, id: string, lock = false): Promise<RefundRow | null> {
  const r = await q.query<RefundRow>(`SELECT * FROM upi_refunds WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return r.rows[0] ?? null;
}

export async function settleRefund(
  q: Queryable,
  id: string,
  s: { status: 'processed' | 'failed'; utr: string | null; reason: string | null; by: string },
): Promise<RefundRow> {
  const r = await q.query<RefundRow>(
    `UPDATE upi_refunds SET status = $2, refund_utr = $3, failure_reason = $4, settled_at = NOW(), settled_by = $5
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, s.status, s.utr, s.reason, s.by],
  );
  return r.rows[0]!;
}

export async function listPendingRefunds(q: Queryable): Promise<(RefundRow & { receipt: string; utr: string })[]> {
  const r = await q.query<RefundRow & { receipt: string; utr: string }>(
    `SELECT f.*, o.receipt, p.utr FROM upi_refunds f
       JOIN upi_payments p ON p.id = f.payment_id JOIN upi_orders o ON o.id = p.order_id
      WHERE f.status = 'pending' ORDER BY f.created_at`,
  );
  return r.rows;
}

export async function audit(
  q: Queryable,
  a: { actor: string; action: string; entityId: string | null; details: Record<string, unknown> },
): Promise<void> {
  await q.query(`INSERT INTO upi_admin_audit (actor, action, entity_id, details) VALUES ($1, $2, $3, $4)`, [
    a.actor,
    a.action,
    a.entityId,
    JSON.stringify(a.details),
  ]);
}
