import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import { createShiprocketSandbox, type ShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { catalogActors } from '../helpers/catalog';
import { orderRow, statusLog } from '../helpers/checkout';
import { confirmedOrder, markPacked, registerPickupName, shipmentRow, workerServices } from '../helpers/logistics';
import { startShiprocketSandbox, TEST_COURIER_TOKEN } from '../helpers/shiprocket';
import { buildTestApp, recordingJobs, testGateway, TEST_API_URL } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Phase 6 §6.9–6.11: courier-tracking webhook (D-35), poll fallback, out-of-order rule, NDR/RTO. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let sandbox: ShiprocketSandbox;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const jobs = recordingJobs();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-track-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-track-secret',
});

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  const sb = await startShiprocketSandbox(redis);
  sandbox = sb.sandbox;
  shiprocket = sb.client;
  closeSandbox = sb.close;
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, privateStorage, shiprocket });
  actors = await catalogActors(app, t.db);
  await registerPickupName(t.db, actors.kitchenA.id);
});
afterAll(async () => {
  await app.close();
  await closeSandbox();
  await redis.quit();
  await t.destroy();
});

const svc = (now?: () => Date) => workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage, now });

/** Drives a fresh order all the way to PICKUP_SCHEDULED; returns its AWB. */
async function shippedOrder() {
  const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
  await svc().logistics.bookShipment(o.orderId);
  await svc().logistics.fetchAndStoreLabel(o.orderId);
  await markPacked(t.db, o.orderId);
  // Batch clock 3 days ahead: the parcel's pickup day is always past by then
  await svc(() => new Date(Date.now() + 3 * 86_400_000)).logistics.pickupBatch();
  expect((await orderRow(t.db, o.orderCode)).status).toBe('PICKUP_SCHEDULED');
  return { ...o, awb: (await shipmentRow(t.db, o.orderId))!.awb_code as string };
}

const hook = (body: unknown, key: string | null = TEST_COURIER_TOKEN) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/courier-tracking',
    headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'x-api-key': key }) },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });

const trackingRows = async (orderId: string) => {
  const s = (await shipmentRow(t.db, orderId))!;
  const { rows } = await t.db.query(
    'SELECT status_text, source FROM tracking_events WHERE shipment_id = $1 ORDER BY id',
    [s.id],
  );
  return rows as { status_text: string; source: string }[];
};

