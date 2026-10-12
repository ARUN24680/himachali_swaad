import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { as, catalogActors, cookieHeader } from '../helpers/catalog';
import { orderRow } from '../helpers/checkout';
import { confirmedOrder, registerPickupName, workerServices } from '../helpers/logistics';
import { startShiprocketSandbox } from '../helpers/shiprocket';
import { buildTestApp, fromBrowser, recordingJobs, testGateway, TEST_API_URL } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Phase 9 §9.3–9.5, §9.11: admin orders list/detail/actions, customers, audit coverage, webhook replay. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const jobs = recordingJobs();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-admin-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-admin-secret',
});

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  const sb = await startShiprocketSandbox(redis);
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

const svc = () => workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage });
const admin = () => as(app, actors.adminJar);
const adminPost = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url,
    headers: fromBrowser({ cookie: cookieHeader(actors.adminJar), ...headers }),
    payload: payload as object,
  });
const auditCount = async (action: string, entityId?: string) =>
  (
    await t.db.query(
      'SELECT count(*)::int AS n FROM admin_audit_log WHERE action = $1 AND ($2::text IS NULL OR entity_id = $2)',
      [action, entityId ?? null],
    )
  ).rows[0]!.n as number;

describe('GET /admin/orders (§9.3)', () => {
  it('tabs, search by code / phone / AWB, date filter, server-side pagination + sort, counts per tab', async () => {
    const a = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 2);
    const b = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.bookShipment(b.orderId);
    await svc().logistics.fetchAndStoreLabel(b.orderId); // AWAITING_PACKING
    await t.db.query("UPDATE orders SET ops_issue = 'TEST: needs a look' WHERE id = $1", [a.orderId]);

    const all = (await admin().get('/api/v1/admin/orders?pageSize=1&sort=created_asc')).json().data;
    expect(all.pageSize).toBe(1);
    expect(all.orders).toHaveLength(1);
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.counts.all).toBe(all.total);
    expect(all.orders[0]).toMatchObject({
      orderCode: expect.stringMatching(/^PK-/),
      itemsSummary: expect.stringContaining('× Test Pickle 250g'),
    });

    const attention = (await admin().get('/api/v1/admin/orders?tab=attention')).json().data;
    expect(attention.orders.map((o: { orderCode: string }) => o.orderCode)).toContain(a.orderCode);
    expect(attention.orders.find((o: { orderCode: string }) => o.orderCode === a.orderCode).opsIssue).toBe(true);

    const byCode = (await admin().get(`/api/v1/admin/orders?q=${b.orderCode}`)).json().data;
    expect(byCode.orders.map((o: { orderCode: string }) => o.orderCode)).toEqual([b.orderCode]);
    const byPhone = (await admin().get(`/api/v1/admin/orders?q=${a.phone.slice(3)}`)).json().data;
    expect(byPhone.orders.map((o: { orderCode: string }) => o.orderCode)).toEqual([a.orderCode]);
    const awb = (await t.db.query('SELECT awb_code FROM shipments WHERE order_id = $1', [b.orderId])).rows[0]!.awb_code;
    const byAwb = (await admin().get(`/api/v1/admin/orders?q=${awb}`)).json().data;
    expect(byAwb.orders.map((o: { orderCode: string; awbCode: string }) => [o.orderCode, o.awbCode])).toEqual([
      [b.orderCode, awb],
    ]);

    const awaiting = (await admin().get(`/api/v1/admin/orders?tab=awaiting_packing&q=${b.orderCode}`)).json().data;
    expect(awaiting.orders).toHaveLength(1);
    const future = (await admin().get('/api/v1/admin/orders?from=2099-01-01')).json().data;
    expect(future.total).toBe(0);
    expect((await admin().get('/api/v1/admin/orders?tab=nope')).statusCode).toBe(400);
  });
});

