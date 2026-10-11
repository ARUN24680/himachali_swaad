import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import { paymentEntity, refundEntity } from '../../src/integrations/razorpay/mock';
import { createCommerceServices } from '../../src/services';
import { createPickupLocation } from '../helpers/factories';
import {
  batchStock,
  capturedWebhook,
  expireHold,
  liveProduct,
  orderRow,
  payAtGateway,
  placeOrder,
  sendWebhook,
  statusLog,
  verify,
} from '../helpers/checkout';
import {
  buildTestApp,
  fakeReporter,
  recordingJobs,
  spyRevalidator,
  testGateway,
  testPrivateStorage,
  testStorage,
} from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** confirmPayment() via verify + webhook (07 §4.2–4.3), late payments, refunds. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
const jobs = recordingJobs();
let kitchen: { id: string };

beforeAll(async () => {
  t = await createTestDb({ max: 20 });
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  gateway = testGateway(redis);
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs });
  kitchen = await createPickupLocation(t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});
beforeEach(() => jobs.clear());

/** Places an order for `qty` jars of a fresh product and returns the checkout response + product. */
async function newOrder(stock = 5, qty = 2) {
  const p = await liveProduct(t.db, kitchen.id, { stock });
  const res = await placeOrder(app, [{ productId: p.id, quantity: qty }]);
  expect(res.statusCode).toBe(201);
  return { p, co: res.json().data as { orderCode: string; razorpayOrderId: string; amountPaise: number } };
}

const jobsFor = (orderId: string) => jobs.jobs.filter((j) => JSON.stringify(j.data).includes(orderId));

describe('verify → CONFIRMED', () => {
  it('commits the reservation, logs the transition, enqueues ship + invoice + notify once', async () => {
    const { p, co } = await newOrder(5, 2);
    const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
    const res = await verify(app, verifyBody);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ orderCode: co.orderCode, status: 'CONFIRMED' });

    const order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'CONFIRMED', payment_status: 'PAID' });
    expect(order.confirmed_at).not.toBeNull();
    expect(await batchStock(t.db, p.batchId!)).toBe(3);
    const { rows } = await t.db.query(
      'SELECT a.status FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id WHERE oi.order_id = $1',
      [order.id],
    );
    expect(rows.map((r) => r.status)).toEqual(['COMMITTED']);
    expect(await statusLog(t.db, order.id)).toEqual([
      { from_status: null, to_status: 'PENDING_PAYMENT', actor_type: 'CUSTOMER', reason: null },
      { from_status: 'PENDING_PAYMENT', to_status: 'CONFIRMED', actor_type: 'RAZORPAY', reason: null },
    ]);
    expect(
      jobsFor(order.id)
        .map((j) => j.jobId)
        .sort(),
    ).toEqual([`inv-${order.id}`, `notify-order_confirmed-${order.id}`, `ship-${order.id}`].sort());
    const pay = await t.db.query('SELECT status, amount_paise, method FROM payments WHERE order_id = $1', [order.id]);
    expect(pay.rows).toEqual([{ status: 'CAPTURED', amount_paise: co.amountPaise, method: 'upi' }]);
  });

  it('tampered checkout signature → 400 INVALID_SIGNATURE, order untouched', async () => {
    const { co } = await newOrder();
    const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
    const res = await verify(app, { ...verifyBody, razorpaySignature: 'a'.repeat(64) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
    expect((await orderRow(t.db, co.orderCode)).status).toBe('PENDING_PAYMENT');
  });
});

