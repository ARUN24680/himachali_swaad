import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { createProcessors } from '../../src/jobs/processors';
import { createBullJobQueue } from '../../src/jobs/queues';
import { startWorkers } from '../../src/jobs/runner';
import { createSweepers } from '../../src/jobs/sweepers';
import { selectCourier } from '../../src/modules/logistics/logistics.service';
import { as, catalogActors } from '../helpers/catalog';
import { batchStock, orderRow, statusLog } from '../helpers/checkout';
import { confirmedOrder, markPacked, registerPickupName, shipmentRow, workerServices } from '../helpers/logistics';
import { startShiprocketSandbox } from '../helpers/shiprocket';
import { buildTestApp, fakeReporter, recordingJobs, testGateway, TEST_API_URL } from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Phase 6 §6.5–6.8 + §6.13: booking → AWB → label → AWAITING_PACKING, idempotency, retries and
 * dead letters through real BullMQ workers, token refresh, labels, pickup cut-off, admin cancel.
 * The REAL Shiprocket HTTP client talks to the sandbox on an ephemeral port (no outbound calls).
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let sandbox: ShiprocketSandbox;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
let clock = Date.now();
const jobs = recordingJobs();
const reporter = fakeReporter();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-labels-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-label-secret',
  now: () => clock,
});
let pickupName: string;

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
  pickupName = await registerPickupName(t.db, actors.kitchenA.id);
});
afterAll(async () => {
  await app.close();
  await closeSandbox();
  await redis.quit();
  await t.destroy();
});

const svc = (now?: () => Date) =>
  workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage, reporter, now });

describe('selectCourier (§6.5)', () => {
  const o = (courierId: number, ratePaise: number, rating: number | null, etdDays: number | null) => ({
    courierId,
    courierName: `C${courierId}`,
    ratePaise,
    rating,
    etdDays,
    etd: null,
  });
  it('filters by rating + ETD, then cheapest, faster on a tie; falls back to cheapest overall', () => {
    const rules = { minRating: 4, maxEtdDays: 7 };
    expect(selectCourier([o(1, 5000, 3.9, 3), o(2, 6000, 4.5, 6), o(3, 6000, 4.2, 4)], rules)).toEqual({
      courier: expect.objectContaining({ courierId: 3 }),
      fallback: false,
    });
    expect(selectCourier([o(1, 5000, 3.9, 3), o(2, 4000, 4.8, 9)], rules)).toEqual({
      courier: expect.objectContaining({ courierId: 2 }),
      fallback: true,
    });
    expect(selectCourier([], rules)).toBeNull();
  });
});

describe('SHIPROCKET_CREATE_ORDER → FETCH_AND_STORE_LABEL (§6.5, §6.6)', () => {
  it('payment confirm → booked with the filtered cheapest courier → label stored → AWAITING_PACKING', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    jobs.clear();
    const logistics = svc().logistics;

    const booked = await logistics.bookShipment(o.orderId);
    expect(booked.status).toBe('booked');
    expect(jobs.jobs).toContainEqual({
      name: 'FETCH_AND_STORE_LABEL',
      data: { orderId: o.orderId },
      jobId: `label-${o.orderId}`,
    });

    // Payload: our order code, the kitchen's Shiprocket nickname, weight from products (D-33)
    const sb = sandbox.byChannelOrderId(o.orderCode)!;
    expect(sb.pickupLocation).toBe(pickupName);
    expect(sb.weightKg).toBe(0.48); // test product: packed_weight_g = 250 + 230
    const s = (await shipmentRow(t.db, o.orderId))!;
    // Sandbox Budget (₹48) has rating 3.2 < 4.0 → Sandbox Surface ₹62.50 / 5 d is chosen
    expect(s).toMatchObject({
      courier_name: 'Sandbox Surface',
      courier_company_id: 10,
      freight_paise: 6250,
      dead_weight_g: 480,
    });
    expect(s.awb_code).toBe(sb.awb);

    await expect(logistics.fetchAndStoreLabel(o.orderId)).resolves.toEqual({ status: 'awaiting_packing' });
    const order = await orderRow(t.db, o.orderCode);
    expect(order.status).toBe('AWAITING_PACKING');
    expect((await shipmentRow(t.db, o.orderId))!.label_key).toBe(`labels/${o.orderCode}.pdf`);
    expect((await statusLog(t.db, o.orderId)).at(-1)).toMatchObject({
      from_status: 'CONFIRMED',
      to_status: 'AWAITING_PACKING',
      actor_type: 'SYSTEM',
    });
  });

  it('running the job twice (and resuming after a crash) → ONE Shiprocket order and ONE AWB', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const logistics = svc().logistics;
    const before = { create: sandbox.calls.get('orders/create') ?? 0, awb: sandbox.calls.get('courier/assign') ?? 0 };

    await logistics.bookShipment(o.orderId);
    await expect(logistics.bookShipment(o.orderId)).resolves.toMatchObject({ status: 'already_booked' });
    expect(sandbox.calls.get('orders/create')).toBe(before.create + 1);
    expect(sandbox.calls.get('courier/assign')).toBe(before.awb + 1);

    // Crash after createOrder but before AWB: the re-run skips create and resumes at the AWB step
    const o2 = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    sandbox.failNext('courier/assign', 503);
    await expect(logistics.bookShipment(o2.orderId)).rejects.toMatchObject({ retryable: true });
    const createsAfterCrash = sandbox.calls.get('orders/create');
    await expect(logistics.bookShipment(o2.orderId)).resolves.toMatchObject({ status: 'booked' });
    expect(sandbox.calls.get('orders/create')).toBe(createsAfterCrash);
    const { rows } = await t.db.query('SELECT count(*)::int AS n FROM shipments WHERE order_id = ANY($1)', [
      [o.orderId, o2.orderId],
    ]);
    expect(rows[0]!.n).toBe(2);
  });

  it('is a no-op for an order that is not CONFIRMED + PAID', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const logistics = svc().logistics;
    await logistics.bookShipment(o.orderId);
    await logistics.fetchAndStoreLabel(o.orderId); // → AWAITING_PACKING
    const creates = sandbox.calls.get('orders/create');
    await expect(logistics.bookShipment(o.orderId)).resolves.toEqual({ status: 'skipped' });
    expect(sandbox.calls.get('orders/create')).toBe(creates);
  });

  it('expired token → one forced re-login, the job still succeeds', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.checkWallet(); // makes sure a token is cached
    const logins = sandbox.calls.get('auth/login') ?? 0;
    sandbox.expireTokens();
    await expect(svc().logistics.bookShipment(o.orderId)).resolves.toMatchObject({ status: 'booked' });
    expect(sandbox.calls.get('auth/login')).toBe(logins + 1);
  });
});

