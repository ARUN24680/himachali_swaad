import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockMessage } from '../../src/integrations/messaging/mock';
import { refundEntity, type MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import type { ShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { createProcessors } from '../../src/jobs/processors';
import { createBullJobQueue } from '../../src/jobs/queues';
import { startWorkers } from '../../src/jobs/runner';
import { createSweepers } from '../../src/jobs/sweepers';
import { as, catalogActors, cookieHeader } from '../helpers/catalog';
import {
  batchStock,
  capturedWebhook,
  expireHold,
  liveProduct,
  orderBody,
  orderRow,
  payAtGateway,
  placeOrder,
  sendWebhook,
  statusLog,
  uniquePhone,
  verify,
} from '../helpers/checkout';
import { confirmedOrder, markPacked, registerPickupName, shipmentRow, workerServices } from '../helpers/logistics';
import { otpLogin, type Jar } from '../helpers/session';
import { startShiprocketSandbox, TEST_COURIER_TOKEN, unreachableShiprocket } from '../helpers/shiprocket';
import {
  buildTestApp,
  fakeReporter,
  fromBrowser,
  recordingJobs,
  TEST_API_URL,
  testAuthConfig,
  testGateway,
  testMessaging,
  type RecordedJob,
} from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Phase 10 §10.5 launch simulations, end to end against the real API + worker service graph with
 * local stand-ins only: mock Razorpay gateway, the Shiprocket sandbox behind the REAL HTTP client,
 * mock WhatsApp/SMS (Redis outbox). Background jobs are recorded and then run through the real
 * job processors (`drain`), exactly what the worker would do; scenario 5 uses real BullMQ workers.
 * Every scenario asserts final DB state, not just HTTP codes.
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let sandbox: ShiprocketSandbox;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
let messaging: ReturnType<typeof testMessaging>;
const jobs = recordingJobs();
const auth = testAuthConfig();
const reporter = fakeReporter();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-launch-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-launch-secret',
});
const PARTNER_PHONE = '+919811177788';

beforeAll(async () => {
  t = await createTestDb({ max: 30 });
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  messaging = testMessaging(redis);
  await messaging.whatsapp.clear();
  await messaging.sms.clear();
  const sb = await startShiprocketSandbox(redis);
  sandbox = sb.sandbox;
  shiprocket = sb.client;
  closeSandbox = sb.close;
  app = await buildTestApp(
    { db: t.db, redis },
    { gateway, jobs, auth, privateStorage, shiprocket, messaging, reporter },
  );
  actors = await catalogActors(app, t.db);
  await registerPickupName(t.db, actors.kitchenA.id);
  // The kitchen partner has no push subscription → new-order / cancel alerts fall back to WhatsApp
  await t.db.query('UPDATE users SET phone = $2 WHERE id = $1', [actors.partner.id, PARTNER_PHONE]);
});
afterAll(async () => {
  await app.close();
  await closeSandbox();
  await redis.quit();
  await t.destroy();
});

const svc = (now?: () => Date) =>
  workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage, messaging, reporter, now });
const sweepers = () =>
  createSweepers({ db: t.db, svc: svc(), gateway, jobs, logger: silentLogger(), reporter: fakeReporter() });
const processors = () => createProcessors({ db: t.db, svc: svc(), sweepers: sweepers(), logger: silentLogger() });
/** A BullMQ-ish job on its final attempt (retryable send errors fall back to SMS). */
const fakeJob = () => ({ attemptsMade: 2, opts: { attempts: 3 } }) as unknown as Job;
type AnyHandler = (data: unknown, job: Job) => Promise<unknown>;

/**
 * Runs every recorded job not run yet through the real processors (what the worker does), including
 * jobs those jobs enqueue. BullMQ dedups by job id, so a job id runs once.
 */
const ran = new Set<string>();
async function drain(filter: (j: RecordedJob) => boolean = () => true) {
  const p = processors();
  const done: RecordedJob[] = [];
  for (let i = 0; i < jobs.jobs.length; i++) {
    const j = jobs.jobs[i]!;
    const key = `${j.name}|${j.jobId ?? JSON.stringify(j.data)}`;
    if (ran.has(key) || !filter(j)) continue;
    ran.add(key);
    await (p[j.name] as AnyHandler)(j.data, fakeJob());
    done.push(j);
  }
  return done;
}
const forOrder = (orderId: string) => (j: RecordedJob) => JSON.stringify(j.data).includes(orderId);

/** Phones never ending in 0000 (the mock treats those as "not on WhatsApp"). */
const customerPhone = () => `${uniquePhone().slice(0, -1)}7`;
const outbox = async (to: string) => ({
  wa: (await messaging.whatsapp.outbox()).filter((m: MockMessage) => m.to === to).reverse(),
  sms: (await messaging.sms.outbox()).filter((m: MockMessage) => m.to === to).reverse(),
});
const notificationLog = async (orderId: string) =>
  (
    await t.db.query<{ template: string; channel: string; status: string; recipient: string }>(
      'SELECT template, channel::text AS channel, status::text AS status, recipient FROM notifications_log WHERE order_id = $1 ORDER BY created_at',
      [orderId],
    )
  ).rows;
