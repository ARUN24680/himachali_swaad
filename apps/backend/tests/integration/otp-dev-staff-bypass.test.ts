import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import { createTokenService } from '../../src/modules/auth/auth.tokens';
import { as, cookieHeader } from '../helpers/catalog';
import { liveProduct, orderRow, payAtGateway, placeOrder, verify } from '../helpers/checkout';
import { assignPickupLocation, createPickupLocation, createStaff } from '../helpers/factories';
import { confirmedOrder } from '../helpers/logistics';
import { jarFrom, staffLogin, type Jar } from '../helpers/session';
import { buildTestApp, fromBrowser, TEST_JWT_SECRET, testAuthConfig, testGateway } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { capturingLogger } from '../helpers/test-logger';

/**
 * Dev-only OTP_DEV_STAFF_BYPASS_PHONES (D-57 i): a listed KITCHEN_PARTNER phone signs in through the
 * customer OTP flow and gets a full CUSTOMER session on the storefront. All numbers are fake.
 */
const BYPASS_PHONE = '+919000000101';
const OTHER_STAFF_PHONE = '+919000000102';
const BYPASS_ADMIN_PHONE = '+919000000103';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let prodApp: FastifyInstance;
let gateway: MockPaymentGateway;
let kitchenId: string;
let partner: { id: string; email: string; password: string };
let otherPartner: { id: string; email: string; password: string };
const auth = testAuthConfig({ otpDevStaffBypassPhones: [BYPASS_PHONE, BYPASS_ADMIN_PHONE] });
const prodAuth = testAuthConfig({ otpDevStaffBypassPhones: [] }); // what config/auth.ts passes in production
const { logger, lines } = capturingLogger();

const sendOtp = (a: FastifyInstance, p: string) =>
  a.inject({ method: 'POST', url: '/api/v1/auth/otp/send', headers: fromBrowser(), payload: { phone: p } });
const verifyOtp = (a: FastifyInstance, p: string, otp: string) =>
  a.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', headers: fromBrowser(), payload: { phone: p, otp } });
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

async function bypassLogin(): Promise<Jar> {
  await redis.del(`pk:otp:cooldown:${BYPASS_PHONE}`, `pk:otp:sends:${BYPASS_PHONE}`);
  await sendOtp(app, BYPASS_PHONE);
  const res = await verifyOtp(app, BYPASS_PHONE, auth.otpProvider.lastCodeFor(BYPASS_PHONE)!);
  expect(res.statusCode).toBe(200);
  return jarFrom(res);
}

async function staffWithPhone(role: 'ADMIN' | 'KITCHEN_PARTNER', phone: string) {
  const s = await createStaff(t.db, { role });
  await t.db.query('UPDATE users SET phone = $2 WHERE id = $1', [s.id, phone]);
  return s;
}

const del = (jar: Jar, url: string) =>
  app.inject({ method: 'DELETE', url, headers: fromBrowser({ cookie: cookieHeader(jar) }) });

const address = {
  label: 'Home',
  fullName: 'Dev Tester',
  phone: BYPASS_PHONE,
  line1: '12 Mall Road',
  city: 'Kullu',
  state: 'Himachal Pradesh',
  pincode: '175101',
};

/** Every customer-only endpoint answers 403 to a non-customer session. */
async function expectNoCustomerAccess(jar: Jar, orderCode: string) {
  expect((await as(app, jar).get('/api/v1/me/orders')).statusCode).toBe(403);
  expect((await as(app, jar).get(`/api/v1/me/orders/${orderCode}`)).statusCode).toBe(403);
  expect((await as(app, jar).get('/api/v1/me/addresses')).statusCode).toBe(403);
  expect((await as(app, jar).post('/api/v1/me/addresses', address)).statusCode).toBe(403);
  expect((await as(app, jar).post(`/api/v1/orders/${orderCode}/cancel`, { reason: 'Not mine' })).statusCode).toBe(403);
}

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
  await redis.flushdb();
  gateway = testGateway(redis);
  app = await buildTestApp({ db: t.db, redis }, { auth, logger, gateway });
  prodApp = await buildTestApp({ db: t.db, redis }, { auth: prodAuth, gateway });
  kitchenId = (await createPickupLocation(t.db)).id;
  partner = await staffWithPhone('KITCHEN_PARTNER', BYPASS_PHONE);
  await assignPickupLocation(t.db, partner.id, kitchenId);
  otherPartner = await staffWithPhone('KITCHEN_PARTNER', OTHER_STAFF_PHONE);
  await staffWithPhone('ADMIN', BYPASS_ADMIN_PHONE);
});
afterAll(async () => {
  await app.close();
  await prodApp.close();
  await redis.quit();
  await t.destroy();
});