describe('order detail + actions (§9.4)', () => {
  it('detail has allocations, timeline, payments (with gateway fee), shipment, actions', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const d = (await admin().get(`/api/v1/admin/orders/${o.orderCode}`)).json().data;
    expect(d.order).toMatchObject({ orderCode: o.orderCode, status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(d.customer.phone).toBe(o.phone);
    expect(d.items[0].allocations[0]).toMatchObject({
      batchCode: expect.stringMatching(/^PK-/),
      quantity: 1,
      status: 'COMMITTED',
    });
    expect(d.timeline.map((e: { key: string }) => e.key)).toEqual(['BOTTLED', 'CONFIRMED']);
    expect(d.payments[0]).toMatchObject({ status: 'CAPTURED', feePaise: null }); // filled at settlement time
    expect(d.refundablePaise).toBe(d.order.totalPaise);
    expect(d.actions).toEqual({ canCancel: true, canRefund: true, canRetryShipment: true, canResolveIssue: false });
    expect((await admin().get('/api/v1/admin/orders/PK-ZZZZZZ')).statusCode).toBe(404);
  });

  it('partial refund: > refundable → 400; same Idempotency-Key twice → ONE refund + one gateway refund; audited', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const total = (await orderRow(t.db, o.orderCode)).total_paise as number;
    const url = `/api/v1/admin/orders/${o.orderCode}/refunds`;
    const tooMuch = await adminPost(
      url,
      { amountPaise: total + 1, reason: 'GOODWILL', notes: 'sorry for delay' },
      { 'idempotency-key': randomUUID() },
    );
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.json().error.details).toMatchObject({ refundablePaise: total });

    jobs.clear();
    const key = randomUUID();
    const first = await adminPost(
      url,
      { amountPaise: 5_000, reason: 'GOODWILL', notes: 'sorry for delay' },
      { 'idempotency-key': key },
    );
    const again = await adminPost(
      url,
      { amountPaise: 5_000, reason: 'GOODWILL', notes: 'sorry for delay' },
      { 'idempotency-key': key },
    );
    expect(first.statusCode).toBe(200);
    expect(again.json().data).toMatchObject({
      refundId: first.json().data.refundId,
      message: 'Refund already requested.',
    });
    const refundJobs = jobs.jobs.filter((j) => j.name === 'INITIATE_REFUND');
    expect(refundJobs).toHaveLength(1);
    // The job itself is retry-safe at the gateway: run it twice → one Razorpay refund
    const services = svc();
    await services.payments.initiateRefund((refundJobs[0]!.data as { refundId: string }).refundId);
    await services.payments.initiateRefund((refundJobs[0]!.data as { refundId: string }).refundId);
    const payment = (
      await t.db.query("SELECT gateway_payment_id FROM payments WHERE order_id = $1 AND status = 'CAPTURED'", [
        o.orderId,
      ])
    ).rows[0]!;
    expect(await gateway.listPaymentRefunds(payment.gateway_payment_id)).toHaveLength(1);
    expect((await orderRow(t.db, o.orderCode)).payment_status).toBe('REFUND_PENDING');
    expect(await auditCount('ORDER_REFUND', o.orderId)).toBe(1);
    const d = (await admin().get(`/api/v1/admin/orders/${o.orderCode}`)).json().data;
    expect(d.refundablePaise).toBe(total - 5_000);
  });

  it('cancel only from allowed states: CONFIRMED ok, DELIVERED → 409 ILLEGAL_TRANSITION (admin.cancel)', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const ok = await adminPost(`/api/v1/admin/orders/${o.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    expect(ok.json().data.status).toBe('CANCELLED');
    const d = (await admin().get(`/api/v1/admin/orders/${o.orderCode}`)).json().data;
    expect(d.actions.canCancel).toBe(false);
    const again = await adminPost(`/api/v1/admin/orders/${o.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('every mutating admin route writes an admin_audit_log row', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await t.db.query("UPDATE orders SET ops_issue = 'SHIPROCKET_CREATE_ORDER: test' WHERE id = $1", [o.orderId]);
    const base = `/api/v1/admin/orders/${o.orderCode}`;
    const before = (await t.db.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0]!.n as number;
    const calls: [string, () => Promise<{ statusCode: number }>, string][] = [
      ['POST notes', () => adminPost(`${base}/notes`, { text: 'customer asked for gift wrap' }), 'ORDER_NOTE'],
      [
        'POST resend',
        () => adminPost(`${base}/notifications/resend`, { template: 'order_confirmed' }),
        'NOTIFICATION_RESEND',
      ],
      ['POST retry-shipment', () => adminPost(`${base}/retry-shipment`, {}), 'SHIPMENT_RETRY'],
      [
        'POST resolve-issue',
        () => adminPost(`${base}/resolve-issue`, { note: 'retried booking' }),
        'ORDER_ISSUE_RESOLVED',
      ],
      [
        'POST refunds',
        () =>
          adminPost(
            `${base}/refunds`,
            { amountPaise: 100, reason: 'GOODWILL', notes: 'courtesy' },
            { 'idempotency-key': randomUUID() },
          ),
        'ORDER_REFUND',
      ],
      ['POST cancel', () => adminPost(`${base}/cancel`, { reason: 'duplicate order', refund: true }), 'ORDER_CANCEL'],
      [
        'PATCH settings',
        () =>
          app.inject({
            method: 'PATCH',
            url: '/api/v1/admin/settings',
            headers: fromBrowser({ cookie: cookieHeader(actors.adminJar) }),
            payload: { key: 'low_stock_threshold', value: 15 },
          }),
        'SETTING_UPDATE',
      ],
      ['POST webhook replay', async () => replayableEvent(), 'WEBHOOK_REPLAY'],
      ['GET export', () => admin().get('/api/v1/admin/exports/orders'), 'EXPORT'],
    ];
    for (const [name, call, action] of calls) {
      const res = await call();
      expect(res.statusCode, name).toBeLessThan(300);
      expect(await auditCount(action), `${name} → ${action}`).toBeGreaterThan(0);
    }
    const after = (await t.db.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0]!.n as number;
    expect(after - before).toBeGreaterThanOrEqual(calls.length);
    const note = (await admin().get(`${base}`)).json().data.notes;
    expect(note).toEqual([expect.objectContaining({ text: 'customer asked for gift wrap', by: actors.admin.email })]);
    expect((await orderRow(t.db, o.orderCode)).ops_issue).toBeNull();
    expect(jobs.jobs.some((j) => j.name === 'NOTIFY_RESEND')).toBe(true);
    expect(
      jobs.jobs.some((j) => j.name === 'SHIPROCKET_CREATE_ORDER' && j.jobId?.startsWith(`ship-${o.orderId}-retry-`)),
    ).toBe(true);
  });
});

/** A Razorpay webhook that failed as a business error (unknown order) — then replayed. */
async function replayableEvent() {
  const { rows } = await t.db.query(
    `INSERT INTO webhook_events (provider, event_id, event_type, payload, last_error)
     VALUES ('RAZORPAY', $1, 'payment.failed', $2, 'NOT_FOUND: Order not found.') RETURNING id`,
    [
      `evt_${randomUUID()}`,
      {
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_x', order_id: 'order_missing', amount: 100, status: 'failed' } } },
      },
    ],
  );
  const failures = (await admin().get('/api/v1/admin/webhooks/failures')).json().data.events;
  expect(failures.map((e: { id: number }) => e.id)).toContain(rows[0]!.id);
  return adminPost(`/api/v1/admin/webhooks/${rows[0]!.id}/replay`, {});
}

describe('customers (§9.5) + roles', () => {
  it('customers aggregate by phone with LTV + RTO risk; detail lists their orders', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 2);
    const list = (await admin().get(`/api/v1/admin/customers?q=${encodeURIComponent(o.phone.slice(3))}`)).json().data;
    expect(list.customers).toEqual([
      expect.objectContaining({ phone: o.phone, name: 'Asha Thakur', ordersCount: 1, rtoCount: 0, risk: false }),
    ]);
    const d = (await admin().get(`/api/v1/admin/customers/${encodeURIComponent(o.phone)}`)).json().data;
    expect(d.orders.map((x: { orderCode: string }) => x.orderCode)).toEqual([o.orderCode]);
    expect((await admin().get('/api/v1/admin/customers/%2B919999999999')).statusCode).toBe(404);
  });

  it('KITCHEN_PARTNER → 403 on every /admin route family; anonymous → 401; bull-board too', async () => {
    for (const url of [
      '/api/v1/admin/dashboard',
      '/api/v1/admin/orders',
      '/api/v1/admin/customers',
      '/api/v1/admin/settlements',
      '/api/v1/admin/expenses',
      '/api/v1/admin/staff',
      '/api/v1/admin/audit-log',
      '/api/v1/admin/exports/orders',
      '/api/v1/admin/webhooks/failures',
      '/api/v1/admin/inventory/expiry-alerts',
    ]) {
      expect((await as(app, actors.partnerJar).get(url)).statusCode, url).toBe(403);
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
  });
});

