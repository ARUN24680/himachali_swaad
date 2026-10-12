import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assignPickupLocation, createPickupLocation, createStaff } from '../helpers/factories';
import { type Jar, otpLogin, staffLogin } from '../helpers/session';
import { buildTestApp, testAuthConfig } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
const auth = testAuthConfig();
const jars: Record<'anonymous' | 'customer' | 'partner' | 'admin', Jar> = {
  anonymous: {},
  customer: {},
  partner: {},
  admin: {},
};
let ownKitchen: string;
let otherKitchen: string;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
  await redis.flushdb();
  app = await buildTestApp({ db: t.db, redis }, { auth });

  ownKitchen = (await createPickupLocation(t.db, { code: 'HP-KULLU-01' })).id;
  otherKitchen = (await createPickupLocation(t.db, { code: 'HP-MANALI-02', city: 'Manali' })).id;

  const admin = await createStaff(t.db, { role: 'ADMIN' });
  const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
  await assignPickupLocation(t.db, partner.id, ownKitchen);

  jars.admin = (await staffLogin(app, admin.email, admin.password)).jar;
  jars.partner = (await staffLogin(app, partner.email, partner.password)).jar;
  jars.customer = (await otpLogin(app, '+919700000301', (p) => auth.otpProvider.lastCodeFor(p))).jar;
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const get = (url: string, who: keyof typeof jars) => app.inject({ method: 'GET', url, cookies: jars[who] });

describe('RBAC matrix (Phase 2 §2.1, §2.5)', () => {
  it.each([
    ['anonymous', 401, 'UNAUTHENTICATED'],
    ['customer', 403, 'FORBIDDEN'],
    ['partner', 403, 'FORBIDDEN'],
    ['admin', 200, null],
  ] as const)('/api/v1/admin/settings as %s → %i', async (who, status, code) => {
    const res = await get('/api/v1/admin/settings', who);
    expect(res.statusCode).toBe(status);
    if (code) expect(res.json().error.code).toBe(code);
    else expect(res.json().data.settings.length).toBe(16); // 14 from 0001 + seller_details (0003) + partner_split_bp (0006)
  });

  it('kitchen partner sees only their own pickup location', async () => {
    expect((await get(`/api/v1/partner/pickup-locations/${ownKitchen}`, 'partner')).statusCode).toBe(200);
    const other = await get(`/api/v1/partner/pickup-locations/${otherKitchen}`, 'partner');
    expect(other.statusCode).toBe(403);
    expect(other.json().error.code).toBe('FORBIDDEN');
  });

  it('admin sees every pickup location; customers none', async () => {
    expect((await get(`/api/v1/partner/pickup-locations/${otherKitchen}`, 'admin')).statusCode).toBe(200);
    expect((await get(`/api/v1/partner/pickup-locations/${ownKitchen}`, 'customer')).statusCode).toBe(403);
    expect((await get(`/api/v1/partner/pickup-locations/${ownKitchen}`, 'anonymous')).statusCode).toBe(401);
  });

  it('GET /auth/me returns the masked user and partner locations', async () => {
    const partner = await get('/api/v1/auth/me', 'partner');
    expect(partner.json().data.pickupLocationIds).toEqual([ownKitchen]);
    const customer = await get('/api/v1/auth/me', 'customer');
    expect(customer.json().data.user).toMatchObject({ role: 'CUSTOMER', phoneMasked: '+91******0301' });
  });

  it('rejects a tampered access token', async () => {
    const [h, p, s] = jars.admin.pk_at!.split('.');
    const forged = JSON.parse(Buffer.from(p!, 'base64url').toString());
    forged.role = 'ADMIN';
    forged.sub = '00000000-0000-4000-8000-000000000000';
    const token = [h, Buffer.from(JSON.stringify(forged)).toString('base64url'), s].join('.');
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/settings', cookies: { pk_at: token } });
    expect(res.statusCode).toBe(401);
  });
});