const movements = async (orderId: string) =>
  (
    await t.db.query<{ movement_type: string; quantity_delta: number }>(
      'SELECT movement_type::text AS movement_type, quantity_delta FROM inventory_movements WHERE order_id = $1 ORDER BY id',
      [orderId],
    )
  ).rows;
const allocations = async (orderId: string) =>
  (
    await t.db.query<{ status: string; quantity: number }>(
      `SELECT a.status::text AS status, a.quantity FROM order_item_allocations a
         JOIN order_items oi ON oi.id = a.order_item_id WHERE oi.order_id = $1 ORDER BY a.id`,
      [orderId],
    )
  ).rows;
const statuses = async (orderId: string) => (await statusLog(t.db, orderId)).map((l) => l.to_status);
const refunds = async (orderId: string) =>
  (
    await t.db.query<{ id: string; reason: string; status: string; amount_paise: number }>(
      'SELECT id, reason::text AS reason, status::text AS status, amount_paise FROM refunds WHERE order_id = $1 ORDER BY created_at',
      [orderId],
    )
  ).rows;
const ledgerMismatches = async () =>
  (
    await t.db.query(
      `SELECT b.id FROM inventory_batches b LEFT JOIN inventory_movements m ON m.batch_id = b.id
        GROUP BY b.id HAVING b.available_stock <> COALESCE(SUM(m.quantity_delta), 0)`,
    )
  ).rowCount;

const courierHook = (body: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/courier-tracking',
    headers: { 'content-type': 'application/json', 'x-api-key': TEST_COURIER_TOKEN },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });

const FULL_CHECKLIST = {
  correctBatch: true,
  weighed: true,
  sealChecked: true,
  shrinkApplied: true,
  bubbleWrapped: true,
  labelApplied: true,
};
const deskMarkPacked = (jar: Jar, orderCode: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/partner/orders/${orderCode}/mark-packed`,
    headers: fromBrowser({ cookie: cookieHeader(jar), 'idempotency-key': randomUUID() }),
    payload: { checklist: FULL_CHECKLIST },
  });

/** Pickup batch with the clock 3 days ahead: the parcel's pickup day is always past by then. */
const runPickupBatch = () => svc(() => new Date(Date.now() + 3 * 86_400_000)).logistics.pickupBatch();

/** Settles the refund the way Razorpay does: INITIATE_REFUND already ran → refund.processed webhook. */
async function refundProcessedWebhook(paymentGatewayId: string) {
  const made = await gateway.listPaymentRefunds(paymentGatewayId);
  expect(made).toHaveLength(1);
  const res = await sendWebhook(app, gateway, 'refund.processed', refundEntity(made[0]!, 'processed'));
  expect(res.json().data.status).toBe('processed');
}

describe('launch simulation: happy path (order → pay → ship → deliver)', () => {
  it('UPI payment → CONFIRMED → AWB + label → partner alert → packed → pickup → courier scans → DELIVERED, a WhatsApp per stage', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 10 });
    const phone = customerPhone();
    const items = [{ productId: p.id, quantity: 2 }];
    const body = orderBody(items, phone);
    body.consent.whatsappOptIn = true;

    // Storefront checkout → hold
    const placed = await placeOrder(app, items, { body });
    expect(placed.statusCode).toBe(201);
    const co = placed.json().data;
    expect(await batchStock(t.db, p.batchId!)).toBe(8);

    // UPI test payment in the (mock) Razorpay modal → Checkout success handler → verify
    const { verifyBody, payment } = await payAtGateway(gateway, co.razorpayOrderId);
    const verified = await verify(app, verifyBody);
    expect(verified.json().data).toEqual({ orderCode: co.orderCode, status: 'CONFIRMED' });
    const { id: orderId } = await orderRow(t.db, co.orderCode);
    expect(jobs.jobs.filter(forOrder(orderId)).map((j) => j.jobId)).toEqual(
      expect.arrayContaining([
        `ship-${orderId}`,
        `inv-${orderId}`,
        `notify-order_confirmed-${orderId}`,
        `notify-new_order_alert-${orderId}`,
      ]),
    );

    // Worker: booking (Shiprocket sandbox) → AWB → label → AWAITING_PACKING, invoice, messages
    await drain(forOrder(orderId));
    const shipment = (await shipmentRow(t.db, orderId))!;
    expect(shipment.awb_code).toBe(sandbox.byChannelOrderId(co.orderCode)!.awb);
    expect(shipment.label_key).toBe(`labels/${co.orderCode}.pdf`);
    let order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'AWAITING_PACKING', payment_status: 'PAID' });
    expect(order.invoice_number).toMatch(/^PK\/\d{4}-\d{2}\/\d{6}$/);
    // Partner notified (no push subscription → WhatsApp fallback to the kitchen partner)
    expect((await outbox(PARTNER_PHONE)).wa.map((m) => m.template)).toContain('new_order_alert');
    expect(
      (await notificationLog(orderId)).filter((r) => r.template === 'new_order_alert' && r.status === 'SENT'),
    ).toHaveLength(1);

    // Partner desk: label + Mark Packed → pickup batch → PICKUP_SCHEDULED
    expect((await as(app, actors.partnerJar).get(`/api/v1/partner/orders/${co.orderCode}/label`)).statusCode).toBe(200);
    const packed = await deskMarkPacked(actors.partnerJar, co.orderCode);
    expect(packed.statusCode).toBe(200);
    expect(packed.json().data).toMatchObject({ status: 'PACKED', changed: true });
    await drain(forOrder(orderId)); // SHIPROCKET_SCHEDULE_PICKUP
    await runPickupBatch();
    expect((await orderRow(t.db, co.orderCode)).status).toBe('PICKUP_SCHEDULED');
    expect((await shipmentRow(t.db, orderId))!.pickup_token).toMatch(/^PT/);

    // Courier scans (Shiprocket webhooks) → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
    const awb = shipment.awb_code as string;
    for (const [scan, expected] of [
      ['PICKED UP', 'IN_TRANSIT'],
      ['OUT FOR DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
    ] as const) {
      const res = await courierHook(sandbox.scan(awb, scan, 'Kullu Hub'));
      expect(res.json().data).toEqual({ status: 'processed' });
      expect((await orderRow(t.db, co.orderCode)).status).toBe(expected);
      await drain(forOrder(orderId));
    }

    order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'DELIVERED', payment_status: 'PAID', ops_issue: null });
    expect(order.shipped_at).not.toBeNull();
    expect(order.delivered_at).not.toBeNull();
    expect(await statusLog(t.db, orderId)).toEqual([
      { from_status: null, to_status: 'PENDING_PAYMENT', actor_type: 'CUSTOMER', reason: null },
      { from_status: 'PENDING_PAYMENT', to_status: 'CONFIRMED', actor_type: 'RAZORPAY', reason: null },
      expect.objectContaining({ from_status: 'CONFIRMED', to_status: 'AWAITING_PACKING', actor_type: 'SYSTEM' }),
      expect.objectContaining({ from_status: 'AWAITING_PACKING', to_status: 'PACKED', actor_type: 'KITCHEN_PARTNER' }),
      expect.objectContaining({ from_status: 'PACKED', to_status: 'PICKUP_SCHEDULED' }),
      expect.objectContaining({ from_status: 'PICKUP_SCHEDULED', to_status: 'IN_TRANSIT', actor_type: 'SHIPROCKET' }),
      expect.objectContaining({ from_status: 'IN_TRANSIT', to_status: 'OUT_FOR_DELIVERY', actor_type: 'SHIPROCKET' }),
      expect.objectContaining({ from_status: 'OUT_FOR_DELIVERY', to_status: 'DELIVERED', actor_type: 'SHIPROCKET' }),
    ]);

    // Stock: reserved once, committed, never released
    expect(await batchStock(t.db, p.batchId!)).toBe(8);
    expect(await movements(orderId)).toEqual([{ movement_type: 'RESERVE', quantity_delta: -2 }]);
    expect(await allocations(orderId)).toEqual([{ status: 'COMMITTED', quantity: 2 }]);
    const pay = await t.db.query(
      'SELECT status::text AS status, gateway_payment_id FROM payments WHERE order_id = $1',
      [orderId],
    );
    expect(pay.rows).toEqual([{ status: 'CAPTURED', gateway_payment_id: payment.id }]);

    // Every customer message (WhatsApp opt-in) once, in order; nothing by SMS
    const { wa, sms } = await outbox(phone);
    expect(wa.map((m) => m.template)).toEqual([
      'order_confirmed',
      'order_shipped',
      'out_for_delivery',
      'delivered_storage_tip',
    ]);
    expect(wa[1]!.text).toContain(`(AWB ${awb})`);
    expect(sms).toHaveLength(0);
    const customerLog = (await notificationLog(orderId)).filter((r) => r.recipient === phone);
    expect(customerLog.map((r) => `${r.template}:${r.channel}:${r.status}`)).toEqual([
      'order_confirmed:WHATSAPP:SENT',
      'order_shipped:WHATSAPP:SENT',
      'out_for_delivery:WHATSAPP:SENT',
      'delivered_storage_tip:WHATSAPP:SENT',
    ]);

    // Customer-facing status (/track) agrees
    const track = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${co.orderCode}/status?phone=${encodeURIComponent(phone)}`,
    });
    expect(track.json().data).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID', canCancel: false });
  });
});