describe('webhook', () => {
  it('tampered webhook signature → 400; nothing stored', async () => {
    const { co } = await newOrder();
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId);
    const res = await sendWebhook(app, gateway, 'payment.captured', paymentEntity(payment), {
      signature: 'f'.repeat(64),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
    expect((await t.db.query('SELECT 1 FROM webhook_events')).rowCount).toBe(0);
    expect((await orderRow(t.db, co.orderCode)).status).toBe('PENDING_PAYMENT');
  });

  it('confirms without the browser (customer closed the tab), and a duplicate event id is a no-op', async () => {
    const { co } = await newOrder();
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId);
    const first = await capturedWebhook(app, gateway, payment, 'evt_dup_1');
    const again = await capturedWebhook(app, gateway, payment, 'evt_dup_1');
    expect(first.json().data.status).toBe('processed');
    expect(again.json().data.status).toBe('duplicate');
    const order = await orderRow(t.db, co.orderCode);
    expect(order.status).toBe('CONFIRMED');
    expect((await statusLog(t.db, order.id)).filter((l) => l.to_status === 'CONFIRMED')).toHaveLength(1);
    const ev = await t.db.query('SELECT attempts, processed_at FROM webhook_events WHERE event_id = $1', ['evt_dup_1']);
    expect(ev.rows[0]!.attempts).toBe(2);
    expect(ev.rows[0]!.processed_at).not.toBeNull();
  });

  it('verify + webhook racing (and redelivered with new event ids) → one confirmation, one set of job ids', async () => {
    const { co } = await newOrder();
    const { payment, verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
    const results = await Promise.all([
      verify(app, verifyBody),
      capturedWebhook(app, gateway, payment),
      verify(app, verifyBody),
      capturedWebhook(app, gateway, payment),
      sendWebhook(app, gateway, 'order.paid', paymentEntity(payment)),
    ]);
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const verifyStatuses = [results[0]!, results[2]!].map((r) => r.json().data.status).sort();
    expect(verifyStatuses.filter((s) => s === 'CONFIRMED').length).toBeLessThanOrEqual(1);
    const order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'CONFIRMED', payment_status: 'PAID' });
    expect((await statusLog(t.db, order.id)).filter((l) => l.to_status === 'CONFIRMED')).toHaveLength(1);
    expect((await t.db.query('SELECT 1 FROM payments WHERE order_id = $1', [order.id])).rowCount).toBe(1);
    // Every enqueue used the same deterministic id → BullMQ keeps one job each
    expect(new Set(jobsFor(order.id).map((j) => j.jobId)).size).toBe(3);
  });

  it('payment.failed records the attempt; the order stays payable', async () => {
    const { co } = await newOrder();
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId, { outcome: 'failure' });
    const res = await sendWebhook(app, gateway, 'payment.failed', paymentEntity(payment));
    expect(res.json().data.status).toBe('processed');
    const order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', payment_status: 'UNPAID' });
    const pay = await t.db.query('SELECT status, error_code FROM payments WHERE order_id = $1', [order.id]);
    expect(pay.rows).toEqual([{ status: 'FAILED', error_code: 'BAD_REQUEST_ERROR' }]);
    // Retry succeeds on the same order
    const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
    expect((await verify(app, verifyBody)).json().data.status).toBe('CONFIRMED');
  });

  it('unknown order → stored with last_error, 200 (Razorpay must not retry forever)', async () => {
    const res = await sendWebhook(app, gateway, 'payment.captured', {
      payment: { entity: { id: 'pay_ghost', amount: 100, status: 'captured', order_id: 'order_ghost', method: 'upi' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('business_error');
    const ev = await t.db.query(
      "SELECT last_error, processed_at FROM webhook_events WHERE payload->'payload'->'payment'->'entity'->>'id' = 'pay_ghost'",
    );
    expect(ev.rows[0]!.last_error).toMatch(/NOT_FOUND/);
    expect(ev.rows[0]!.processed_at).toBeNull();
  });
});

describe('money safety', () => {
  it('amount mismatch → ops_issue + refund intent + INITIATE_REFUND, never CONFIRMED', async () => {
    const { co } = await newOrder();
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId, { amountPaise: co.amountPaise - 100 });
    await capturedWebhook(app, gateway, payment);
    const order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', payment_status: 'REFUND_PENDING' });
    expect(order.ops_issue).toMatch(/AMOUNT_MISMATCH/);
    const refunds = await t.db.query('SELECT id, reason, amount_paise, status FROM refunds WHERE order_id = $1', [
      order.id,
    ]);
    expect(refunds.rows).toEqual([
      { id: expect.any(String), reason: 'AMOUNT_MISMATCH', amount_paise: co.amountPaise - 100, status: 'PENDING' },
    ]);
    expect(jobs.jobs.map((j) => j.jobId)).toContain(`refund-${refunds.rows[0]!.id}`);
    expect(jobs.jobs.map((j) => j.name)).not.toContain('GENERATE_INVOICE');
  });

  it('late payment with stock → re-reserved and CONFIRMED', async () => {
    const svc = services();
    const { p, co } = await newOrder(5, 2);
    const order = await orderRow(t.db, co.orderCode);
    await expireHold(t.db, order.id);
    expect(await svc.orders.expireOrder(order.id, 'RESERVATION_EXPIRED')).toBe(true);
    expect(await batchStock(t.db, p.batchId!)).toBe(5);

    const { payment } = await payAtGateway(gateway, co.razorpayOrderId);
    await capturedWebhook(app, gateway, payment);
    expect(await orderRow(t.db, co.orderCode)).toMatchObject({ status: 'CONFIRMED', payment_status: 'PAID' });
    expect(await batchStock(t.db, p.batchId!)).toBe(3);
    const log = await statusLog(t.db, order.id);
    expect(log.at(-1)).toMatchObject({ from_status: 'EXPIRED', to_status: 'CONFIRMED', reason: 'LATE_PAYMENT' });
  });

  it('late payment after the jars sold out → CANCELLED + REFUND_PENDING + INITIATE_REFUND', async () => {
    const svc = services();
    const { p, co } = await newOrder(2, 2);
    const order = await orderRow(t.db, co.orderCode);
    await expireHold(t.db, order.id);
    await svc.orders.expireOrder(order.id, 'RESERVATION_EXPIRED');
    // Someone else buys the released jars
    expect((await placeOrder(app, [{ productId: p.id, quantity: 2 }])).statusCode).toBe(201);

    const { payment } = await payAtGateway(gateway, co.razorpayOrderId);
    await capturedWebhook(app, gateway, payment);
    const after = await orderRow(t.db, co.orderCode);
    expect(after).toMatchObject({
      status: 'CANCELLED',
      payment_status: 'REFUND_PENDING',
      cancel_reason: 'LATE_PAYMENT_STOCKOUT',
    });
    const refund = await t.db.query('SELECT id, reason FROM refunds WHERE order_id = $1', [order.id]);
    expect(refund.rows[0]!.reason).toBe('LATE_PAYMENT_STOCKOUT');
    expect(jobs.jobs.find((j) => j.name === 'INITIATE_REFUND')?.jobId).toBe(`refund-${refund.rows[0]!.id}`);
    expect(await batchStock(t.db, p.batchId!)).toBe(0); // the savepoint rolled back the partial re-reserve
  });

  it('a second captured payment on a paid order is refunded on its own; the order stays PAID', async () => {
    const { co } = await newOrder();
    const first = await payAtGateway(gateway, co.razorpayOrderId);
    await verify(app, first.verifyBody);
    const second = await payAtGateway(gateway, co.razorpayOrderId);
    await capturedWebhook(app, gateway, second.payment);
    const order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'CONFIRMED', payment_status: 'PAID' });
    expect(order.ops_issue).toMatch(/DUPLICATE_PAYMENT/);
    const r = await t.db.query('SELECT reason FROM refunds WHERE order_id = $1', [order.id]);
    expect(r.rows).toEqual([{ reason: 'DUPLICATE_PAYMENT' }]);
  });
});

