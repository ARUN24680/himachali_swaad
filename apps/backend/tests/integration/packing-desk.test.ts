import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { PDFDocument } from 'pdf-lib';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createWebPushSender } from '../../src/integrations/push/web-push';
import { createProcessors } from '../../src/jobs/processors';
import { createBullJobQueue } from '../../src/jobs/queues';
import { startWorkers } from '../../src/jobs/runner';
import { createSweepers } from '../../src/jobs/sweepers';
import { silentLogger } from '../helpers/test-logger';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { as, catalogActors, cookieHeader } from '../helpers/catalog';
import { orderRow, statusLog } from '../helpers/checkout';
import { assignPickupLocation, createStaff } from '../helpers/factories';
import { confirmedOrder, registerPickupName, workerServices } from '../helpers/logistics';
import { staffLogin, type Jar } from '../helpers/session';
import { startShiprocketSandbox } from '../helpers/shiprocket';
import { buildTestApp, fakeReporter, fromBrowser, recordingJobs, testGateway, TEST_API_URL } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Phase 7 backend: partner scope (D-17, D-40), packing queue, idempotent Mark Packed → pickup job,
 * A4 4-up labels, manifests, Web Push new-order alerts with WhatsApp fallback, daily digest.
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
let pushServer: FastifyInstance;
let pushBase = '';
const pushHits: { id: string; ttl: string | undefined; encoding: string | undefined; bytes: number }[] = [];
const vapid = webpush.generateVAPIDKeys();
// Push services are HTTPS-only → a self-signed stand-in for 127.0.0.1
const certDir = mkdtempSync(join(tmpdir(), 'pk-push-tls-'));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'ec',
    '-pkeyopt',
    'ec_paramgen_curve:prime256v1',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
    '-keyout',
    join(certDir, 'key.pem'),
    '-out',
    join(certDir, 'cert.pem'),
  ],
  { stdio: 'ignore' },
);
const tls = { key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) };
const push = createWebPushSender({
  publicKey: vapid.publicKey,
  privateKey: vapid.privateKey,
  subject: 'mailto:ops@pahadikhatki.test',
  agent: new Agent({ ca: tls.cert }),
});
const jobs = recordingJobs();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-desk-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-desk-secret',
});

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  const sb = await startShiprocketSandbox(redis);
  shiprocket = sb.client;
  closeSandbox = sb.close;
  // Stand-in push service (FCM / Mozilla autopush): 201 normally, 410 for ".../gone-*"
  pushServer = Fastify({ logger: false, https: tls });
  pushServer.addContentTypeParser('*', { parseAs: 'buffer' }, (_r, body, done) => done(null, body));
  pushServer.post('/push/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    pushHits.push({
      id,
      ttl: req.headers.ttl as string | undefined,
      encoding: req.headers['content-encoding'] as string | undefined,
      bytes: (req.body as Buffer).length,
    });
    return reply.code(id.startsWith('gone-') ? 410 : 201).send();
  });
  pushBase = `${await pushServer.listen({ port: 0, host: '127.0.0.1' })}/push`;
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, privateStorage, shiprocket, push });
  actors = await catalogActors(app, t.db);
  await registerPickupName(t.db, actors.kitchenA.id);
  await registerPickupName(t.db, actors.kitchenB.id);
});
afterAll(async () => {
  await app.close();
  await pushServer.close();
  await closeSandbox();
  await redis.quit();
  await t.destroy();
});

const svc = () => workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage, push });

/** Paid order booked + labelled → AWAITING_PACKING in `kitchenId`. */
async function readyToPack(kitchenId: string, quantity = 1) {
  const o = await confirmedOrder(app, t.db, gateway, kitchenId, quantity);
  await svc().logistics.bookShipment(o.orderId);
  await svc().logistics.fetchAndStoreLabel(o.orderId);
  expect((await orderRow(t.db, o.orderCode)).status).toBe('AWAITING_PACKING');
  return o;
}

const FULL_CHECKLIST = {
  correctBatch: true,
  weighed: true,
  sealChecked: true,
  shrinkApplied: true,
  bubbleWrapped: true,
  labelApplied: true,
};