describe('OTP dev staff bypass — sign-in', () => {
  it('listed KITCHEN_PARTNER + correct OTP → CUSTOMER session, warning logged (masked), DB role untouched', async () => {
    await redis.flushdb();
    await sendOtp(app, BYPASS_PHONE);
    const res = await verifyOtp(app, BYPASS_PHONE, auth.otpProvider.lastCodeFor(BYPASS_PHONE)!);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toMatchObject({ id: partner.id, role: 'CUSTOMER' });
    const jar = jarFrom(res);
    expect(jar.pk_at).toBeTruthy();

    const me = await as(app, jar).get('/api/v1/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ user: { id: partner.id, role: 'CUSTOMER' }, pickupLocationIds: [] });

    const warn = lines.find((l) => String(l.msg).includes('DEV OTP staff bypass'));
    expect(warn).toMatchObject({ level: 40, userId: partner.id, phoneMasked: '+91******0101' });
    expect(JSON.stringify(lines)).not.toContain(BYPASS_PHONE);

    const { rows } = await t.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [partner.id]);
    expect(rows[0]!.role).toBe('KITCHEN_PARTNER');
  });

  it('listed phone + wrong OTP → still OTP_INVALID, no session', async () => {
    await redis.flushdb();
    await sendOtp(app, BYPASS_PHONE);
    const res = await verifyOtp(app, BYPASS_PHONE, wrong(auth.otpProvider.lastCodeFor(BYPASS_PHONE)!));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(jarFrom(res).pk_at).toBeUndefined();
  });

  it('another staff phone not in the list → still OTP_INVALID', async () => {
    await sendOtp(app, OTHER_STAFF_PHONE);
    const res = await verifyOtp(app, OTHER_STAFF_PHONE, auth.otpProvider.lastCodeFor(OTHER_STAFF_PHONE)!);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('OTP_INVALID');
  });

  it('never lets an ADMIN through, even when listed (would skip password + TOTP)', async () => {
    await sendOtp(app, BYPASS_ADMIN_PHONE);
    const res = await verifyOtp(app, BYPASS_ADMIN_PHONE, auth.otpProvider.lastCodeFor(BYPASS_ADMIN_PHONE)!);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('OTP_INVALID');
  });
});

