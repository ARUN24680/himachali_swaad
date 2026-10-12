import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import type { ShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { buildTimeline, hubCity } from '../../src/modules/tracking/tracking.service';
import { as, catalogActors, cookieHeader } from '../helpers/catalog';
import { nextIp, uniquePhone } from '../helpers/checkout';
import { confirmedOrder, markPacked, registerPickupName, shipmentRow, workerServices } from '../helpers/logistics';
import { otpLogin } from '../helpers/session';
import { startShiprocketSandbox, TEST_COURIER_TOKEN } from '../helpers/shiprocket';
import {
  buildTestApp,
  fromBrowser,
  recordingJobs,
  testAuthConfig,
  testGateway,
  TEST_API_URL,
} from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Phase 8 §8.1–8.3: POST /track (code + phone, D-39), timeline merge, cache, rate limits, My Orders. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let sandbox: ShiprocketSandbox;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const auth = testAuthConfig();
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
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, privateStorage, shiprocket, auth });
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

const track = (orderCode: string, phone: string, ip = nextIp()) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/track',
    remoteAddress: ip,
    headers: fromBrowser(),
    payload: { orderCode, phone },
  });

const courierScan = (awb: string, status: string, location?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/courier-tracking',
    headers: { 'content-type': 'application/json', 'x-api-key': TEST_COURIER_TOKEN },
    payload: JSON.stringify(sandbox.scan(awb, status, location)),
  });

/** Order taken through booking → label → packed → pickup → courier scans (real webhook route). */
async function deliveredOrder() {
  const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 2);
  await svc().logistics.bookShipment(o.orderId);
  await svc().logistics.fetchAndStoreLabel(o.orderId);
  await markPacked(t.db, o.orderId);
  await svc(() => new Date(Date.now() + 3 * 86_400_000)).logistics.pickupBatch();
  const awb = (await shipmentRow(t.db, o.orderId))!.awb_code as string;
  await new Promise((r) => setTimeout(r, 1100)); // courier timestamps have 1 s resolution
  await courierScan(awb, 'PICKED UP', 'Kullu_Hub (Himachal Pradesh)');
  await new Promise((r) => setTimeout(r, 1100)); // courier timestamps have 1 s resolution
  await courierScan(awb, 'IN TRANSIT', 'Ambala_Hub (Haryana)');
  await new Promise((r) => setTimeout(r, 1100));
  await courierScan(awb, 'OUT FOR DELIVERY', 'Chennai_Hub (Tamil Nadu)');
  await new Promise((r) => setTimeout(r, 1100));
  await courierScan(awb, 'DELIVERED', 'Chennai');
  return { ...o, awb };
}

