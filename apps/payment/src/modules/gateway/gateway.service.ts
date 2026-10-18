import { randomInt } from 'node:crypto';
import type { Db, Queryable } from '../../config/db';
import { randomId } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { announcePaymentCaptured, announceRefund } from '../outbox/outbox.service';
import * as repo from './gateway.repository';

const MAX_OFFSET = 99;

/**
 * In-transaction building blocks for the alert matcher and admin links (other modules use these,
 * never the repository directly — architecture/09 §2.1).
 */
export const orderStore = {
  find: repo.findOrder,
  lockOpenForCredit: repo.lockOpenOrderForCredit,
  paymentByUtr: repo.paymentByUtr,
  audit: repo.audit,

  /**
   * Books a credit against an order: payment row, order → paid, payment.captured into the outbox.
   * The store sees the order amount only when exactly the payable amount arrived; otherwise
   * received + offset, which the store treats as AMOUNT_MISMATCH (refund + ops issue).
   */
  async capture(
    client: Queryable,
    order: repo.OrderRow,
    credit: { receivedPaise: number; utr: string; alertId: number },
  ): Promise<repo.PaymentRow> {
    const offset = order.amount_paise - order.payable_paise;
    const payment = await repo.insertPayment(client, {
      id: randomId('pay'),
      orderId: order.id,
      amountPaise: credit.receivedPaise === order.payable_paise ? order.amount_paise : credit.receivedPaise + offset,
      receivedPaise: credit.receivedPaise,
      utr: credit.utr,
      alertId: credit.alertId,
    });
    await repo.markOrderPaid(client, order.id);
    await announcePaymentCaptured(client, order, payment);
    return payment;
  },
};

/**
 * The Razorpay-compatible core: orders, payments, refunds. Payments are never created here —
 * only the alert matcher (or an admin link) creates them; this service reads them back.
 */
export function createGatewayService(deps: {
  db: Db;
  lateGraceMinutes: number;
  defaultHoldMinutes: number;
  now?: () => Date;
}) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  /** The store passes its jar-reservation end in notes; anything implausible falls back to the default. */
  function expiryFrom(notes: Record<string, string>): Date {
    const t = Date.parse(notes.reservation_expires_at ?? '');
    const n = now().getTime();
    if (Number.isFinite(t) && t > n + 60_000 && t <= n + 60 * 60_000) return new Date(t);
    return new Date(n + deps.defaultHoldMinutes * 60_000);
  }

  return {
    async createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
      const expiresAt = expiryFrom(input.notes);
      const holdUntil = new Date(expiresAt.getTime() + deps.lateGraceMinutes * 60_000);
      // Every open order needs a different amount on the bank alert: amount − 0..99 paise.
      // Same-total checkouts are serialised by an advisory lock; an overlapping window from another
      // total can still race, which the partial unique index turns into a retry.
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await db.transaction(async (client) => {
          await repo.lockAmount(client, input.amountPaise);
          const taken = await repo.takenPayables(client, input.amountPaise);
          const free: number[] = [];
          for (let off = 0; off <= MAX_OFFSET; off++) {
            const payable = input.amountPaise - off;
            if (payable >= 100 && !taken.has(payable)) free.push(payable);
          }
          if (free.length === 0)
            throw new AppError('AMOUNTS_EXHAUSTED', 'Too many open UPI payments for this amount right now.');
          return repo.insertOrder(client, {
            id: randomId('order'),
            receipt: input.receipt,
            amountPaise: input.amountPaise,
            payablePaise: free[randomInt(free.length)]!,
            notes: input.notes,
            expiresAt,
            holdUntil,
          });
        });
        if (row) return row;
      }
      throw new AppError('AMOUNTS_EXHAUSTED', 'Too many open UPI payments for this amount right now.');
    },

    async getOrder(id: string) {
      const order = await repo.findOrder(db, id);
      if (!order) throw new AppError('NOT_FOUND', 'The id provided does not exist');
      return order;
    },

    async getPayment(id: string) {
      const payment = await repo.findPayment(db, id);
      if (!payment) throw new AppError('NOT_FOUND', 'The id provided does not exist');
      return payment;
    },

    findByReceipt: (receipt: string) => repo.findOrdersByReceipt(db, receipt),
    listOrderPayments: (orderId: string) => repo.listOrderPayments(db, orderId),
    listRefunds: (paymentId: string) => repo.listRefunds(db, paymentId),

    /**
     * Refund request from the store. Plain UPI has no refund API, so this only records the request;
     * an admin pays the customer back and completes it (CLI), which sends refund.processed.
     * Idempotent on the store's idempotency key.
     */
    async createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }) {
      const key = input.notes.idempotency_key;
      if (!key || key.length > 100) throw new AppError('BAD_REQUEST_ERROR', 'notes.idempotency_key is required');
      return db.transaction(async (client) => {
        const payment = await repo.findPayment(client, input.paymentId, true);
        if (!payment) throw new AppError('NOT_FOUND', 'The id provided does not exist');
        const existing = await repo.refundByKey(client, key);
        if (existing) {
          if (existing.payment_id !== payment.id) throw new AppError('BAD_REQUEST_ERROR', 'Idempotency key reused');
          return existing;
        }
        const refunds = await repo.listRefunds(client, payment.id);
        const committed = refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + r.amount_paise, 0);
        // Same rule as Razorpay, in the store's amounts. The admin pays back at most what actually
        // arrived (received_paise) — the CLI shows both.
        if (input.amountPaise > payment.amount_paise - committed) {
          throw new AppError('BAD_REQUEST_ERROR', 'The total refund amount is greater than the refund payment amount');
        }
        const { idempotency_key: _drop, ...notes } = input.notes;
        return repo.insertRefund(client, {
          id: randomId('rfnd'),
          paymentId: payment.id,
          amountPaise: input.amountPaise,
          key,
          notes,
        });
      });
    },

    /** Admin (CLI): the money was sent back (`utr` = the refund transfer's reference) or it can't be. */
    async settleRefund(
      refundId: string,
      outcome: { status: 'processed'; utr: string } | { status: 'failed'; reason: string },
      by: string,
    ) {
      return db.transaction(async (client) => {
        const refund = await repo.findRefund(client, refundId, true);
        if (!refund) throw new AppError('NOT_FOUND', 'Refund not found');
        if (refund.status !== 'pending') throw new AppError('CONFLICT', `Refund is already ${refund.status}`);
        const settled = await repo.settleRefund(client, refundId, {
          status: outcome.status,
          utr: outcome.status === 'processed' ? outcome.utr : null,
          reason: outcome.status === 'failed' ? outcome.reason : null,
          by,
        });
        await announceRefund(client, settled);
        await repo.audit(client, {
          actor: by,
          action: outcome.status === 'processed' ? 'REFUND_COMPLETED' : 'REFUND_FAILED',
          entityId: refundId,
          details: outcome.status === 'processed' ? { refundUtr: outcome.utr } : { reason: outcome.reason },
        });
        return settled;
      });
    },

    listPendingRefunds: () => repo.listPendingRefunds(db),
    expireOverdue: () => repo.expireOverdue(db),
  };
}

export type GatewayService = ReturnType<typeof createGatewayService>;