describe('POST /webhooks/courier-tracking (§6.9)', () => {
  it('wrong or missing x-api-key → 401; the panel test ping (empty / non-JSON) → 200', async () => {
    expect((await hook({ awb: '1', current_status: 'DELIVERED' }, 'wrong-token')).statusCode).toBe(401);
    expect((await hook({ awb: '1', current_status: 'DELIVERED' }, null)).statusCode).toBe(401);
    const ping = await hook('');
    expect(ping.statusCode).toBe(200);
    expect(ping.json().data).toEqual({ status: 'ignored' });
    expect((await hook({})).json().data).toEqual({ status: 'ignored' });
  });

  it('first scan → IN_TRANSIT (shipped_at, order_shipped queued); the same payload twice → one tracking row', async () => {
    const o = await shippedOrder();
    jobs.clear();
    const body = sandbox.scan(o.awb, 'PICKED UP', 'Kullu Hub');
    const first = await hook(body);
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toEqual({ status: 'processed' });
    const order = await orderRow(t.db, o.orderCode);
    expect(order.status).toBe('IN_TRANSIT');
    expect(order.shipped_at).not.toBeNull();
    expect(jobs.jobs).toContainEqual({
      name: 'ORDER_STATUS_NOTIFY',
      data: { orderId: o.orderId, template: 'order_shipped' },
      jobId: `notify-order_shipped-${o.orderId}`,
    });
    expect((await statusLog(t.db, o.orderId)).at(-1)).toMatchObject({
      to_status: 'IN_TRANSIT',
      actor_type: 'SHIPROCKET',
    });

    const again = await hook(body);
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toEqual({ status: 'duplicate' });
    expect(await trackingRows(o.orderId)).toEqual([{ status_text: 'PICKED UP', source: 'WEBHOOK' }]);
    const eventId = createHash('sha256')
      .update(`${o.awb}|${body.current_status as string}|${body.current_timestamp as string}`)
      .digest('hex');
    const ev = await t.db.query(
      "SELECT attempts, processed_at FROM webhook_events WHERE provider = 'SHIPROCKET' AND event_id = $1",
      [eventId],
    );
    expect(ev.rows[0]!).toMatchObject({ attempts: 2 });
    expect(ev.rows[0]!.processed_at).not.toBeNull();
  });

  it('DELIVERED then a late IN_TRANSIT → order stays DELIVERED, the late event is still stored', async () => {
    const o = await shippedOrder();
    await hook(sandbox.scan(o.awb, 'PICKED UP'));
    await hook(sandbox.scan(o.awb, 'OUT FOR DELIVERY'));
    const delivered = sandbox.scan(o.awb, 'DELIVERED');
    await hook(delivered);
    expect((await orderRow(t.db, o.orderCode)).status).toBe('DELIVERED');

    const late = { ...sandbox.scan(o.awb, 'IN TRANSIT'), current_timestamp: '01 01 2026 10:00:00' };
    expect((await hook(late)).json().data).toEqual({ status: 'processed' });
    const order = await orderRow(t.db, o.orderCode);
    expect(order.status).toBe('DELIVERED');
    expect(order.delivered_at).not.toBeNull();
    expect((await trackingRows(o.orderId)).map((r) => r.status_text)).toContain('IN TRANSIT');
    // The older event doesn't overwrite the shipment summary
    expect((await shipmentRow(t.db, o.orderId))!.last_status_text).toBe('DELIVERED');
  });

  it('unknown AWB → 200 business_error, stored with last_error, admin alerted', async () => {
    jobs.clear();
    const res = await hook({ awb: 'NOPE123', current_status: 'IN TRANSIT', current_timestamp: '12 10 2026 10:00:00' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'business_error' });
    const { rows } = await t.db.query(
      "SELECT last_error FROM webhook_events WHERE provider = 'SHIPROCKET' AND payload->>'awb' = 'NOPE123'",
    );
    expect(rows[0]!.last_error).toBe('UNKNOWN_AWB: NOPE123');
    expect(jobs.jobs).toContainEqual(
      expect.objectContaining({ name: 'ADMIN_ALERT', jobId: 'alert-UNKNOWN_AWB-NOPE123' }),
    );
  });

  it('NDR → DELIVERY_FAILED (customer + admin alerts); RTO → RTO_DELIVERED with no restock (D-31)', async () => {
    const o = await shippedOrder();
    const stock = (await t.db.query('SELECT available_stock FROM inventory_batches WHERE id = $1', [o.batchId]))
      .rows[0]!.available_stock;
    await hook(sandbox.scan(o.awb, 'PICKED UP'));
    await hook(sandbox.scan(o.awb, 'OUT FOR DELIVERY'));
    jobs.clear();
    await hook(sandbox.scan(o.awb, 'UNDELIVERED'));
    expect((await orderRow(t.db, o.orderCode)).status).toBe('DELIVERY_FAILED');
    expect(jobs.jobs.map((j) => j.jobId)).toEqual(
      expect.arrayContaining([`notify-delivery_attempt_failed-${o.orderId}`, `alert-DELIVERY_FAILED-${o.orderId}`]),
    );

    await hook(sandbox.scan(o.awb, 'RTO INITIATED'));
    await hook(sandbox.scan(o.awb, 'RTO DELIVERED'));
    const order = await orderRow(t.db, o.orderCode);
    expect(order.status).toBe('RTO_DELIVERED');
    expect(order.ops_issue).toMatch(/RTO_DELIVERED: decide refund \(Q-04\)/);
    expect((await statusLog(t.db, o.orderId)).at(-1)!.reason).toMatch(/no restock \(D-31\)/);
    const after = (await t.db.query('SELECT available_stock FROM inventory_batches WHERE id = $1', [o.batchId]))
      .rows[0]!.available_stock;
    expect(after).toBe(stock);
    const moves = await t.db.query(
      "SELECT count(*)::int AS n FROM inventory_movements WHERE order_id = $1 AND movement_type <> 'RESERVE'",
      [o.orderId],
    );
    expect(moves.rows[0]!.n).toBe(0);
  });

  it('PICKUP EXCEPTION → event stored, status unchanged, admin alert', async () => {
    const o = await shippedOrder();
    jobs.clear();
    await hook(sandbox.scan(o.awb, 'PICKUP EXCEPTION'));
    expect((await orderRow(t.db, o.orderCode)).status).toBe('PICKUP_SCHEDULED');
    expect(jobs.jobs).toContainEqual(expect.objectContaining({ jobId: `alert-PICKUP_EXCEPTION-${o.orderId}` }));
  });
});