describe('launch simulation: payment drop (D-22)', () => {
  it('customer closes the bank screen → hold expires → sweeper: EXPIRED, stock + RELEASE movement back, no messages', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 3 });
    const phone = customerPhone();
    const co = (await placeOrder(app, [{ productId: p.id, quantity: 2 }], { phone })).json().data;
    const { id: orderId } = await orderRow(t.db, co.orderCode);
    expect(await batchStock(t.db, p.batchId!)).toBe(1);

    // Still inside the 15-min hold: nothing happens
    await sweepers().expireReservations();
    expect((await orderRow(t.db, co.orderCode)).status).toBe('PENDING_PAYMENT');

    await expireHold(t.db, orderId); // fake clock: 15 min later
    expect((await sweepers().expireReservations()).expired).toBeGreaterThanOrEqual(1);

    const order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'EXPIRED', payment_status: 'UNPAID' });
    expect(await batchStock(t.db, p.batchId!)).toBe(3);
    expect(await movements(orderId)).toEqual([
      { movement_type: 'RESERVE', quantity_delta: -2 },
      { movement_type: 'RELEASE', quantity_delta: 2 },
    ]);
    expect(await allocations(orderId)).toEqual([{ status: 'RELEASED', quantity: 2 }]);
    expect(await statusLog(t.db, orderId)).toEqual([
      { from_status: null, to_status: 'PENDING_PAYMENT', actor_type: 'CUSTOMER', reason: null },
      { from_status: 'PENDING_PAYMENT', to_status: 'EXPIRED', actor_type: 'SYSTEM', reason: 'RESERVATION_EXPIRED' },
    ]);
    expect(jobs.jobs.filter(forOrder(orderId))).toEqual([]);
    expect(await notificationLog(orderId)).toEqual([]);
    expect(await ledgerMismatches()).toBe(0);
  });
});

describe('launch simulation: late payment after stockout', () => {
  it('hold expires, jars sold to someone else, late payment.captured → CANCELLED + LATE_PAYMENT_STOCKOUT refund processed', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 2 });
    const phone = customerPhone();
    const items = [{ productId: p.id, quantity: 2 }];
    const body = orderBody(items, phone);
    body.consent.whatsappOptIn = true;
    const co = (await placeOrder(app, items, { body })).json().data;
    const { id: orderId } = await orderRow(t.db, co.orderCode);

    await expireHold(t.db, orderId);
    await sweepers().expireReservations();
    expect((await orderRow(t.db, co.orderCode)).status).toBe('EXPIRED');
    expect(await batchStock(t.db, p.batchId!)).toBe(2);

    // Another customer buys the released jars
    const other = await placeOrder(app, items);
    expect(other.statusCode).toBe(201);
    expect(await batchStock(t.db, p.batchId!)).toBe(0);

    // The first customer's bank finally captures → Razorpay webhook
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId);
    const hook = await capturedWebhook(app, gateway, payment);
    expect(hook.json().data.status).toBe('processed');

    let order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({
      status: 'CANCELLED',
      payment_status: 'REFUND_PENDING',
      cancel_reason: 'LATE_PAYMENT_STOCKOUT',
    });
    expect(await statusLog(t.db, orderId)).toEqual([
      { from_status: null, to_status: 'PENDING_PAYMENT', actor_type: 'CUSTOMER', reason: null },
      { from_status: 'PENDING_PAYMENT', to_status: 'EXPIRED', actor_type: 'SYSTEM', reason: 'RESERVATION_EXPIRED' },
      { from_status: 'EXPIRED', to_status: 'CANCELLED', actor_type: 'RAZORPAY', reason: 'LATE_PAYMENT_STOCKOUT' },
    ]);
    // The other customer's hold is untouched, no oversell
    expect(await batchStock(t.db, p.batchId!)).toBe(0);
    expect((await orderRow(t.db, other.json().data.orderCode)).status).toBe('PENDING_PAYMENT');
    expect(await movements(orderId)).toEqual([
      { movement_type: 'RESERVE', quantity_delta: -2 },
      { movement_type: 'RELEASE', quantity_delta: 2 },
    ]);
    // No booking for a cancelled order
    expect(jobs.jobs.filter(forOrder(orderId)).map((j) => j.name)).not.toContain('SHIPROCKET_CREATE_ORDER');

    // Auto refund: intent row → INITIATE_REFUND → Razorpay refund → refund.processed
    const [refund] = await refunds(orderId);
    expect(refund).toMatchObject({ reason: 'LATE_PAYMENT_STOCKOUT', status: 'PENDING', amount_paise: co.amountPaise });
    expect(jobs.jobs.map((j) => j.jobId)).toContain(`refund-${refund!.id}`);
    // Customer is told about the cancellation right away (07 §6), not only when the refund lands
    expect(jobs.jobs.map((j) => j.jobId)).toContain(`notify-order_cancelled-${orderId}`);
    await drain(forOrder(orderId));
    await drain((j) => j.jobId === `refund-${refund!.id}`);
    await refundProcessedWebhook(payment.id);
    await drain((j) => JSON.stringify(j.data).includes(refund!.id));

    order = await orderRow(t.db, co.orderCode);
    expect(order).toMatchObject({ status: 'CANCELLED', payment_status: 'REFUNDED' });
    expect(await refunds(orderId)).toEqual([expect.objectContaining({ status: 'PROCESSED' })]);
    expect((await outbox(phone)).wa.map((m) => m.template)).toEqual(
      expect.arrayContaining(['order_cancelled', 'refund_processed']),
    );
    expect(await ledgerMismatches()).toBe(0);
  });
});