const markPacked = (
  jar: Jar,
  orderCode: string,
  key: string | null = randomUUID(),
  checklist: object = FULL_CHECKLIST,
) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/partner/orders/${orderCode}/mark-packed`,
    headers: fromBrowser({ cookie: cookieHeader(jar), ...(key ? { 'idempotency-key': key } : {}) }),
    payload: { checklist },
  });

/** A real browser-shaped subscription (P-256 key + 16-byte auth) pointing at the stand-in push service. */
function fakeSubscription(id: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `${pushBase}/${id}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

describe('scope + queue (Phase 7 §7.1, §7.5)', () => {
  it("partner sees only their kitchen's queue: first name + city, batch codes, pack-by — no phone/address/revenue", async () => {
    const a = await readyToPack(actors.kitchenA.id, 2);
    const b = await readyToPack(actors.kitchenB.id);

    const res = await as(app, actors.partnerJar).get('/api/v1/partner/orders');
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    const codes = data.orders.map((o: { orderCode: string }) => o.orderCode);
    expect(codes).toContain(a.orderCode);
    expect(codes).not.toContain(b.orderCode);
    expect(data.toPack).toBe(codes.length);
    expect(data.cutoffHourIst).toBe(11);

    const card = data.orders.find((o: { orderCode: string }) => o.orderCode === a.orderCode);
    expect(card).toMatchObject({
      customerFirstName: 'Asha',
      city: 'Kullu',
      state: 'Himachal Pradesh',
      labelReady: true,
      courierName: 'Sandbox Surface',
      items: [
        { quantity: 2, netWeightG: 250, batches: [{ batchCode: expect.stringMatching(/^PK-\d{4}-/), quantity: 2 }] },
      ],
    });
    expect(new Date(card.packBy).getTime()).toBeGreaterThan(Date.now());
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/\+91|Mall Road|Thakur|totalPaise|pricePaise|asha@/);

    // ADMIN sees both kitchens
    const admin = (await as(app, actors.adminJar).get('/api/v1/partner/orders')).json().data;
    expect(admin.orders.map((o: { orderCode: string }) => o.orderCode)).toEqual(
      expect.arrayContaining([a.orderCode, b.orderCode]),
    );
  });

  it("another kitchen's order → 404 on mark-packed / label / A4; partner on admin routes → 403; anonymous → 401", async () => {
    const b = await readyToPack(actors.kitchenB.id);
    expect((await markPacked(actors.partnerJar, b.orderCode)).statusCode).toBe(404);
    expect((await as(app, actors.partnerJar).get(`/api/v1/partner/orders/${b.orderCode}/label`)).statusCode).toBe(404);
    expect((await as(app, actors.partnerJar).get(`/api/v1/partner/labels/a4?orders=${b.orderCode}`)).statusCode).toBe(
      404,
    );
    expect(
      (
        await as(app, actors.partnerJar).post(`/api/v1/admin/orders/${b.orderCode}/cancel`, {
          reason: 'not mine',
          refund: true,
        })
      ).statusCode,
    ).toBe(403);
    expect((await as(app, actors.partnerJar).get('/api/v1/admin/settings')).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/partner/orders' })).statusCode).toBe(401);
    // A customer session is not staff
    expect((await app.inject({ method: 'GET', url: '/api/v1/partner/manifests' })).statusCode).toBe(401);
  });
});

