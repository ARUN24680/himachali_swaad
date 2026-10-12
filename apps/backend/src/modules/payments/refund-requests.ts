import { canPaymentTransition, type ActorType, type PaymentStatus, type RefundReason } from '@pk/shared';
import type { Queryable } from '../../config/db';
import { AppError } from '../../utils/app-error';
import * as repo from './payments.repository';

/**
 * Guarded payment-summary change (architecture/07 §2). Like transitionOrder() for orders.status:
 * the map is checked, the UPDATE is optimistic, a lost race is STALE_STATE.
 */
export async function changePaymentStatus(
  client: Queryable,
  orderId: string,
  from: PaymentStatus,
  to: PaymentStatus,
): Promise<void> {
  if (!canPaymentTransition(from, to)) {
    throw new AppError('ILLEGAL_TRANSITION', `Payment cannot move from ${from} to ${to}.`, { from, to });
  }
  if (!(await repo.updatePaymentStatusGuarded(client, orderId, from, to))) {
    throw new AppError('STALE_STATE', 'Payment status changed meanwhile.', { from, to });
  }
}

/**
 * Records a refund INTENT inside the caller's transaction (idempotent on `refund:<paymentId>:<reason>`).
 * The INITIATE_REFUND job makes the gateway call after COMMIT (D-30). Order-level refunds move
 * PAID → REFUND_PENDING; a DUPLICATE_PAYMENT refund leaves the order's payment status alone.
 * Returns the refund id to enqueue.
 */
export async function requestRefund(
  client: Queryable,
  r: {
    orderId: string;
    paymentStatus: PaymentStatus;
    reason: RefundReason;
    by: { type: ActorType; id: string | null };
    notes?: string | null;
    /** Defaults to the order's first captured payment. */
    paymentId?: string;
  },
): Promise<string> {
  const captured = await repo.listCapturedPayments(client, r.orderId);
  const payment = r.paymentId ? captured.find((p) => p.id === r.paymentId) : captured[0];
  if (!payment) throw new Error(`requestRefund: order ${r.orderId} has no captured payment`);

  const idempotencyKey = `refund:${payment.id}:${r.reason}`;
  const inserted = await repo.insertRefund(client, {
    orderId: r.orderId,
    paymentId: payment.id,
    idempotencyKey,
    amountPaise: payment.amount_paise,
    reason: r.reason,
    notes: r.notes ?? null,
    initiatedByType: r.by.type,
    initiatedById: r.by.id,
  });
  if (r.reason !== 'DUPLICATE_PAYMENT' && r.paymentStatus === 'PAID') {
    await changePaymentStatus(client, r.orderId, 'PAID', 'REFUND_PENDING');
  }
  if (inserted) return inserted.id;
  const existing = await repo.findRefundByKey(client, idempotencyKey);
  return existing!.id;
}

/** The order's latest order-level refund (status page). */
export const latestOrderRefund = (q: Queryable, orderId: string) => repo.latestOrderRefund(q, orderId);
/** Refund row for other modules (refund_processed message). */
export const findRefund = (q: Queryable, refundId: string) => repo.findRefundById(q, refundId);
