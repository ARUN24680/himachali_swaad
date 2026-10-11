import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { createSweepers } from '../../src/jobs/sweepers';
import { createCommerceServices } from '../../src/services';
import { catalogActors, as } from '../helpers/catalog';
import {
  batchStock,
  expireHold,
  liveProduct,
  orderRow,
  payAtGateway,
  placeOrder,
  statusLog,
  uniquePhone,
  verify,
} from '../helpers/checkout';
import { otpLogin, type Jar } from '../helpers/session';
import {
  buildTestApp,
  fakeReporter,
  fromBrowser,
  recordingJobs,
  spyRevalidator,
  testAuthConfig,
  testGateway,
  testStorage,
  TEST_API_URL,
} from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Expiry sweeper, payment-init failure, order status access, cancel, invoices, saved addresses. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
const jobs = recordingJobs();
const auth = testAuthConfig();
let clock = Date.now();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-inv-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'inv-secret',
  now: () => clock,
});
let actors: Awaited<ReturnType<typeof catalogActors>>;

const services = () =>
  createCommerceServices({
    db: t.db,
    redis,
    logger: silentLogger(),
    reporter: fakeReporter(),
    storage: testStorage(),
    privateStorage,
    revalidator: spyRevalidator(),
    gateway,
    jobs,
    allowDraftInvoice: true,
  });

beforeAll(async () => {
  t = await createTestDb({ max: 30 });
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  gateway = testGateway(redis);
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, auth, privateStorage });
  actors = await catalogActors(app, t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});
beforeEach(() => {
  jobs.clear();
  clock = Date.now();
});

async function paidOrder(opts: { phone?: string; jar?: Jar; stock?: number; qty?: number } = {}) {
  const p = await liveProduct(t.db, actors.kitchenA.id, { stock: opts.stock ?? 5 });
  const res = await placeOrder(app, [{ productId: p.id, quantity: opts.qty ?? 2 }], {
    phone: opts.phone,
    jar: opts.jar,
  });
  expect(res.statusCode).toBe(201);
  const co = res.json().data;
  const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
  expect((await verify(app, verifyBody)).json().data.status).toBe('CONFIRMED');
  return { p, co, order: await orderRow(t.db, co.orderCode) };
}

describe('EXPIRE_RESERVATIONS sweeper', () => {
  it('expires unpaid holds: stock released, RELEASE movements, EXPIRED + log', async () => {
    const svc = services();
    const sweep = createSweepers({ db: t.db, svc, gateway, jobs, logger: silentLogger(), reporter: fakeReporter() });
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 4 });
    const co = (await placeOrder(app, [{ productId: p.id, quantity: 3 }])).json().data;
    const order = await orderRow(t.db, co.orderCode);
    expect(await batchStock(t.db, p.batchId!)).toBe(1);

    expect((await sweep.expireReservations()).expired).toBe(0); // hold still valid
    await expireHold(t.db, order.id);
    expect((await sweep.expireReservations()).expired).toBeGreaterThanOrEqual(1);

    expect((await orderRow(t.db, co.orderCode)).status).toBe('EXPIRED');
    expect(await batchStock(t.db, p.batchId!)).toBe(4);
    const mv = await t.db.query(
      "SELECT quantity_delta FROM inventory_movements WHERE order_id = $1 AND movement_type = 'RELEASE'",
      [order.id],
    );
    expect(mv.rows).toEqual([{ quantity_delta: 3 }]);
    expect((await statusLog(t.db, order.id)).at(-1)).toMatchObject({ to_status: 'EXPIRED', actor_type: 'SYSTEM' });
  });

  it('confirms instead of expiring when Razorpay already captured the payment (missed webhook)', async () => {
    const svc = services();
    const sweep = createSweepers({ db: t.db, svc, gateway, jobs, logger: silentLogger(), reporter: fakeReporter() });
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 4 });
    const co = (await placeOrder(app, [{ productId: p.id, quantity: 1 }])).json().data;
    await payAtGateway(gateway, co.razorpayOrderId); // paid, but no verify and no webhook
    await expireHold(t.db, (await orderRow(t.db, co.orderCode)).id);
    const r = await sweep.expireReservations();
    expect(r.confirmed).toBeGreaterThanOrEqual(1);
    expect((await orderRow(t.db, co.orderCode)).status).toBe('CONFIRMED');
  });

  it('Razorpay order creation failure → 502 PAYMENT_INIT_FAILED and the jars are back at once', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 2 });
    gateway.failNextCreateOrder();
    const res = await placeOrder(app, [{ productId: p.id, quantity: 2 }]);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('PAYMENT_INIT_FAILED');
    expect(await batchStock(t.db, p.batchId!)).toBe(2);
    const { rows } = await t.db.query(
      "SELECT o.status, l.reason FROM orders o JOIN order_status_logs l ON l.order_id = o.id AND l.to_status = 'EXPIRED' WHERE o.idempotency_key IS NOT NULL ORDER BY o.created_at DESC LIMIT 1",
    );
    expect(rows[0]).toEqual({ status: 'EXPIRED', reason: 'RAZORPAY_ORDER_CREATE_FAILED' });
  });
});