describe('Mark Packed (§7.7)', () => {
  it('needs the Idempotency-Key and all six checklist ticks', async () => {
    const a = await readyToPack(actors.kitchenA.id);
    expect((await markPacked(actors.partnerJar, a.orderCode, null)).statusCode).toBe(400);
    const { sealChecked: _omit, ...partial } = FULL_CHECKLIST;
    expect((await markPacked(actors.partnerJar, a.orderCode, randomUUID(), partial)).statusCode).toBe(400);
    expect(
      (await markPacked(actors.partnerJar, a.orderCode, randomUUID(), { ...FULL_CHECKLIST, weighed: false }))
        .statusCode,
    ).toBe(400);
    expect((await orderRow(t.db, a.orderCode)).status).toBe('AWAITING_PACKING');
  });

  it('AWAITING_PACKING → PACKED by the partner, pickup job enqueued; offline replays (same key) + double taps → exactly one transition', async () => {
    const a = await readyToPack(actors.kitchenA.id);
    jobs.clear();
    const key = randomUUID();
    const results = await Promise.all([
      markPacked(actors.partnerJar, a.orderCode, key),
      markPacked(actors.partnerJar, a.orderCode, key),
      markPacked(actors.partnerJar, a.orderCode, key),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const bodies = results.map((r) => r.json().data);
    expect(bodies.filter((b) => b.changed)).toHaveLength(1);
    expect(bodies.every((b) => b.status === 'PACKED')).toBe(true);
    // Replayed later (app reopened offline queue) — still a no-op
    expect((await markPacked(actors.partnerJar, a.orderCode, key)).json().data).toMatchObject({
      changed: false,
      status: 'PACKED',
    });

    const packed = (await statusLog(t.db, a.orderId)).filter((l) => l.to_status === 'PACKED');
    expect(packed).toEqual([
      {
        from_status: 'AWAITING_PACKING',
        to_status: 'PACKED',
        actor_type: 'KITCHEN_PARTNER',
        reason: 'packed at the desk',
      },
    ]);
    const meta = await t.db.query(
      "SELECT actor_id, metadata FROM order_status_logs WHERE order_id = $1 AND to_status = 'PACKED'",
      [a.orderId],
    );
    expect(meta.rows[0]!.actor_id).toBe(actors.partner.id);
    expect(meta.rows[0]!.metadata).toEqual({ checklist: FULL_CHECKLIST, idempotencyKey: key });
    expect((await orderRow(t.db, a.orderCode)).packed_at).not.toBeNull();
    expect(jobs.jobs.filter((j) => j.name === 'SHIPROCKET_SCHEDULE_PICKUP')).toEqual([
      { name: 'SHIPROCKET_SCHEDULE_PICKUP', data: { orderId: a.orderId }, jobId: `pickup-${a.orderId}` },
    ]);
    expect(bodies[0]!.pickupDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Gone from the queue, present in the PACKED tab
    const queue = (await as(app, actors.partnerJar).get('/api/v1/partner/orders')).json().data.orders;
    expect(queue.map((o: { orderCode: string }) => o.orderCode)).not.toContain(a.orderCode);
    const packedTab = (await as(app, actors.partnerJar).get('/api/v1/partner/orders?status=PACKED')).json().data.orders;
    expect(packedTab.map((o: { orderCode: string }) => o.orderCode)).toContain(a.orderCode);
  });

  it('cancelled order → 409 ORDER_CANCELLED ("pack mat karein"); label not ready → 409 NOT_READY', async () => {
    const a = await readyToPack(actors.kitchenA.id);
    await as(app, actors.adminJar).post(`/api/v1/admin/orders/${a.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    const res = await markPacked(actors.partnerJar, a.orderCode);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'INVALID_STATE', details: { reason: 'ORDER_CANCELLED' } });

    const c = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id); // CONFIRMED, no label yet
    const notReady = await markPacked(actors.partnerJar, c.orderCode);
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json().error.details).toMatchObject({ reason: 'NOT_READY' });
  });
});

describe('labels + manifests (§7.6)', () => {
  it('A4 4-up: 5 labels → 2 A4 pages, every label audited; unknown/not-ready codes → 404', async () => {
    const orders = [];
    for (let i = 0; i < 5; i++) orders.push(await readyToPack(actors.kitchenA.id));
    const codes = orders.map((o) => o.orderCode);
    const res = await as(app, actors.partnerJar).get(`/api/v1/partner/labels/a4?orders=${codes.join(',')}`);
    expect(res.statusCode).toBe(200);
    const url = new URL(res.json().data.url);
    const file = await app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(file.statusCode).toBe(200);
    const pdf = await PDFDocument.load(file.rawPayload);
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    const audits = await t.db.query(
      "SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'LABEL_VIEW' AND entity_id = ANY($1)",
      [orders.map((o) => o.orderId)],
    );
    expect(audits.rows[0]!.n).toBe(5);

    expect((await as(app, actors.partnerJar).get('/api/v1/partner/labels/a4?orders=PK-ZZZZZZ')).statusCode).toBe(404);
    expect((await as(app, actors.partnerJar).get('/api/v1/partner/labels/a4?orders=not-a-code')).statusCode).toBe(400);
    const pending = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const nr = await as(app, actors.partnerJar).get(`/api/v1/partner/labels/a4?orders=${pending.orderCode}`);
    expect(nr.statusCode).toBe(404);
    expect(nr.json().error.details).toEqual({ orderCodes: [pending.orderCode] });
  });

  it("after the pickup batch the partner sees today's manifest (signed URL), other kitchen's not", async () => {
    const a = await readyToPack(actors.kitchenA.id);
    await markPacked(actors.partnerJar, a.orderCode);
    await workerServices({
      db: t.db,
      redis,
      gateway,
      jobs,
      shiprocket,
      privateStorage,
      now: () => new Date(Date.now() + 3 * 86_400_000),
    }).logistics.pickupBatch();
    expect((await orderRow(t.db, a.orderCode)).status).toBe('PICKUP_SCHEDULED');
    const res = (await as(app, actors.partnerJar).get('/api/v1/partner/manifests')).json().data;
    const m = res.manifests.find((x: { orderCodes: string[] }) => x.orderCodes.includes(a.orderCode));
    expect(m).toMatchObject({ kitchenCode: actors.kitchenA.code, url: expect.stringContaining('/manifests/') });
    for (const x of res.manifests) expect(x.kitchenCode).toBe(actors.kitchenA.code);
  });
});

describe('Web Push + WhatsApp fallback (§7.3)', () => {
  it('subscribe → new-order alert pushed (encrypted, logged SENT); retry does not double-push; 410 → subscription deleted', async () => {
    const cfg = (await as(app, actors.partnerJar).get('/api/v1/partner/push-subscriptions')).json().data;
    expect(cfg).toEqual({ vapidPublicKey: vapid.publicKey, subscribed: false });
    const live = fakeSubscription(`live-${randomUUID()}`);
    const gone = fakeSubscription(`gone-${randomUUID()}`);
    for (const s of [live, gone]) {
      expect((await as(app, actors.partnerJar).post('/api/v1/partner/push-subscriptions', s)).statusCode).toBe(201);
    }
    expect((await as(app, actors.partnerJar).get('/api/v1/partner/push-subscriptions')).json().data.subscribed).toBe(
      true,
    );

    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 2);
    expect(jobs.jobs).toContainEqual({
      name: 'PARTNER_NEW_ORDER_ALERT',
      data: { orderId: o.orderId },
      jobId: `notify-new_order_alert-${o.orderId}`,
    });
    jobs.clear();
    pushHits.length = 0;
    const r = await svc().notifications.partnerNewOrderAlert(o.orderId);
    expect(r).toEqual({ partners: 1, pushed: 1, fallbacks: 0 });
    expect(pushHits).toHaveLength(2);
    const hit = pushHits.find((h) => h.id.startsWith('live-'))!;
    expect(hit).toMatchObject({ encoding: 'aes128gcm', ttl: String(6 * 3600) });
    expect(hit.bytes).toBeGreaterThan(50);
    expect(jobs.jobs.filter((j) => j.name === 'WHATSAPP_SEND')).toHaveLength(0);

    const logRows = await t.db.query(
      'SELECT channel, template, status, variables, error FROM notifications_log WHERE order_id = $1 ORDER BY status',
      [o.orderId],
    );
    expect(logRows.rows).toEqual([
      expect.objectContaining({
        channel: 'PUSH',
        template: 'new_order_alert',
        status: 'SENT',
        variables: { order_code: o.orderCode, jars: 2 },
      }),
      expect.objectContaining({ status: 'FAILED', error: 'subscription gone (410)' }),
    ]);
    const left = await t.db.query('SELECT endpoint FROM push_subscriptions WHERE user_id = $1', [actors.partner.id]);
    expect(left.rows.map((x) => x.endpoint)).toEqual([live.endpoint]);

    // BullMQ retry of the same job: nothing pushed twice
    pushHits.length = 0;
    expect(await svc().notifications.partnerNewOrderAlert(o.orderId)).toEqual({ partners: 1, pushed: 0, fallbacks: 0 });
    expect(pushHits).toHaveLength(0);

    // Unsubscribe
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/partner/push-subscriptions',
      headers: fromBrowser({ cookie: cookieHeader(actors.partnerJar) }),
      payload: { endpoint: live.endpoint },
    });
    expect(del.json().data).toEqual({ removed: true });
  });

  it('partner without any subscription → WhatsApp fallback enqueued (Phase 8 sender)', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenB.id);
    const partnerB = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    await assignPickupLocation(t.db, partnerB.id, actors.kitchenB.id);
    jobs.clear();
    expect(await svc().notifications.partnerNewOrderAlert(o.orderId)).toEqual({ partners: 1, pushed: 0, fallbacks: 1 });
    expect(jobs.jobs).toEqual([
      {
        name: 'WHATSAPP_SEND',
        data: {
          template: 'new_order_alert',
          userId: partnerB.id,
          orderId: o.orderId,
          variables: { order_code: o.orderCode, jars: '1' },
        },
        jobId: `notify-wa-new_order_alert-${o.orderId}-${partnerB.id}`,
      },
    ]);
  });

  it('push not configured on the server → config says null, subscribe refused, alerts fall back to WhatsApp', async () => {
    const plain = await buildTestApp({ db: t.db, redis }, { gateway, jobs, privateStorage, shiprocket });
    try {
      const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
      await assignPickupLocation(t.db, partner.id, actors.kitchenA.id);
      const jar = (await staffLogin(plain, partner.email, partner.password)).jar;
      expect((await as(plain, jar).get('/api/v1/partner/push-subscriptions')).json().data).toEqual({
        vapidPublicKey: null,
        subscribed: false,
      });
      expect((await as(plain, jar).post('/api/v1/partner/push-subscriptions', fakeSubscription('x'))).statusCode).toBe(
        409,
      );
    } finally {
      await plain.close();
    }
  });

  it('daily digest: only kitchens with orders to pack, once per day', async () => {
    const live = fakeSubscription(`digest-${randomUUID()}`);
    await as(app, actors.partnerJar).post('/api/v1/partner/push-subscriptions', live);
    pushHits.length = 0;
    jobs.clear();
    const notifications = svc().notifications;
    const first = await notifications.partnerDailyDigest();
    expect(first.kitchens).toBeGreaterThanOrEqual(1);
    expect(pushHits.some((h) => h.id === live.endpoint.split('/').pop())).toBe(true);
    const log = await t.db.query(
      "SELECT variables FROM notifications_log WHERE template = 'packing_digest' AND user_id = $1 AND status = 'SENT'",
      [actors.partner.id],
    );
    expect(log.rows[0]!.variables).toMatchObject({ count: expect.any(Number) });
    pushHits.length = 0;
    await notifications.partnerDailyDigest();
    expect(pushHits.filter((h) => h.id === live.endpoint.split('/').pop())).toHaveLength(0);
  });
});

describe('new-order push end to end through BullMQ (§7.3 "push 10 s ke andar")', () => {
  it('payment confirmed → PARTNER_NEW_ORDER_ALERT on the real queue → worker → push service hit, well under 10 s', async () => {
    const connection = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
    const bull = createBullJobQueue(connection);
    const liveApp = await buildTestApp({ db: t.db, redis }, { gateway, jobs: bull, privateStorage, shiprocket, push });
    const services = workerServices({ db: t.db, redis, gateway, jobs: bull, shiprocket, privateStorage, push });
    const reporter = fakeReporter();
    const sweepers = createSweepers({ db: t.db, svc: services, gateway, jobs: bull, logger: silentLogger(), reporter });
    const workers = startWorkers({
      connection,
      processors: createProcessors({ db: t.db, svc: services, sweepers, logger: silentLogger() }),
      svc: services,
      logger: silentLogger(),
      reporter,
      concurrency: 5,
    });
    try {
      const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
      await assignPickupLocation(t.db, partner.id, actors.kitchenB.id);
      const jar = (await staffLogin(liveApp, partner.email, partner.password)).jar;
      const sub = fakeSubscription(`e2e-${randomUUID()}`);
      expect((await as(liveApp, jar).post('/api/v1/partner/push-subscriptions', sub)).statusCode).toBe(201);
      const subId = sub.endpoint.split('/').pop()!;

      const started = Date.now();
      const o = await confirmedOrder(liveApp, t.db, gateway, actors.kitchenB.id, 2);
      const deadline = started + 10_000;
      while (Date.now() < deadline && !pushHits.some((h) => h.id === subId)) {
        await new Promise((r) => setTimeout(r, 25));
      }
      const elapsedMs = Date.now() - started;
      expect(pushHits.some((h) => h.id === subId)).toBe(true);
      expect(elapsedMs).toBeLessThan(10_000);
      const log = await t.db.query(
        "SELECT status FROM notifications_log WHERE order_id = $1 AND template = 'new_order_alert' AND user_id = $2",
        [o.orderId, partner.id],
      );
      expect(log.rows).toEqual([{ status: 'SENT' }]);
      console.info(`[evidence] payment verify → push delivered to the push service in ${elapsedMs} ms`);
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      await bull.close();
      await connection.quit();
      await liveApp.close();
    }
  }, 30_000);
});
