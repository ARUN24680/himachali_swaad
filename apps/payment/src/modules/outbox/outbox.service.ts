import type { Logger } from 'pino';
import type { Db, Queryable } from '../../config/db';
import { hmacHex, randomId } from '../../lib/crypto';
import type { OrderRow, PaymentRow, RefundRow } from '../gateway/gateway.repository';
import * as repo from './outbox.repository';

const MAX_ATTEMPTS = 20; // 5 s, 10 s, 20 s … capped at 1 h ≈ a day of retries
const TIMEOUT_MS = 10_000;

/** Razorpay entity shapes — the store's webhook handler and REST client parse exactly these. */
export const paymentEntity = (o: Pick<OrderRow, 'id'>, p: PaymentRow) => ({
  id: p.id,
  entity: 'payment',
  amount: p.amount_paise,
  currency: 'INR',
  status: 'captured',
  order_id: o.id,
  method: 'upi',
  // The 0–99 paise the customer did not pay (unique-amount offset) is the "gateway cost" in the
  // store's settlements (D-41); there is no GST on it.
  fee: Math.max(0, p.amount_paise - p.received_paise),
  tax: 0,
  error_code: null,
  error_description: null,
  created_at: Math.floor(p.created_at.getTime() / 1000),
});

export const refundEntity = (r: RefundRow) => ({
  id: r.id,
  entity: 'refund',
  amount: r.amount_paise,
  currency: 'INR',
  payment_id: r.payment_id,
  status: r.status,
  notes: { ...r.notes, idempotency_key: r.idempotency_key },
  created_at: Math.floor(r.created_at.getTime() / 1000),
});

function eventBody(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    entity: 'event',
    account_id: 'acc_direct_upi',
    event,
    contains: Object.keys(payload),
    payload,
    created_at: Math.floor(Date.now() / 1000),
  });
}

export async function announcePaymentCaptured(q: Queryable, order: OrderRow, payment: PaymentRow): Promise<void> {
  await repo.enqueue(q, {
    eventId: randomId('evt'),
    event: 'payment.captured',
    body: eventBody('payment.captured', { payment: { entity: paymentEntity(order, payment) } }),
  });
}

export async function announceRefund(q: Queryable, refund: RefundRow): Promise<void> {
  const event = refund.status === 'processed' ? 'refund.processed' : 'refund.failed';
  await repo.enqueue(q, {
    eventId: randomId('evt'),
    event,
    body: eventBody(event, { refund: { entity: refundEntity(refund) } }),
  });
}

/**
 * Delivers outbox rows to the store as Razorpay-format webhooks: HMAC-SHA256 of the exact body in
 * `x-razorpay-signature`, our event id in `x-razorpay-event-id` (the store dedups on it).
 */
export function createDispatcher(deps: {
  db: Db;
  url: string;
  secret: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
}) {
  const doFetch = deps.fetchImpl ?? fetch;

  async function send(row: repo.OutboxRow): Promise<void> {
    try {
      const res = await doFetch(deps.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': hmacHex(deps.secret, row.body),
          'x-razorpay-event-id': row.event_id,
        },
        body: row.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        await repo.markDelivered(deps.db, row.id);
        return;
      }
      throw new Error(`store webhook answered ${res.status}`);
    } catch (err) {
      const attempts = row.attempts + 1;
      const retryIn = attempts >= MAX_ATTEMPTS ? null : Math.min(3600, 5 * 2 ** (attempts - 1));
      await repo.markFailed(deps.db, row.id, (err as Error).message, retryIn);
      const log = { eventId: row.event_id, event: row.event, attempts, err: (err as Error).message };
      if (retryIn === null) deps.logger.error(log, 'webhook to store gave up — store sweepers reconcile via the API');
      else deps.logger.warn(log, 'webhook to store failed, will retry');
    }
  }

  return {
    /** One pass; returns how many rows were attempted. */
    async tick(limit = 20): Promise<number> {
      const rows = await repo.claimDue(deps.db, limit);
      for (const row of rows) await send(row); // in order: captured before a later refund event
      return rows.length;
    },
  };
}