describe('retries + dead letter through real BullMQ workers (§6.1)', () => {
  it('503 twice → retried with backoff → booked; 5 × 503 → ops_issue + last_error + admin alert; 422 → no retry', async () => {
    const connection = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
    const bull = createBullJobQueue(connection, { backoffMs: 20 });
    // Unique queue prefix per run is not needed: job ids are per-order and orders are new
    const services = svc();
    const sweepers = createSweepers({ db: t.db, svc: services, gateway, jobs, logger: silentLogger(), reporter });
    const workers = startWorkers({
      connection,
      processors: createProcessors({ db: t.db, svc: services, sweepers, logger: silentLogger() }),
      svc: services,
      logger: silentLogger(),
      reporter,
      concurrency: 2,
    });
    const until = async (cond: () => Promise<boolean>, ms = 15_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await cond()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('timed out');
    };
    try {
      // (a) transient 503s → success on the 3rd attempt
      const a = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
      const createsBefore = sandbox.calls.get('orders/create') ?? 0;
      sandbox.failNext('orders/create', 503, 2);
      await bull.add('SHIPROCKET_CREATE_ORDER', { orderId: a.orderId }, `ship-${a.orderId}`);
      await until(async () => Boolean((await shipmentRow(t.db, a.orderId))?.awb_code));
      expect(sandbox.calls.get('orders/create')).toBe(createsBefore + 3);
      expect((await shipmentRow(t.db, a.orderId))!.booking_attempts).toBe(3);

      // (b) 5 consecutive 503s → dead letter
      const b = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
      jobs.clear();
      sandbox.failNext('orders/create', 503, 5);
      await bull.add('SHIPROCKET_CREATE_ORDER', { orderId: b.orderId }, `ship-${b.orderId}`);
      await until(async () => Boolean((await orderRow(t.db, b.orderCode)).ops_issue));
      const ob = await orderRow(t.db, b.orderCode);
      expect(ob.status).toBe('CONFIRMED');
      expect(ob.ops_issue).toMatch(/^SHIPROCKET_CREATE_ORDER: shiprocket orders\/create 503/);
      const sbRow = (await shipmentRow(t.db, b.orderId))!;
      expect(sbRow.booking_attempts).toBe(5);
      expect(sbRow.last_error).toMatch(/503/);
      expect(jobs.jobs).toContainEqual(
        expect.objectContaining({ name: 'ADMIN_ALERT', jobId: `alert-BOOKING_FAILED-${b.orderId}` }),
      );

      // (c) 4xx validation error → fails at once (one attempt), dead-lettered
      const c = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
      sandbox.failNext('orders/create', 422, 1);
      await bull.add('SHIPROCKET_CREATE_ORDER', { orderId: c.orderId }, `ship-${c.orderId}`);
      await until(async () => Boolean((await orderRow(t.db, c.orderCode)).ops_issue));
      expect((await shipmentRow(t.db, c.orderId))!.booking_attempts).toBe(1);
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      await bull.close();
      await connection.quit();
    }
  }, 60_000);
});