describe('OTP dev staff bypass — full customer on the storefront', () => {
  it('My Orders shows earlier guest orders (phone match) and orders placed while signed in (user_id linked)', async () => {
    const guest = await confirmedOrder(app, t.db, gateway, kitchenId, 1, { phone: BYPASS_PHONE });
    const jar = await bypassLogin();

    const p = await liveProduct(t.db, kitchenId, { stock: 5 });
    const placed = await placeOrder(app, [{ productId: p.id, quantity: 1 }], { jar });
    expect(placed.statusCode).toBe(201);
    const { verifyBody } = await payAtGateway(gateway, placed.json().data.razorpayOrderId);
    expect((await verify(app, verifyBody)).statusCode).toBe(200);
    const signedIn = await orderRow(t.db, placed.json().data.orderCode);
    expect(signedIn.user_id).toBe(partner.id);

    const list = await as(app, jar).get('/api/v1/me/orders?page=1&pageSize=10');
    expect(list.statusCode).toBe(200);
    const codes = list.json().data.orders.map((o: { orderCode: string }) => o.orderCode);
    expect(codes).toEqual(expect.arrayContaining([guest.orderCode, signedIn.order_code]));

    const detail = await as(app, jar).get(`/api/v1/me/orders/${guest.orderCode}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data).toMatchObject({ orderCode: guest.orderCode, canCancel: true });
  });

  it('saved addresses CRUD', async () => {
    const jar = await bypassLogin();
    const created = await as(app, jar).post('/api/v1/me/addresses', address);
    expect(created.statusCode).toBe(201);
    const id = created.json().data.address.id;
    expect((await as(app, jar).get('/api/v1/me/addresses')).json().data.addresses).toHaveLength(1);
    const updated = await as(app, jar).patch(`/api/v1/me/addresses/${id}`, { landmark: 'Near temple' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.address.landmark).toBe('Near temple');
    expect((await del(jar, `/api/v1/me/addresses/${id}`)).statusCode).toBe(200);
    expect((await as(app, jar).get('/api/v1/me/addresses')).json().data.addresses).toHaveLength(0);
  });

  it('customer cancel of an own order', async () => {
    const o = await confirmedOrder(app, t.db, gateway, kitchenId, 1, { phone: BYPASS_PHONE });
    const jar = await bypassLogin();
    const res = await as(app, jar).post(`/api/v1/orders/${o.orderCode}/cancel`, { reason: 'Testing cancel' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ orderCode: o.orderCode, status: 'CANCELLED' });
  });

  it('survives refresh-token rotation as a CUSTOMER session; staff routes stay closed to it', async () => {
    const jar = await bypassLogin();
    expect(jar.pk_rt!.startsWith('dc.')).toBe(true);
    const refreshed = await as(app, jar).post('/api/v1/auth/refresh');
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data.user.role).toBe('CUSTOMER');
    const next = jarFrom(refreshed, { ...jar });
    expect(next.pk_rt).not.toBe(jar.pk_rt);
    expect(next.pk_rt!.startsWith('dc.')).toBe(true);
    expect((await as(app, next).get('/api/v1/me/orders')).statusCode).toBe(200);
    expect((await as(app, next).get('/api/v1/partner/pickup-locations')).statusCode).toBe(403);
  });

  it('ends the session on refresh once the phone leaves the bypass list', async () => {
    const jar = await bypassLogin();
    const offApp = await buildTestApp({ db: t.db, redis }, { auth: prodAuth, gateway });
    try {
      const refreshed = await as(offApp, jar).post('/api/v1/auth/refresh');
      expect(refreshed.statusCode).toBe(401);
      expect(refreshed.json().error.details).toMatchObject({ reason: 'inactive' });
    } finally {
      await offApp.close();
    }
  });
});

describe('OTP dev staff bypass — nobody else gains customer access', () => {
  it('the same user via the normal staff login keeps the partner desk and gets 403 on customer endpoints', async () => {
    const o = await confirmedOrder(app, t.db, gateway, kitchenId, 1, { phone: BYPASS_PHONE });
    const { res, jar } = await staffLogin(app, partner.email, partner.password);
    expect(res.json().data.user.role).toBe('KITCHEN_PARTNER');
    expect(jar.pk_rt!.startsWith('dc.')).toBe(false);
    expect((await as(app, jar).get('/api/v1/partner/pickup-locations')).statusCode).toBe(200);
    await expectNoCustomerAccess(jar, o.orderCode);

    // Rotation keeps it a plain partner session
    const next = jarFrom(await as(app, jar).post('/api/v1/auth/refresh'), { ...jar });
    expect((await as(app, next).get('/api/v1/auth/me')).json().data.user.role).toBe('KITCHEN_PARTNER');
    await expectNoCustomerAccess(next, o.orderCode);
  });

  it('another partner → 403 on customer endpoints', async () => {
    const o = await confirmedOrder(app, t.db, gateway, kitchenId, 1, { phone: OTHER_STAFF_PHONE });
    const { jar } = await staffLogin(app, otherPartner.email, otherPartner.password);
    await expectNoCustomerAccess(jar, o.orderCode);
  });

  it('production config (empty list): the OTP is refused and a dev-customer token is not honoured', async () => {
    await redis.flushdb();
    await sendOtp(prodApp, BYPASS_PHONE);
    const res = await verifyOtp(prodApp, BYPASS_PHONE, prodAuth.otpProvider.lastCodeFor(BYPASS_PHONE)!);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('OTP_INVALID');

    // Even a validly signed `dc` token (same secret) is rejected, never downgraded to staff access
    const tokens = createTokenService({ secret: TEST_JWT_SECRET, accessTtlSec: 900 });
    const forged = await tokens.signAccess({ userId: partner.id, role: 'KITCHEN_PARTNER', devCustomer: true });
    const jar = { pk_at: forged };
    expect((await as(prodApp, jar).get('/api/v1/me/orders')).statusCode).toBe(401);
    expect((await as(prodApp, jar).get('/api/v1/partner/pickup-locations')).statusCode).toBe(401);
  });
});