describe('refund lifecycle', () => {
  it('INITIATE_REFUND calls the gateway once (retry-safe), refund.processed → REFUNDED', async () => {
    const svc = services();
    const { co } = await newOrder();
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId, { amountPaise: 1 });
    await capturedWebhook(app, gateway, payment);
    const order = await orderRow(t.db, co.orderCode);
    const { rows } = await t.db.query('SELECT id FROM refunds WHERE order_id = $1', [order.id]);
    const refundId = rows[0]!.id as string;

    await svc.payments.initiateRefund(refundId);
    await t.db.query('UPDATE refunds SET gateway_refund_id = NULL WHERE id = $1', [refundId]); // simulate crash before save
    await svc.payments.initiateRefund(refundId);
    const made = await gateway.listPaymentRefunds(payment.id);
    expect(made).toHaveLength(1);

    const hook = await sendWebhook(app, gateway, 'refund.processed', refundEntity(made[0]!, 'processed'));
    expect(hook.json().data.status).toBe('processed');
    expect((await orderRow(t.db, co.orderCode)).payment_status).toBe('REFUNDED');
    const r = await t.db.query('SELECT status, processed_at FROM refunds WHERE id = $1', [refundId]);
    expect(r.rows[0]!.status).toBe('PROCESSED');
  });

  it('refund.failed → refund FAILED, payment back to PAID, ops_issue for the admin', async () => {
    const svc = services();
    const { co } = await newOrder();
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId, { amountPaise: 2 });
    await capturedWebhook(app, gateway, payment);
    const order = await orderRow(t.db, co.orderCode);
    const { rows } = await t.db.query('SELECT id FROM refunds WHERE order_id = $1', [order.id]);
    await svc.payments.initiateRefund(rows[0]!.id);
    const [made] = await gateway.listPaymentRefunds(payment.id);
    await sendWebhook(app, gateway, 'refund.failed', refundEntity(made!, 'failed'));
    const after = await orderRow(t.db, co.orderCode);
    expect(after.payment_status).toBe('PAID');
    expect(after.ops_issue).toMatch(/REFUND_FAILED/);
  });
});

describe('state machine enforcement', () => {
  it('illegal transition → 409 ILLEGAL_TRANSITION; every status change has a log row', async () => {
    const svc = services();
    const { transitionOrder } = await import('../../src/modules/orders/orders.service');
    const { co } = await newOrder();
    const order = await orderRow(t.db, co.orderCode);
    await expect(
      t.db.transaction((c) => transitionOrder(c, order.id, 'PENDING_PAYMENT', 'DELIVERED', { actor: 'ADMIN' })),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION', statusCode: 409 });
    // Allowed move but from a stale status → STALE_STATE
    await expect(
      t.db.transaction((c) => transitionOrder(c, order.id, 'CONFIRMED', 'CANCELLED', { actor: 'ADMIN' })),
    ).rejects.toMatchObject({ code: 'STALE_STATE' });

    const { rows } = await t.db.query(
      `SELECT o.id FROM orders o
        WHERE NOT EXISTS (SELECT 1 FROM order_status_logs l WHERE l.order_id = o.id AND l.to_status = o.status)`,
    );
    expect(rows).toEqual([]);
    expect(svc).toBeDefined();
  });
});

function services() {
  return createCommerceServices({
    db: t.db,
    redis,
    logger: silentLogger(),
    reporter: fakeReporter(),
    storage: testStorage(),
    privateStorage: testPrivateStorage(),
    revalidator: spyRevalidator(),
    gateway,
    jobs,
    allowDraftInvoice: true,
  });
}