describe('order status + access', () => {
  it('guest reads with the checkout phone; wrong phone / no proof → same 404', async () => {
    const phone = uniquePhone();
    const { co } = await paidOrder({ phone });
    const url = `/api/v1/orders/${co.orderCode}/status`;
    const ok = await app.inject({ method: 'GET', url: `${url}?phone=${encodeURIComponent(phone)}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toMatchObject({
      orderCode: co.orderCode,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      shippingCity: 'Kullu',
      canCancel: false,
      retryPayment: null,
    });
    expect(JSON.stringify(ok.json().data)).not.toContain('Mall Road'); // no full address
    for (const bad of [
      `${url}?phone=%2B919000000000`,
      url,
      `/api/v1/orders/PK-ZZZZZZ/status?phone=${encodeURIComponent(phone)}`,
    ]) {
      const r = await app.inject({ method: 'GET', url: bad });
      expect(r.statusCode).toBe(404);
    }
  });

  it('pending order exposes retryPayment for the same Razorpay order', async () => {
    const phone = uniquePhone();
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 2 });
    const co = (await placeOrder(app, [{ productId: p.id, quantity: 1 }], { phone })).json().data;
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${co.orderCode}/status?phone=${encodeURIComponent(phone)}`,
    });
    expect(r.json().data.retryPayment).toEqual({
      razorpayOrderId: co.razorpayOrderId,
      keyId: 'rzp_test_mock',
      gateway: 'mock',
      amountPaise: co.amountPaise,
    });
  });
});