describe('labels (§6.6, D-11)', () => {
  it('401 without auth; partner of the kitchen + admin get a 5-min signed URL; views audited; link expires', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.bookShipment(o.orderId);
    await svc().logistics.fetchAndStoreLabel(o.orderId);

    const anon = await app.inject({ method: 'GET', url: `/api/v1/partner/orders/${o.orderCode}/label` });
    expect(anon.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v1/admin/orders/${o.orderCode}/label` })).statusCode).toBe(
      401,
    );
    // Partner can't use the admin route
    expect((await as(app, actors.partnerJar).get(`/api/v1/admin/orders/${o.orderCode}/label`)).statusCode).toBe(403);

    const res = await as(app, actors.partnerJar).get(`/api/v1/partner/orders/${o.orderCode}/label`);
    expect(res.statusCode).toBe(200);
    const { url, expiresAt } = res.json().data as { url: string; expiresAt: string };
    expect(new Date(expiresAt).getTime() - clock).toBe(300_000);
    const path = new URL(url);
    const file = await app.inject({ method: 'GET', url: `${path.pathname}${path.search}` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    expect((await as(app, actors.adminJar).get(`/api/v1/admin/orders/${o.orderCode}/label`)).statusCode).toBe(200);
    const audits = await t.db.query(
      "SELECT actor_id FROM admin_audit_log WHERE action = 'LABEL_VIEW' AND entity_id = $1 ORDER BY id",
      [o.orderId],
    );
    expect(audits.rows.map((r) => r.actor_id)).toEqual([actors.partner.id, actors.admin.id]);

    // 5 minutes later the same link is dead
    clock += 301_000;
    try {
      expect((await app.inject({ method: 'GET', url: `${path.pathname}${path.search}` })).statusCode).toBe(403);
    } finally {
      clock = Date.now();
    }
  });

  it("another kitchen's order → 404 for the partner", async () => {
    await registerPickupName(t.db, actors.kitchenB.id);
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenB.id);
    await svc().logistics.bookShipment(o.orderId);
    await svc().logistics.fetchAndStoreLabel(o.orderId);
    expect((await as(app, actors.partnerJar).get(`/api/v1/partner/orders/${o.orderCode}/label`)).statusCode).toBe(404);
  });
});

describe('pickup scheduling (§6.7, D-36)', () => {
  /** A Monday in IST at the given hour (2026-10-12 is a Monday). */
  const mondayIst = (hour: number) => new Date(Date.UTC(2026, 9, 12, hour, 0) - 5.5 * 3600_000);

  async function packedOrder() {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.bookShipment(o.orderId);
    await svc().logistics.fetchAndStoreLabel(o.orderId);
    await markPacked(t.db, o.orderId);
    return o;
  }

  it('packed before the 11:00 IST cut-off → same day; after → next working day (Sat after cut-off → Mon)', async () => {
    const early = await packedOrder();
    await t.db.query('UPDATE orders SET packed_at = $2 WHERE id = $1', [early.orderId, mondayIst(9)]);
    await expect(svc().logistics.schedulePickup(early.orderId)).resolves.toEqual({ pickupDate: '2026-10-12' });

    const late = await packedOrder();
    await t.db.query('UPDATE orders SET packed_at = $2 WHERE id = $1', [late.orderId, mondayIst(12)]);
    await expect(svc().logistics.schedulePickup(late.orderId)).resolves.toEqual({ pickupDate: '2026-10-13' });

    const saturday = await packedOrder();
    await t.db.query('UPDATE orders SET packed_at = $2 WHERE id = $1', [
      saturday.orderId,
      new Date(Date.UTC(2026, 9, 17, 15, 0) - 5.5 * 3600_000),
    ]);
    await expect(svc().logistics.schedulePickup(saturday.orderId)).resolves.toEqual({ pickupDate: '2026-10-19' });
  });

  it('batch: nothing before the cut-off; after it ONE pickup + manifest for the day → PICKUP_SCHEDULED', async () => {
    const a = await packedOrder();
    const b = await packedOrder();
    for (const o of [a, b])
      await t.db.query('UPDATE orders SET packed_at = $2 WHERE id = $1', [o.orderId, mondayIst(9)]);

    const before = await svc(() => mondayIst(10)).logistics.pickupBatch();
    expect(before.booked).toBe(0);
    expect((await orderRow(t.db, a.orderCode)).status).toBe('PACKED');

    const pickups = sandbox.calls.get('courier/generate') ?? 0;
    const after = await svc(() => mondayIst(11)).logistics.pickupBatch();
    expect(after.failed).toBe(0);
    expect(after.booked).toBeGreaterThanOrEqual(2);
    for (const o of [a, b]) {
      expect((await orderRow(t.db, o.orderCode)).status).toBe('PICKUP_SCHEDULED');
      const s = (await shipmentRow(t.db, o.orderId))!;
      expect(s.pickup_token).toMatch(/^PT/);
      expect(s.manifest_key).toMatch(/^manifests\/2026-10-12-/);
      expect(s.pickup_scheduled_for).toBe('2026-10-12');
    }
    // generate/pickup + generate/label share the 'courier/generate' counter: one pickup call per kitchen
    expect((sandbox.calls.get('courier/generate') ?? 0) - pickups).toBe(1);
    expect((await shipmentRow(t.db, a.orderId))!.pickup_token).toBe((await shipmentRow(t.db, b.orderId))!.pickup_token);
  });
});

describe('admin cancel after booking (§6.8)', () => {
  it('cancel at PACKED → stock released, refund queued, AWB cancel job → AWB cancelled at Shiprocket', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.bookShipment(o.orderId);
    await svc().logistics.fetchAndStoreLabel(o.orderId);
    await markPacked(t.db, o.orderId);
    const stock = await batchStock(t.db, o.batchId);
    jobs.clear();

    const res = await as(app, actors.adminJar).post(`/api/v1/admin/orders/${o.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' });
    expect(await batchStock(t.db, o.batchId)).toBe(stock + 1); // never left the kitchen → restock (D-31)
    expect(jobs.jobs.map((j) => j.name)).toEqual(
      expect.arrayContaining(['INITIATE_REFUND', 'SHIPROCKET_CANCEL_SHIPMENT']),
    );

    const awb = (await shipmentRow(t.db, o.orderId))!.awb_code as string;
    await expect(svc().logistics.cancelShipment(o.orderId)).resolves.toEqual({ status: 'cancelled' });
    expect(sandbox.byAwb(awb)!.cancelled).toBe(true);
    expect((await shipmentRow(t.db, o.orderId))!.cancelled_at).not.toBeNull();
    // Re-run is a no-op
    await expect(svc().logistics.cancelShipment(o.orderId)).resolves.toEqual({ status: 'nothing' });
  });

  it('cancelled while the booking job was mid-flight → the booking is undone, no label', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    // Admin cancels right after payment (CONFIRMED) — cancel job enqueued even before any AWB
    jobs.clear();
    await as(app, actors.adminJar).post(`/api/v1/admin/orders/${o.orderCode}/cancel`, { reason: 'dup', refund: true });
    expect(jobs.jobs.map((j) => j.name)).toContain('SHIPROCKET_CANCEL_SHIPMENT');
    await expect(svc().logistics.bookShipment(o.orderId)).resolves.toEqual({ status: 'skipped' });
    expect(await shipmentRow(t.db, o.orderId)).toBeUndefined();
  });
});