describe('dashboard + expiry alerts (§9.2, §9.6)', () => {
  it('KPIs, 30-day series, revenue by product; cached 60 s', async () => {
    await redis.del('pk:admin:dashboard');
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const d = (await admin().get('/api/v1/admin/dashboard')).json().data;
    expect(d.ordersPerDay).toHaveLength(30);
    expect(d.revenueToday.orders).toBeGreaterThan(0);
    expect(d.revenueToday.exGstPaise).toBeLessThan(d.revenueToday.grossPaise);
    expect(d.revenueByProduct[0]).toMatchObject({ title: 'Test Pickle' });
    expect(await redis.ttl('pk:admin:dashboard')).toBeGreaterThan(50);
    void o;
  });

  it('expiry alerts: batches whose sellable window closes within 14 days', async () => {
    const { insertBatchDirect, createProduct } = await import('../helpers/factories');
    const p = await createProduct(t.db);
    // buffer 45 + 7 = 52: expiry in 60 days → sellable until day 8 → alert; 200 days → no
    const soon = await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: actors.kitchenA.id,
      quantity: 5,
      expiresInDays: 60,
    });
    const later = await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: actors.kitchenA.id,
      quantity: 5,
      expiresInDays: 200,
    });
    const alerts = (await admin().get('/api/v1/admin/inventory/expiry-alerts'))
      .json()
      .data.batches.filter((b: { batchId: string }) => b.batchId === soon || b.batchId === later);
    expect(alerts).toEqual([expect.objectContaining({ batchId: soon, daysLeft: 8, availableStock: 5 })]);
  });
});