describe('launch simulation: duplicate webhooks', () => {
  it('same Razorpay captured event 3× and same Shiprocket scan 3× → one transition each, one message each', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
    const phone = customerPhone();
    const items = [{ productId: p.id, quantity: 1 }];
    const body = orderBody(items, phone);
    body.consent.whatsappOptIn = true;
    const co = (await placeOrder(app, items, { body })).json().data;
    const { id: orderId } = await orderRow(t.db, co.orderCode);

    // Customer closed the tab after paying: only webhooks, replayed 3× with the same event id
    const { payment } = await payAtGateway(gateway, co.razorpayOrderId);
    const eventId = `evt_launch_${randomBytes(6).toString('hex')}`;
    const replies = [];
    for (let i = 0; i < 3; i++)
      replies.push((await capturedWebhook(app, gateway, payment, eventId)).json().data.status);
    expect(replies).toEqual(['processed', 'duplicate', 'duplicate']);
    const ev = await t.db.query("SELECT attempts FROM webhook_events WHERE provider = 'RAZORPAY' AND event_id = $1", [
      eventId,
    ]);
    expect(ev.rows).toEqual([{ attempts: 3 }]);
    expect((await statuses(orderId)).filter((s) => s === 'CONFIRMED')).toHaveLength(1);
    expect((await t.db.query('SELECT 1 FROM payments WHERE order_id = $1', [orderId])).rowCount).toBe(1);
    expect(await batchStock(t.db, p.batchId!)).toBe(4);
    const confirmJobs = jobs.jobs.filter((j) => j.name === 'ORDER_CONFIRMED' && forOrder(orderId)(j));
    expect(new Set(confirmJobs.map((j) => j.jobId))).toEqual(new Set([`notify-order_confirmed-${orderId}`]));

    await drain(forOrder(orderId));
    // Even if the worker ran the message job again it is deduped by notifications_log
    expect(await processors().ORDER_CONFIRMED({ orderId }, fakeJob())).toEqual({ kind: 'duplicate' });
    await markPacked(t.db, orderId);
    await runPickupBatch();
    expect((await orderRow(t.db, co.orderCode)).status).toBe('PICKUP_SCHEDULED');

    // The same courier scan delivered 3×
    const awb = (await shipmentRow(t.db, orderId))!.awb_code as string;
    const scan = JSON.stringify(sandbox.scan(awb, 'PICKED UP', 'Kullu Hub'));
    const trackReplies = [];
    for (let i = 0; i < 3; i++) trackReplies.push((await courierHook(scan)).json().data.status);
    expect(trackReplies).toEqual(['processed', 'duplicate', 'duplicate']);
    expect((await statuses(orderId)).filter((s) => s === 'IN_TRANSIT')).toHaveLength(1);
    const tracking = await t.db.query(
      'SELECT count(*)::int AS n FROM tracking_events e JOIN shipments s ON s.id = e.shipment_id WHERE s.order_id = $1',
      [orderId],
    );
    expect(tracking.rows[0]!.n).toBe(1);
    const shippedJobs = jobs.jobs.filter((j) => j.name === 'ORDER_STATUS_NOTIFY' && forOrder(orderId)(j));
    expect(new Set(shippedJobs.map((j) => j.jobId))).toEqual(new Set([`notify-order_shipped-${orderId}`]));
    await drain(forOrder(orderId));
    for (let i = 0; i < 2; i++) {
      expect(await processors().ORDER_STATUS_NOTIFY({ orderId, template: 'order_shipped' }, fakeJob())).toEqual({
        kind: 'duplicate',
      });
    }

    expect(await statuses(orderId)).toEqual([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'AWAITING_PACKING',
      'PACKED',
      'PICKUP_SCHEDULED',
      'IN_TRANSIT',
    ]);
    expect((await outbox(phone)).wa.map((m) => m.template)).toEqual(['order_confirmed', 'order_shipped']);
    const sentLog = (await notificationLog(orderId)).filter((r) => r.recipient === phone && r.status === 'SENT');
    expect(sentLog.map((r) => r.template)).toEqual(['order_confirmed', 'order_shipped']);
  });
});