describe('AWB cancel dead letter (§6.8)', () => {
  it('cancel job gives up → ops_issue + last_error + AWB_CANCEL_FAILED alert (partner/admin must stop the pickup)', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.bookShipment(o.orderId);
    jobs.clear();
    await svc().logistics.jobGaveUp('SHIPROCKET_CANCEL_SHIPMENT', o.orderId, 'shiprocket orders/cancel 503: down');
    expect((await orderRow(t.db, o.orderCode)).ops_issue).toMatch(
      /^SHIPROCKET_CANCEL_SHIPMENT: shiprocket orders\/cancel 503/,
    );
    expect((await shipmentRow(t.db, o.orderId))!.last_error).toMatch(/SHIPROCKET_CANCEL_SHIPMENT/);
    expect(jobs.jobs).toContainEqual(
      expect.objectContaining({ name: 'ADMIN_ALERT', jobId: `alert-AWB_CANCEL_FAILED-${o.orderId}` }),
    );
  });
});

describe('wallet (§6.12)', () => {
  it('balance below settings.shiprocket_wallet_min_paise → admin alert, once per day', async () => {
    sandbox.setWalletRupees(1500.5);
    jobs.clear();
    await expect(svc().logistics.checkWallet()).resolves.toEqual({ balancePaise: 150_050, low: true });
    expect(jobs.jobs[0]).toMatchObject({ name: 'ADMIN_ALERT', data: { kind: 'WALLET_LOW' } });
    expect(jobs.jobs[0]!.jobId).toMatch(/^alert-WALLET_LOW-\d{4}-\d{2}-\d{2}$/);
    sandbox.setWalletRupees(5000);
    jobs.clear();
    await expect(svc().logistics.checkWallet()).resolves.toMatchObject({ low: false });
    expect(jobs.jobs).toHaveLength(0);
  });
});