describe('POST /track (§8.1, D-39)', () => {
  it('code + matching phone → the story; 10-digit phone works too; wrong phone / unknown code / unpaid → the same 404', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const ok = await track(o.orderCode, o.phone);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toMatchObject({
      orderCode: o.orderCode,
      customerFirstName: 'Asha',
      destinationCity: 'Kullu',
      status: 'CONFIRMED',
      items: [
        {
          quantity: 1,
          netWeightG: 250,
          batchCode: expect.stringMatching(/^PK-\d{4}-/),
          manufacturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        },
      ],
      courier: null,
    });
    expect((await track(o.orderCode.toLowerCase(), o.phone.slice(3))).statusCode).toBe(200);

    const wrongPhone = await track(o.orderCode, uniquePhone());
    const unknown = await track('PK-ZZZZZZ', o.phone);
    expect(wrongPhone.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(wrongPhone.json().error).toEqual(unknown.json().error);

    expect((await track(o.orderCode, '12345')).statusCode).toBe(400);
  });

  it('response has no full address, full phone or e-mail (privacy snapshot)', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const data = (await track(o.orderCode, o.phone)).json().data;
    expect(Object.keys(data).sort()).toEqual(
      [
        'courier',
        'customerFirstName',
        'destinationCity',
        'etd',
        'items',
        'orderCode',
        'paymentStatus',
        'refund',
        'status',
        'timeline',
        'updatedAt',
      ].sort(),
    );
    const json = JSON.stringify(data);
    for (const pii of [o.phone, o.phone.slice(3), 'Mall Road', 'Thakur', 'asha@example.com', '175101']) {
      expect(json).not.toContain(pii);
    }
  });

  it('timeline merges bottling + our milestones + courier scans in time order with customer labels', async () => {
    const o = await deliveredOrder();
    const data = (await track(o.orderCode, o.phone)).json().data;
    expect(data.status).toBe('DELIVERED');
    expect(data.courier).toEqual({
      name: 'Sandbox Surface',
      awb: o.awb,
      trackingUrl: `https://shiprocket.co/tracking/${o.awb}`,
    });
    const steps = data.timeline.map((e: { key: string; label: string }) => `${e.key}:${e.label}`);
    expect(steps).toEqual([
      'BOTTLED:Bottled in Himachal',
      'CONFIRMED:Order confirmed',
      'PACKED:Airtight packed & sealed',
      'HANDED_TO_COURIER:Handed to courier',
      'IN_TRANSIT:In transit — Ambala',
      'OUT_FOR_DELIVERY:Out for delivery',
      'DELIVERED:Delivered',
    ]);
    const times = data.timeline.map((e: { at: string }) => e.at);
    expect([...times].sort()).toEqual(times);
    expect(data.timeline[0].detail).toBe(data.items[0].batchCode);
    // The first scan is the handover itself: the courier's hub on that step, not a separate line
    expect(data.timeline.find((e: { key: string }) => e.key === 'HANDED_TO_COURIER').detail).toBe('Kullu');
  });

  it('cached for 60 s, but a courier webhook shows up immediately (cache key follows updated_at)', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await svc().logistics.bookShipment(o.orderId);
    await svc().logistics.fetchAndStoreLabel(o.orderId);
    await markPacked(t.db, o.orderId);
    await svc(() => new Date(Date.now() + 3 * 86_400_000)).logistics.pickupBatch();
    const first = (await track(o.orderCode, o.phone)).json().data;
    expect(first.status).toBe('PICKUP_SCHEDULED');
    const keys = await redis.keys(`pk:track:${o.orderId}:*`);
    expect(keys).toHaveLength(1);
    expect(await redis.ttl(keys[0]!)).toBeGreaterThan(50);

    await courierScan((await shipmentRow(t.db, o.orderId))!.awb_code as string, 'PICKED UP', 'Kullu_Hub');
    const after = (await track(o.orderCode, o.phone)).json().data;
    expect(after.status).toBe('IN_TRANSIT');
    expect(after.timeline.map((e: { key: string }) => e.key)).toContain('HANDED_TO_COURIER');
  });

  it('cancelled + refunded → CANCELLED and REFUND entries', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await as(app, actors.adminJar).post(`/api/v1/admin/orders/${o.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    const data = (await track(o.orderCode, o.phone)).json().data;
    expect(data.status).toBe('CANCELLED');
    expect(data.refund).toMatchObject({ status: 'PENDING', amountPaise: expect.any(Number) });
    expect(data.timeline.map((e: { key: string; tone: string }) => `${e.key}/${e.tone}`).slice(-2)).toEqual([
      'CANCELLED/destructive',
      'REFUND/info',
    ]);
  });

  it('11th lookup in 10 min from one IP → 429; 11th for one order code from many IPs → 429', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    const ip = nextIp();
    const codes: number[] = [];
    // A different unknown code per call, so only the per-IP limit is in play
    for (let i = 0; i < 11; i++)
      codes.push((await track(`PK-ZZZZ${'ABCDEFGHJK'[i]}${i % 2 ? 'M' : 'N'}`, o.phone, ip)).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true);
    expect(codes[10]).toBe(429);

    const perCode: number[] = [];
    for (let i = 0; i < 11; i++) perCode.push((await track(o.orderCode, uniquePhone())).statusCode);
    expect(perCode.slice(0, 10).every((c) => c === 404)).toBe(true);
    const blocked = await track(o.orderCode, o.phone); // even the right phone, once the code is hammered
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('timeline helpers', () => {
  it('hub city from courier location strings', () => {
    expect(hubCity('Ambala_Hub (Haryana)')).toBe('Ambala');
    expect(hubCity('chennai, tamil nadu')).toBe('Chennai');
    expect(hubCity(null)).toBeNull();
  });
  it('a return from OUT_FOR_DELIVERY to IN_TRANSIT is not a second "handed to courier"', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 12, 5, m));
    const log = (to: string, m: number) => ({
      id: m,
      order_id: '00000000-0000-0000-0000-000000000000',
      from_status: null,
      to_status: to as never,
      actor_type: 'SHIPROCKET' as const,
      actor_id: null,
      reason: null,
      metadata: {},
      created_at: at(m),
    });
    const tl = buildTimeline({
      items: [],
      logs: [log('IN_TRANSIT', 1), log('OUT_FOR_DELIVERY', 2), log('IN_TRANSIT', 3), log('DELIVERY_FAILED', 4)],
      scans: [],
      refund: null,
    });
    expect(tl.map((e) => e.key)).toEqual(['HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED']);
  });
});

describe('My Orders (§8.3, D-18)', () => {
  it('OTP-signed-in customer sees own + guest orders placed with their verified phone; others get 404', async () => {
    const phone = uniquePhone();
    const guest = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { phone });
    const { jar } = await otpLogin(app, phone, (ph) => auth.otpProvider.lastCodeFor(ph));

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/me/orders',
      headers: fromBrowser({ cookie: cookieHeader(jar) }),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      orders: [{ orderCode: guest.orderCode, status: 'CONFIRMED', itemCount: 1 }],
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/me/orders/${guest.orderCode}`,
      headers: fromBrowser({ cookie: cookieHeader(jar) }),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data).toMatchObject({
      orderCode: guest.orderCode,
      canCancel: true,
      invoiceAvailable: false,
      timeline: expect.any(Array),
    });

    const other = (await otpLogin(app, uniquePhone(), (ph) => auth.otpProvider.lastCodeFor(ph))).jar;
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/me/orders/${guest.orderCode}`,
      headers: fromBrowser({ cookie: cookieHeader(other) }),
    });
    expect(denied.statusCode).toBe(404);
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/me/orders',
      headers: fromBrowser({ cookie: cookieHeader(other) }),
    });
    expect(empty.json().data).toMatchObject({ total: 0, orders: [] });
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/orders' })).statusCode).toBe(401);
    expect((await as(app, actors.partnerJar).get('/api/v1/me/orders')).statusCode).toBe(403);
  });
});