describe('launch simulation: Shiprocket outage', () => {
  it('unreachable / 503 → retried → recovers; 5 × 503 → ops_issue + alert → admin retry-shipment books it', async () => {
    const connection = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
    const bull = createBullJobQueue(connection, { backoffMs: 20 });
    const services = svc();
    const workers = startWorkers({
      connection,
      processors: createProcessors({ db: t.db, svc: services, sweepers: sweepers(), logger: silentLogger() }),
      svc: services,
      logger: silentLogger(),
      reporter,
      concurrency: 2,
    });
    const until = async (cond: () => Promise<boolean>, ms = 20_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await cond()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('timed out');
    };
    try {
      // (a) Shiprocket unreachable on attempt 1 (network), then 503 twice → booked on the 4th attempt
      const a = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
      const offline = workerServices({
        db: t.db,
        redis,
        gateway,
        jobs,
        shiprocket: unreachableShiprocket(),
        privateStorage,
        messaging,
        reporter,
      });
      await expect(offline.logistics.bookShipment(a.orderId)).rejects.toMatchObject({ retryable: true });
      expect((await orderRow(t.db, a.orderCode)).status).toBe('CONFIRMED');
      const createsBefore = sandbox.calls.get('orders/create') ?? 0;
      sandbox.failNext('orders/create', 503, 2);
      await bull.add('SHIPROCKET_CREATE_ORDER', { orderId: a.orderId }, `ship-${a.orderId}`);
      await until(async () => Boolean((await shipmentRow(t.db, a.orderId))?.awb_code));
      expect(sandbox.calls.get('orders/create')).toBe(createsBefore + 3);
      expect((await shipmentRow(t.db, a.orderId))!.booking_attempts).toBe(4);
      await drain((j) => j.jobId === `label-${a.orderId}`);
      const oa = await orderRow(t.db, a.orderCode);
      expect(oa).toMatchObject({ status: 'AWAITING_PACKING', ops_issue: null });
      expect([...sandbox.shipments.values()].filter((s) => s.channelOrderId === a.orderCode)).toHaveLength(1);

      // (b) Shiprocket down for all 5 attempts → dead letter: ops_issue + last_error + admin alert
      const b = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
      sandbox.failNext('orders/create', 503, 5);
      await bull.add('SHIPROCKET_CREATE_ORDER', { orderId: b.orderId }, `ship-${b.orderId}`);
      await until(async () => Boolean((await orderRow(t.db, b.orderCode)).ops_issue));
      const ob = await orderRow(t.db, b.orderCode);
      expect(ob.status).toBe('CONFIRMED');
      expect(ob.ops_issue).toMatch(/^SHIPROCKET_CREATE_ORDER: shiprocket orders\/create 503/);
      const sb = (await shipmentRow(t.db, b.orderId))!;
      expect(sb).toMatchObject({ booking_attempts: 5, awb_code: null });
      expect(sb.last_error).toMatch(/503/);
      expect(jobs.jobs).toContainEqual(
        expect.objectContaining({ name: 'ADMIN_ALERT', jobId: `alert-BOOKING_FAILED-${b.orderId}` }),
      );
      expect(reporter.capture).toHaveBeenCalled();
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      await bull.close();
      await connection.quit();
    }

    // Admin console: Shiprocket is back → "Retry shipment" (partner may not)
    const b = (
      await t.db.query<{ id: string; order_code: string }>(
        "SELECT id, order_code FROM orders WHERE ops_issue LIKE 'SHIPROCKET_CREATE_ORDER:%' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0]!;
    const url = `/api/v1/admin/orders/${b.order_code}/retry-shipment`;
    expect((await as(app, actors.partnerJar).post(url, {})).statusCode).toBe(403);
    const retry = await as(app, actors.adminJar).post(url, {});
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual({ ok: true, message: 'Booking retry queued.' });
    const retryJob = jobs.jobs.find(
      (j) => j.name === 'SHIPROCKET_CREATE_ORDER' && j.jobId?.startsWith(`ship-${b.id}-retry-`),
    );
    expect(retryJob).toBeDefined();
    await drain((j) => j === retryJob || j.jobId === `label-${b.id}`);

    const order = await orderRow(t.db, b.order_code);
    expect(order.status).toBe('AWAITING_PACKING');
    const s = (await shipmentRow(t.db, b.id))!;
    expect(s.awb_code).toBe(sandbox.byChannelOrderId(b.order_code)!.awb);
    expect(s.label_key).toBe(`labels/${b.order_code}.pdf`);
    expect([...sandbox.shipments.values()].filter((x) => x.channelOrderId === b.order_code)).toHaveLength(1);
    const audit = await t.db.query(
      "SELECT actor_id FROM admin_audit_log WHERE action = 'SHIPMENT_RETRY' AND entity_id = $1",
      [b.id],
    );
    expect(audit.rows).toEqual([{ actor_id: actors.admin.id }]);

    // Once booked, a second retry is refused; the admin then closes the issue
    expect((await as(app, actors.adminJar).post(url, {})).statusCode).toBe(409);
    const resolved = await as(app, actors.adminJar).post(`/api/v1/admin/orders/${b.order_code}/resolve-issue`, {
      note: 'Shiprocket back, booking retried',
    });
    expect(resolved.statusCode).toBe(200);
    expect((await orderRow(t.db, b.order_code)).ops_issue).toBeNull();
    expect(await statuses(b.id)).toEqual(['PENDING_PAYMENT', 'CONFIRMED', 'AWAITING_PACKING']);
  }, 60_000);
});

describe('launch simulation: NDR → RTO (D-31)', () => {
  it('UNDELIVERED → DELIVERY_FAILED (customer + admin alert) → RTO_IN_TRANSIT → RTO_DELIVERED, no restock', async () => {
    const phone = customerPhone();
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { phone, whatsappOptIn: true });
    await drain(forOrder(o.orderId)); // book + label + confirmation messages
    await markPacked(t.db, o.orderId);
    await runPickupBatch();
    const awb = (await shipmentRow(t.db, o.orderId))!.awb_code as string;
    await courierHook(sandbox.scan(awb, 'PICKED UP'));
    await courierHook(sandbox.scan(awb, 'OUT FOR DELIVERY'));
    await drain(forOrder(o.orderId));
    const stockBefore = await batchStock(t.db, o.batchId);

    // NDR: customer not available
    expect((await courierHook(sandbox.scan(awb, 'UNDELIVERED'))).json().data).toEqual({ status: 'processed' });
    expect((await orderRow(t.db, o.orderCode)).status).toBe('DELIVERY_FAILED');
    expect(jobs.jobs.map((j) => j.jobId)).toEqual(
      expect.arrayContaining([`notify-delivery_attempt_failed-${o.orderId}`, `alert-DELIVERY_FAILED-${o.orderId}`]),
    );
    const alertJob = jobs.jobs.find((j) => j.jobId === `alert-DELIVERY_FAILED-${o.orderId}`)!;
    expect(alertJob).toMatchObject({ name: 'ADMIN_ALERT', data: { kind: 'DELIVERY_FAILED', orderId: o.orderId } });
    await drain(forOrder(o.orderId));
    expect((await outbox(phone)).wa.map((m) => m.template)).toContain('delivery_attempt_failed');

    // Courier gives up → return to origin
    await courierHook(sandbox.scan(awb, 'RTO INITIATED'));
    expect((await orderRow(t.db, o.orderCode)).status).toBe('RTO_IN_TRANSIT');
    await courierHook(sandbox.scan(awb, 'RTO DELIVERED'));
    await drain(forOrder(o.orderId));

    const order = await orderRow(t.db, o.orderCode);
    expect(order).toMatchObject({ status: 'RTO_DELIVERED', payment_status: 'PAID' });
    expect(order.ops_issue).toMatch(/RTO_DELIVERED: decide refund \(Q-04\)/);
    expect((await statuses(o.orderId)).slice(-5)).toEqual([
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERY_FAILED',
      'RTO_IN_TRANSIT',
      'RTO_DELIVERED',
    ]);
    expect((await statusLog(t.db, o.orderId)).at(-1)!.reason).toMatch(/no restock \(D-31\)/);
    // D-31: the jar is discarded — stock unchanged, no RELEASE / WASTAGE movement, still COMMITTED
    expect(await batchStock(t.db, o.batchId)).toBe(stockBefore);
    expect(await movements(o.orderId)).toEqual([{ movement_type: 'RESERVE', quantity_delta: -1 }]);
    expect(await allocations(o.orderId)).toEqual([{ status: 'COMMITTED', quantity: 1 }]);
    expect(await refunds(o.orderId)).toEqual([]); // refund is a manual admin decision (Q-04)
    expect(jobs.jobs.map((j) => j.name)).toContain('ADMIN_ALERT');
    expect(await ledgerMismatches()).toBe(0);
  });
});

describe('launch simulation: customer cancel + refund at AWAITING_PACKING', () => {
  it('cancel → AWB cancelled at Shiprocket, stock released, refund processed, customer + partner notified', async () => {
    const phone = customerPhone();
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { phone, whatsappOptIn: true });
    await drain(forOrder(o.orderId));
    expect((await orderRow(t.db, o.orderCode)).status).toBe('AWAITING_PACKING');
    const awb = (await shipmentRow(t.db, o.orderId))!.awb_code as string;
    const stockBefore = await batchStock(t.db, o.batchId);
    const partnerBefore = (await outbox(PARTNER_PHONE)).wa.length;

    // Customer logs in with OTP (same phone as the guest checkout) and cancels from My Orders
    const { jar } = await otpLogin(app, phone, (ph) => auth.otpProvider.lastCodeFor(ph));
    expect((await as(app, jar).get(`/api/v1/orders/${o.orderCode}/status`)).json().data.canCancel).toBe(true);
    const res = await as(app, jar).post(`/api/v1/orders/${o.orderCode}/cancel`, { reason: 'Ordered by mistake' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ orderCode: o.orderCode, status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' });

    // Stock back on the shelf at once (jar never left the kitchen)
    expect(await batchStock(t.db, o.batchId)).toBe(stockBefore + 1);
    expect(await movements(o.orderId)).toEqual([
      { movement_type: 'RESERVE', quantity_delta: -1 },
      { movement_type: 'RELEASE', quantity_delta: 1 },
    ]);
    expect(await allocations(o.orderId)).toEqual([{ status: 'RELEASED', quantity: 1 }]);
    expect(jobs.jobs.filter(forOrder(o.orderId)).map((j) => j.jobId)).toEqual(
      expect.arrayContaining([`shipcancel-${o.orderId}`, `notify-order_cancelled-${o.orderId}`]),
    );
    const [refund] = await refunds(o.orderId);
    expect(refund).toMatchObject({ reason: 'CUSTOMER_CANCEL', status: 'PENDING' });

    // Worker: AWB cancel at Shiprocket, refund at Razorpay, messages
    await drain((j) => forOrder(o.orderId)(j) || JSON.stringify(j.data).includes(refund!.id));
    expect(sandbox.byAwb(awb)!.cancelled).toBe(true);
    expect((await shipmentRow(t.db, o.orderId))!.cancelled_at).not.toBeNull();
    const payId = (
      await t.db.query<{ gateway_payment_id: string }>('SELECT gateway_payment_id FROM payments WHERE order_id = $1', [
        o.orderId,
      ])
    ).rows[0]!.gateway_payment_id;
    await refundProcessedWebhook(payId);
    await drain((j) => JSON.stringify(j.data).includes(refund!.id));

    const order = await orderRow(t.db, o.orderCode);
    expect(order).toMatchObject({ status: 'CANCELLED', payment_status: 'REFUNDED' });
    expect(order.cancelled_at).not.toBeNull();
    expect(await refunds(o.orderId)).toEqual([expect.objectContaining({ status: 'PROCESSED' })]);
    expect((await statusLog(t.db, o.orderId)).at(-1)).toMatchObject({
      from_status: 'AWAITING_PACKING',
      to_status: 'CANCELLED',
      actor_type: 'CUSTOMER',
    });
    expect((await outbox(phone)).wa.map((m) => m.template)).toEqual([
      'order_confirmed',
      'order_cancelled',
      'refund_processed',
    ]);
    // Partner: "pack mat karein" (WhatsApp fallback — no push subscription)
    const partnerWa = (await outbox(PARTNER_PHONE)).wa.slice(partnerBefore);
    expect(partnerWa.map((m) => m.template)).toContain('order_cancelled_partner');
    expect(partnerWa.find((m) => m.template === 'order_cancelled_partner')!.text).toBe(
      `Order ${o.orderCode} cancel ho gaya — pack mat karein, courier ko mat dein.`,
    );
    // The desk refuses to pack it now
    const pack = await deskMarkPacked(actors.partnerJar, o.orderCode);
    expect(pack.statusCode).toBe(409);
    expect(await ledgerMismatches()).toBe(0);
  });
});

describe('launch simulation: concurrency (last jar)', () => {
  it('10 concurrent checkouts for 1 remaining jar → exactly 1 reservation, 9 × OUT_OF_STOCK, stock never negative', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 1 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => placeOrder(app, [{ productId: p.id, quantity: 1 }], { phone: customerPhone() })),
    );
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(9);
    for (const r of results.filter((x) => x.statusCode === 409)) {
      expect(r.json().error).toMatchObject({ code: 'OUT_OF_STOCK', details: { productId: p.id, available: 0 } });
    }
    expect(await batchStock(t.db, p.batchId!)).toBe(0);

    const held = await t.db.query<{ id: string; status: string }>(
      `SELECT DISTINCT o.id, o.status::text AS status FROM orders o JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.product_id = $1`,
      [p.id],
    );
    expect(held.rows).toEqual([{ id: expect.any(String), status: 'PENDING_PAYMENT' }]);
    const mv = await t.db.query<{ movement_type: string; total: number }>(
      `SELECT movement_type::text AS movement_type, SUM(quantity_delta)::int AS total FROM inventory_movements
        WHERE batch_id = $1 GROUP BY movement_type ORDER BY movement_type`,
      [p.batchId],
    );
    expect(mv.rows).toEqual([
      { movement_type: 'PRODUCTION', total: 1 },
      { movement_type: 'RESERVE', total: -1 },
    ]);

    // The winner pays → CONFIRMED, still exactly 0 left; one more buyer is refused
    const winner = results.find((r) => r.statusCode === 201)!.json().data;
    const { verifyBody } = await payAtGateway(gateway, winner.razorpayOrderId);
    expect((await verify(app, verifyBody)).json().data.status).toBe('CONFIRMED');
    expect((await placeOrder(app, [{ productId: p.id, quantity: 1 }])).statusCode).toBe(409);
    expect(await batchStock(t.db, p.batchId!)).toBe(0);
    const negative = await t.db.query('SELECT 1 FROM inventory_batches WHERE available_stock < 0');
    expect(negative.rowCount).toBe(0);
    expect(await ledgerMismatches()).toBe(0);
  });
});
