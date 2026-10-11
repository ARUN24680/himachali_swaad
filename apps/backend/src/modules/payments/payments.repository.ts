import { PaymentRowSchema, RefundRowSchema, type ActorType, type PaymentStatus } from '@pk/shared';
import type { Queryable } from '../../config/db';

/** Raw SQL for payments, refunds and webhook_events (D-01, D-07). */

/** Records a captured payment attempt; idempotent on gateway_payment_id (07 §4.2). Returns the row. */
export async function upsertCapturedPayment(
  q: Queryable,
  p: { orderId: string; gatewayOrderId: string; gatewayPaymentId: string; amountPaise: number; method: string | null },
) {
  const { rows } = await q.query(
    `INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, amount_paise, method, status)
     VALUES ($1, $2, $3, $4, $5, 'CAPTURED')
     ON CONFLICT (gateway_payment_id) DO UPDATE SET status = 'CAPTURED', method = COALESCE(EXCLUDED.method, payments.method)
     RETURNING *`,
    [p.orderId, p.gatewayOrderId, p.gatewayPaymentId, p.amountPaise, p.method],
  );
  return PaymentRowSchema.parse(rows[0]);
}

/** payment.failed — never downgrades a CAPTURED row (events can arrive out of order). */
export async function upsertFailedPayment(
  q: Queryable,
  p: {
    orderId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    amountPaise: number;
    method: string | null;
    errorCode: string | null;
    errorDescription: string | null;
  },
): Promise<void> {
  await q.query(
    `INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, amount_paise, method, status,
                           error_code, error_description)
     VALUES ($1, $2, $3, $4, $5, 'FAILED', $6, $7)
     ON CONFLICT (gateway_payment_id) DO UPDATE
        SET status = 'FAILED', error_code = EXCLUDED.error_code, error_description = EXCLUDED.error_description
      WHERE payments.status <> 'CAPTURED'`,
    [p.orderId, p.gatewayOrderId, p.gatewayPaymentId, p.amountPaise, p.method, p.errorCode, p.errorDescription],
  );
}

/** Captured attempts other than `exceptPaymentId` — a second capture on one order is a duplicate payment. */
export async function listCapturedPayments(q: Queryable, orderId: string) {
  const { rows } = await q.query(
    "SELECT * FROM payments WHERE order_id = $1 AND status = 'CAPTURED' ORDER BY created_at, id",
    [orderId],
  );
  return rows.map((r) => PaymentRowSchema.parse(r));
}

export async function findPaymentById(q: Queryable, id: string) {
  const { rows } = await q.query('SELECT * FROM payments WHERE id = $1', [id]);
  return rows[0] ? PaymentRowSchema.parse(rows[0]) : null;
}

/** Refund intent, created in the same transaction as the decision (idempotent on the key). */
export async function insertRefund(
  q: Queryable,
  r: {
    orderId: string;
    paymentId: string;
    idempotencyKey: string;
    amountPaise: number;
    reason: string;
    notes: string | null;
    initiatedByType: ActorType;
    initiatedById: string | null;
  },
) {
  const { rows } = await q.query(
    `INSERT INTO refunds (order_id, payment_id, idempotency_key, amount_paise, reason, notes,
                          initiated_by_type, initiated_by_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [r.orderId, r.paymentId, r.idempotencyKey, r.amountPaise, r.reason, r.notes, r.initiatedByType, r.initiatedById],
  );
  return rows[0] ? RefundRowSchema.parse(rows[0]) : null;
}

export async function findRefundById(q: Queryable, id: string, forUpdate = false) {
  const { rows } = await q.query(`SELECT * FROM refunds WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return rows[0] ? RefundRowSchema.parse(rows[0]) : null;
}

export async function findRefundForWebhook(q: Queryable, gatewayRefundId: string, idempotencyKey: string | null) {
  const { rows } = await q.query(
    `SELECT * FROM refunds WHERE gateway_refund_id = $1 OR ($2::text IS NOT NULL AND idempotency_key = $2)
      ORDER BY (gateway_refund_id = $1) DESC NULLS LAST LIMIT 1 FOR UPDATE`,
    [gatewayRefundId, idempotencyKey],
  );
  return rows[0] ? RefundRowSchema.parse(rows[0]) : null;
}

export async function setGatewayRefundId(q: Queryable, refundId: string, gatewayRefundId: string): Promise<void> {
  await q.query('UPDATE refunds SET gateway_refund_id = $2 WHERE id = $1 AND gateway_refund_id IS NULL', [
    refundId,
    gatewayRefundId,
  ]);
}

export async function markRefundProcessed(q: Queryable, refundId: string, gatewayRefundId: string): Promise<boolean> {
  const res = await q.query(
    `UPDATE refunds SET status = 'PROCESSED', processed_at = NOW(), gateway_refund_id = COALESCE(gateway_refund_id, $2)
      WHERE id = $1 AND status <> 'PROCESSED'`,
    [refundId, gatewayRefundId],
  );
  return res.rowCount === 1;
}

export async function markRefundFailed(
  q: Queryable,
  refundId: string,
  gatewayRefundId: string | null,
): Promise<boolean> {
  const res = await q.query(
    `UPDATE refunds SET status = 'FAILED', gateway_refund_id = COALESCE(gateway_refund_id, $2)
      WHERE id = $1 AND status = 'PENDING'`,
    [refundId, gatewayRefundId],
  );
  return res.rowCount === 1;
}

/** Order-level refunds (not duplicate-payment refunds) — drive orders.payment_status. */
export async function sumOrderRefunds(q: Queryable, orderId: string) {
  const { rows } = await q.query<{ processed: number; pending: number }>(
    `SELECT COALESCE(SUM(amount_paise) FILTER (WHERE status = 'PROCESSED'), 0)::bigint AS processed,
            COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
       FROM refunds WHERE order_id = $1 AND reason <> 'DUPLICATE_PAYMENT'`,
    [orderId],
  );
  return rows[0]!;
}

export async function latestOrderRefund(q: Queryable, orderId: string) {
  const { rows } = await q.query(
    "SELECT * FROM refunds WHERE order_id = $1 AND reason <> 'DUPLICATE_PAYMENT' ORDER BY created_at DESC LIMIT 1",
    [orderId],
  );
  return rows[0] ? RefundRowSchema.parse(rows[0]) : null;
}

/** RECONCILE_REFUNDS: intents older than 30 min the gateway never accepted. */
export async function listStuckRefunds(q: Queryable, limit: number) {
  const { rows } = await q.query<{ id: string }>(
    `SELECT id FROM refunds
      WHERE status = 'PENDING' AND gateway_refund_id IS NULL AND created_at < NOW() - INTERVAL '30 minutes'
      ORDER BY created_at LIMIT $1`,
    [limit],
  );
  return rows.map((r) => r.id);
}

export async function findRefundByKey(q: Queryable, idempotencyKey: string) {
  const { rows } = await q.query('SELECT * FROM refunds WHERE idempotency_key = $1', [idempotencyKey]);
  return rows[0] ? RefundRowSchema.parse(rows[0]) : null;
}

/** Payment summary change, guarded like the status (07 §2 map is checked by the caller). */
export async function updatePaymentStatusGuarded(
  q: Queryable,
  orderId: string,
  from: PaymentStatus,
  to: PaymentStatus,
): Promise<boolean> {
  const res = await q.query('UPDATE orders SET payment_status = $3 WHERE id = $1 AND payment_status = $2', [
    orderId,
    from,
    to,
  ]);
  return res.rowCount === 1;
}