describe('POLL_TRACKING fallback (§6.10, §6.12)', () => {
  it('with no webhook at all the poll moves the order (missed first scan → IN_TRANSIT → DELIVERED)', async () => {
    const o = await shippedOrder();
    sandbox.scan(o.awb, 'PICKED UP'); // courier scans, webhook never arrives
    await new Promise((r) => setTimeout(r, 1100)); // distinct second-resolution timestamps
    sandbox.scan(o.awb, 'DELIVERED');
    const r = await svc().logistics.pollTracking({ jitterMs: 0 });
    expect(r.failed).toBe(0);
    expect((await orderRow(t.db, o.orderCode)).status).toBe('DELIVERED');
    expect((await trackingRows(o.orderId)).every((e) => e.source === 'POLL')).toBe(true);

    // A second poll stores nothing new
    const before = (await trackingRows(o.orderId)).length;
    await svc().logistics.pollTracking({ jitterMs: 0 });
    expect((await trackingRows(o.orderId)).length).toBe(before);
  });

  it('poll records the charged weight and flags a > 10 % weight discrepancy; 48 h without a scan → pickup missed', async () => {
    const o = await shippedOrder();
    sandbox.byAwb(o.awb)!.weightKg = 0.75; // declared 480 g, courier bills 750 g
    jobs.clear();
    await svc(() => new Date(Date.now() + 49 * 3600_000)).logistics.pollTracking({ jitterMs: 0 });
    const s = (await shipmentRow(t.db, o.orderId))!;
    expect(s.charged_weight_g).toBe(750);
    expect((await orderRow(t.db, o.orderCode)).ops_issue).toMatch(
      /WEIGHT_DISCREPANCY: charged 750 g vs declared 480 g/,
    );
    expect(jobs.jobs.map((j) => j.jobId)).toEqual(
      expect.arrayContaining([`alert-WEIGHT_DISCREPANCY-${o.orderId}`, `alert-PICKUP_MISSED-${o.orderId}`]),
    );
  });
});

describe('dev shipping simulator (sandbox mode)', () => {
  it('POST /dev/shipping/simulate scans in the sandbox and delivers the signed webhook', async () => {
    const devSandbox = createShiprocketSandbox({ baseUrl: () => `${TEST_API_URL}/api/v1/dev/shiprocket/` });
    const devApp = await buildTestApp(
      { db: t.db, redis },
      { gateway, jobs, privateStorage, shiprocket, shiprocketSandbox: devSandbox },
    );
    try {
      const o = await shippedOrder();
      // The order was booked in the test sandbox; mirror its AWB into the dev one
      const booked = sandbox.byAwb(o.awb)!;
      devSandbox.state.shipments.set(booked.shipmentId, { ...booked, scans: [] });
      const res = await devApp.inject({
        method: 'POST',
        url: '/api/v1/dev/shipping/simulate',
        headers: { origin: 'http://localhost:3000' },
        payload: { orderCode: o.orderCode, status: 'PICKED UP' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        awb: o.awb,
        status: 'PICKED UP',
        webhook: { data: { status: 'processed' } },
      });
      expect((await orderRow(t.db, o.orderCode)).status).toBe('IN_TRANSIT');
    } finally {
      await devApp.close();
    }
  });
});

describe('POST /shipping/check-pincode via Shiprocket (§6.3)', () => {
  const check = (pincode: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/shipping/check-pincode',
      headers: { origin: 'http://localhost:3000' },
      payload: { pincode },
    });

  it('serviceable → ETD range, cached 24 h; not serviceable → cached 6 h; Shiprocket down → null, not cached', async () => {
    const ok = await check('110001');
    expect(ok.json().data).toEqual({
      pincode: '110001',
      serviceable: true,
      estimatedDays: { min: 3, max: 8 },
      courierHint: null,
    });
    expect(await redis.ttl('pk:svc:175101:110001')).toBeGreaterThan(24 * 3600 - 10);

    sandbox.unserviceable.add('799001');
    expect((await check('799001')).json().data).toMatchObject({ serviceable: false, estimatedDays: null });
    const ttl = await redis.ttl('pk:svc:175101:799001');
    expect(ttl).toBeGreaterThan(6 * 3600 - 10);
    expect(ttl).toBeLessThanOrEqual(6 * 3600);

    sandbox.failNext('courier/serviceability', 503);
    expect((await check('560001')).json().data).toEqual({
      pincode: '560001',
      serviceable: null,
      estimatedDays: null,
      courierHint: null,
    });
    expect(await redis.exists('pk:svc:175101:560001')).toBe(0);
  });
});