describe('cancel', () => {
  it('customer (OTP session, same phone as a guest order) cancels → stock back, refund intent, CANCELLED', async () => {
    const phone = uniquePhone();
    const { p, co, order } = await paidOrder({ phone });
    const { jar } = await otpLogin(app, phone, (ph) => auth.otpProvider.lastCodeFor(ph));
    const status = await as(app, jar).get(`/api/v1/orders/${co.orderCode}/status`);
    expect(status.json().data.canCancel).toBe(true);

    const res = await as(app, jar).post(`/api/v1/orders/${co.orderCode}/cancel`, { reason: 'Ordered by mistake' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ orderCode: co.orderCode, status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' });
    expect(await batchStock(t.db, p.batchId!)).toBe(5);
    const r = await t.db.query('SELECT reason FROM refunds WHERE order_id = $1', [order.id]);
    expect(r.rows).toEqual([{ reason: 'CUSTOMER_CANCEL' }]);
    expect(jobs.jobs.map((j) => j.name)).toEqual(expect.arrayContaining(['INITIATE_REFUND', 'ORDER_CANCELLED']));

    // Cancelling again is an illegal transition
    const again = await as(app, jar).post(`/api/v1/orders/${co.orderCode}/cancel`, { reason: 'again please' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ILLEGAL_TRANSITION');
  });

  it("another customer can't cancel (404), a guest can't (401)", async () => {
    const { co } = await paidOrder();
    const { jar } = await otpLogin(app, uniquePhone(), (ph) => auth.otpProvider.lastCodeFor(ph));
    expect((await as(app, jar).post(`/api/v1/orders/${co.orderCode}/cancel`, { reason: 'not mine' })).statusCode).toBe(
      404,
    );
    const guest = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${co.orderCode}/cancel`,
      headers: fromBrowser(),
      payload: { reason: 'guest' },
    });
    expect(guest.statusCode).toBe(401);
  });

  it('admin cancel (refund required for paid) writes an audit row; partner is forbidden', async () => {
    const { co, order } = await paidOrder();
    const url = `/api/v1/admin/orders/${co.orderCode}/cancel`;
    expect((await as(app, actors.partnerJar).post(url, { reason: 'kitchen issue' })).statusCode).toBe(403);
    const noRefund = await as(app, actors.adminJar).post(url, { reason: 'kitchen issue', refund: false });
    expect(noRefund.statusCode).toBe(422);
    const res = await as(app, actors.adminJar).post(url, { reason: 'kitchen issue' });
    expect(res.json().data.status).toBe('CANCELLED');
    const a = await t.db.query("SELECT action FROM admin_audit_log WHERE entity_id = $1 AND action = 'ORDER_CANCEL'", [
      order.id,
    ]);
    expect(a.rowCount).toBe(1);
  });
});

describe('GST invoice (D-32)', () => {
  it('20 parallel confirmations → gap-free, unique invoice numbers in one FY sequence', async () => {
    const svc = services();
    const orders = await Promise.all(Array.from({ length: 20 }, () => paidOrder({ stock: 2, qty: 1 })));
    const results = await Promise.all(orders.map((o) => svc.invoices.generate(o.order.id)));
    const numbers = results.map((r) => r!.invoiceNumber);
    expect(new Set(numbers).size).toBe(20);
    const seqs = numbers.map((n) => Number(n.split('/')[2])).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => seqs[0]! + i));
    expect(numbers[0]).toMatch(/^PK\/\d{4}-\d{2}\/\d{6}$/);
    // Re-running the job keeps the number (retry-safe)
    expect((await svc.invoices.generate(orders[0]!.order.id))!.invoiceNumber).toBe(numbers[0]);
  });

  it('invoice URL is signed and stops working after it expires', async () => {
    const svc = services();
    const phone = uniquePhone();
    const { co, order } = await paidOrder({ phone });
    const before = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${co.orderCode}/invoice?phone=${encodeURIComponent(phone)}`,
    });
    expect(before.statusCode).toBe(404); // not generated yet
    await svc.invoices.generate(order.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${co.orderCode}/invoice?phone=${encodeURIComponent(phone)}`,
    });
    expect(res.statusCode).toBe(200);
    const { url, expiresAt } = res.json().data;
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    const path = url.replace(TEST_API_URL, '');
    const pdf = await app.inject({ method: 'GET', url: path });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    const tampered = await app.inject({ method: 'GET', url: path.replace(/sig=[0-9a-f]{4}/, 'sig=0000') });
    expect(tampered.statusCode).toBe(403);
    clock += 301_000;
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(403);
  });
});

describe('/me/addresses', () => {
  it('CRUD with a single default, max 10, scoped to the owner', async () => {
    const { jar } = await otpLogin(app, uniquePhone(), (ph) => auth.otpProvider.lastCodeFor(ph));
    const me = as(app, jar);
    const addr = (n: number, isDefault = false) => ({
      label: `Home ${n}`,
      fullName: 'Asha Thakur',
      phone: '+919812345678',
      line1: `${n} Mall Road`,
      city: 'Kullu',
      state: 'Himachal Pradesh',
      pincode: '175101',
      isDefault,
    });
    const first = await me.post('/api/v1/me/addresses', addr(1));
    expect(first.statusCode).toBe(201);
    expect(first.json().data.address.isDefault).toBe(true); // first one becomes default
    const second = (await me.post('/api/v1/me/addresses', addr(2, true))).json().data.address;
    const list = (await me.get('/api/v1/me/addresses')).json().data.addresses;
    expect(list.filter((a: { isDefault: boolean }) => a.isDefault).map((a: { id: string }) => a.id)).toEqual([
      second.id,
    ]);

    const patched = await me.patch(`/api/v1/me/addresses/${first.json().data.address.id}`, { landmark: 'Near temple' });
    expect(patched.json().data.address.landmark).toBe('Near temple');

    for (let i = 3; i <= 10; i++) expect((await me.post('/api/v1/me/addresses', addr(i))).statusCode).toBe(201);
    const eleventh = await me.post('/api/v1/me/addresses', addr(11));
    expect(eleventh.statusCode).toBe(422);

    const other = (await otpLogin(app, uniquePhone(), (ph) => auth.otpProvider.lastCodeFor(ph))).jar;
    expect((await as(app, other).get('/api/v1/me/addresses')).json().data.addresses).toEqual([]);
    expect((await as(app, other).patch(`/api/v1/me/addresses/${second.id}`, { label: 'x' })).statusCode).toBe(404);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/me/addresses/${second.id}`,
      headers: fromBrowser({
        cookie: Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      }),
    });
    expect(del.statusCode).toBe(200);
    const after = (await me.get('/api/v1/me/addresses')).json().data.addresses;
    expect(after.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1); // newest promoted
    expect((await as(app, actors.adminJar).get('/api/v1/me/addresses')).statusCode).toBe(403);
  });

  it('checkout "save address" stores it once for a logged-in customer', async () => {
    const phone = uniquePhone();
    const { jar } = await otpLogin(app, phone, (ph) => auth.otpProvider.lastCodeFor(ph));
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
    const body = (q: number) => ({
      items: [{ productId: p.id, quantity: q }],
      customer: { fullName: 'Ravi Negi', phone },
      shippingAddress: { line1: '4 Dhalpur', city: 'Kullu', state: 'Himachal Pradesh', pincode: '175101' },
      saveAddress: true,
      consent: { orderUpdates: true, whatsappOptIn: true },
    });
    expect((await placeOrder(app, [], { jar, body: body(1) })).statusCode).toBe(201);
    expect((await placeOrder(app, [], { jar, body: body(2) })).statusCode).toBe(201);
    const list = (await as(app, jar).get('/api/v1/me/addresses')).json().data.addresses;
    expect(list).toHaveLength(1);
    const o = await t.db.query(
      'SELECT user_id, whatsapp_opt_in, whatsapp_opt_in_at FROM orders WHERE customer_phone = $1',
      [phone],
    );
    expect(o.rows[0]!.user_id).not.toBeNull();
    expect(o.rows[0]!.whatsapp_opt_in).toBe(true);
    expect(o.rows[0]!.whatsapp_opt_in_at).not.toBeNull();
  });
});

describe('checkout validation', () => {
  it('requires the Idempotency-Key header and order-updates consent', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
    const noKey = await app.inject({
      method: 'POST',
      url: '/api/v1/checkout/create-order',
      headers: fromBrowser(),
      payload: { items: [{ productId: p.id, quantity: 1 }] },
    });
    expect(noKey.statusCode).toBe(400);
    const res = await placeOrder(app, [], {
      body: {
        items: [{ productId: p.id, quantity: 1 }],
        customer: { fullName: 'A B', phone: uniquePhone() },
        shippingAddress: { line1: '1 Road', city: 'Kullu', state: 'HP', pincode: '175101' },
        consent: { orderUpdates: false, whatsappOptIn: false },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('5 attempts per phone per 10 min (architecture/02 §9)', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 50 });
    const phone = uniquePhone();
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push((await placeOrder(app, [{ productId: p.id, quantity: 1 }], { phone })).statusCode);
    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('pincode locality auto-fill', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/shipping/pincode/175101/locality' });
    expect(r.json().data).toEqual({ pincode: '175101', city: 'Kullu', state: 'Himachal Pradesh' });
    const unknown = await app.inject({ method: 'GET', url: '/api/v1/shipping/pincode/110001/locality' });
    expect(unknown.json().data).toEqual({ pincode: '110001', city: null, state: null });
  });
});

describe('POST /checkout/abandon', () => {
  it('releases the jars only for the key holder, and never once a payment is in', async () => {
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 3 });
    const key = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const co = (await placeOrder(app, [{ productId: p.id, quantity: 2 }], { key })).json().data;
    const abandon = (k: string, code = co.orderCode) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/checkout/abandon',
        headers: fromBrowser({ 'idempotency-key': k }),
        payload: { orderCode: code },
      });
    expect((await abandon('1f8fad5b-d9cb-469f-a165-70867728950e')).statusCode).toBe(404);
    const res = await abandon(key);
    expect(res.json().data).toEqual({ orderCode: co.orderCode, released: true });
    expect(await batchStock(t.db, p.batchId!)).toBe(3);
    expect((await statusLog(t.db, (await orderRow(t.db, co.orderCode)).id)).at(-1)).toMatchObject({
      to_status: 'EXPIRED',
      reason: 'ABANDONED_BY_CUSTOMER',
    });

    const key2 = '2f8fad5b-d9cb-469f-a165-70867728950e';
    const co2 = (await placeOrder(app, [{ productId: p.id, quantity: 1 }], { key: key2 })).json().data;
    await payAtGateway(gateway, co2.razorpayOrderId); // paid, webhook not here yet
    expect((await abandon(key2, co2.orderCode)).json().data.released).toBe(false);
    expect((await orderRow(t.db, co2.orderCode)).status).toBe('PENDING_PAYMENT');
  });
});
