import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../src/config/db';
import type { Services } from '../../src/services';
import { basicAuth, createTestApp, createTestDb, testEnv, truncateAll } from '../helpers/test-env';

let db: Db;
let destroy: () => Promise<void>;
let app: FastifyInstance;
let svc: Services;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  ({ app, svc } = await createTestApp(db));
});
afterAll(async () => {
  await app.close();
  await destroy();
});
beforeEach(() => truncateAll(db));

const createOrder = (amount = 49_999, receipt = 'PK-7KQ2M9', auth = basicAuth()) =>
  app.inject({
    method: 'POST',
    url: '/v1/orders',
    headers: { authorization: auth, 'content-type': 'application/json' },
    payload: { amount, currency: 'INR', receipt, notes: { order_code: receipt }, payment_capture: 1 },
  });

describe('Razorpay-compatible /v1 API', () => {
  it('requires the store key (wrong secret, wrong id, no header → 401 in Razorpay error shape)', async () => {
    for (const auth of [basicAuth(undefined, 'x'.repeat(40)), basicAuth('upi_test_zzzzzzzz99'), '']) {
      const res = await createOrder(49_999, 'PK-7KQ2M9', auth);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('creates an order shaped like Razorpay, with a payable amount 0–99 paise below the total', async () => {
    const res = await createOrder();
    expect(res.statusCode).toBe(200);
    const o = res.json();
    expect(o).toMatchObject({
      entity: 'order',
      amount: 49_999,
      currency: 'INR',
      receipt: 'PK-7KQ2M9',
      status: 'created',
    });
    expect(o.id).toMatch(/^order_[A-Za-z0-9]{16}$/);
    const row = await svc.gateway.getOrder(o.id);
    expect(row.payable_paise).toBeLessThanOrEqual(49_999);
    expect(row.payable_paise).toBeGreaterThanOrEqual(49_900);
  });

  it('100 concurrent orders for the same total get 100 different payable amounts; the 101st is refused', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => createOrder(49_999, `PK-AAAA${String(i).padStart(2, '0')}`)),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const payables = await db.query<{ payable_paise: number }>(`SELECT payable_paise FROM upi_orders`);
    expect(new Set(payables.rows.map((r) => r.payable_paise)).size).toBe(100);
    const extra = await createOrder(49_999, 'PK-BBBBBB');
    expect(extra.statusCode).toBe(409);
    expect(extra.json().error.code).toBe('AMOUNTS_EXHAUSTED');
  });

  it('validates input and never leaks internals', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { authorization: basicAuth(), 'content-type': 'application/json' },
      payload: { amount: 10.5, currency: 'USD', receipt: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST_ERROR');
    const missing = await app.inject({
      method: 'GET',
      url: '/v1/payments/pay_doesnotexist0000',
      headers: { authorization: basicAuth() },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('uses the store reservation end from notes (bounded), plus the late grace for the hold', async () => {
    const expires = new Date(Date.now() + 12 * 60_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { authorization: basicAuth(), 'content-type': 'application/json' },
      payload: { amount: 30_000, currency: 'INR', receipt: 'PK-CCCCCC', notes: { reservation_expires_at: expires } },
    });
    const row = await svc.gateway.getOrder(res.json().id);
    expect(row.expires_at.toISOString()).toBe(expires);
    expect(row.hold_until.getTime() - row.expires_at.getTime()).toBe(30 * 60_000);
    // a far-future value is ignored (default hold)
    const far = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { authorization: basicAuth(), 'content-type': 'application/json' },
      payload: {
        amount: 30_000,
        currency: 'INR',
        receipt: 'PK-DDDDDD',
        notes: { reservation_expires_at: '2099-01-01T00:00:00Z' },
      },
    });
    const farRow = await svc.gateway.getOrder(far.json().id);
    expect(farRow.expires_at.getTime() - farRow.created_at.getTime()).toBeLessThan(16 * 60_000);
  });
});

describe('pay page API', () => {
  it('returns the view without PII, with a server-built return URL and a UPI intent for the exact amount', async () => {
    const o = (await createOrder(49_999)).json();
    const row = await svc.gateway.getOrder(o.id);
    const res = await app.inject({ method: 'GET', url: `/pay/api/orders/${o.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    // not production → no upgrade-insecure-requests (it would break http:// LAN testing)
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    const v = res.json().data;
    expect(v).toMatchObject({
      orderId: o.id,
      orderCode: 'PK-7KQ2M9',
      status: 'created',
      payablePaise: row.payable_paise,
    });
    expect(v.returnUrl).toBe('https://shop.example.in/order/PK-7KQ2M9');
    expect(v.upiUri).toContain('pa=pahadikhatki%40hdfcbank');
    expect(v.upiUri).toContain(
      `am=${Math.floor(row.payable_paise / 100)}.${String(row.payable_paise % 100).padStart(2, '0')}`,
    );
    expect(v.qrDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('unknown or malformed ids are a plain 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/pay/api/orders/order_AAAAAAAAAAAAAAAA' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pay/api/orders/../../etc' })).statusCode).toBe(404);
  });
});

describe('dev routes', () => {
  it('are not registered without PAYMENT_DEV_TOOLS', async () => {
    const { app: prodLike } = await createTestApp(db, testEnv({ PAYMENT_DEV_TOOLS: 'false' }));
    const res = await prodLike.inject({ method: 'POST', url: '/dev/alerts', payload: { amountPaise: 100 } });
    expect(res.statusCode).toBe(404);
    await prodLike.close();
  });
});
