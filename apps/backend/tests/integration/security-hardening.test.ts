import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { currentTotp, LOGIN_MAX_FAILURES } from '../../src/modules/auth/auth.service';
import { createBullJobQueue } from '../../src/jobs/queues';
import { QUEUE_DASHBOARD_PATH } from '../../src/plugins/queue-dashboard';
import { assignPickupLocation, createPickupLocation, createStaff } from '../helpers/factories';
import { jarFrom, staffLogin } from '../helpers/session';
import { buildTestApp, fromBrowser, testAuthConfig, TEST_ORIGIN } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Phase 10 §10.1: ADMIN 2FA mandatory, login lockout, security headers, strict CORS. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let bull: ReturnType<typeof createBullJobQueue>;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  bull = createBullJobQueue(new Redis(inject('redisUrl'), { maxRetriesPerRequest: null }));
  app = await buildTestApp(
    { db: t.db, redis },
    { auth: testAuthConfig({ adminTotpRequired: true }), production: true, queueDashboard: bull },
  );
});
afterAll(async () => {
  await app.close();
  await bull.close();
  await redis.quit();
  await t.destroy();
});

const get = (url: string, jar: Record<string, string>) =>
  app.inject({ method: 'GET', url, headers: fromBrowser(), cookies: jar });

describe('ADMIN TOTP mandatory (D-19, §10.1)', () => {
  it('admin without 2FA: admin API refused with TOTP_ENROLLMENT_REQUIRED; enrolling issues an mfa session that works', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { jar } = await staffLogin(app, admin.email, admin.password);
    const blocked = await get('/api/v1/admin/dashboard', jar);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.details).toEqual({ reason: 'TOTP_ENROLLMENT_REQUIRED' });
    expect((await get('/api/v1/admin/settings', jar)).statusCode).toBe(403);
    expect((await get('/api/v1/auth/me', jar)).statusCode).toBe(200); // can still see who they are

    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/2fa/setup',
      headers: fromBrowser(),
      cookies: jar,
    });
    expect(setup.statusCode).toBe(200);
    const secret = new URL(setup.json().data.otpauthUrl).searchParams.get('secret')!;
    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/2fa/verify',
      headers: fromBrowser(),
      cookies: jar,
      payload: { code: currentTotp(secret) },
    });
    expect(verify.json().data).toEqual({ enabled: true });
    const before = jar.pk_at;
    const upgraded = jarFrom(verify, { ...jar });
    expect(upgraded.pk_at).not.toBe(before);
    expect((await get('/api/v1/admin/dashboard', upgraded)).statusCode).toBe(200);
    // Next sign-in needs the code and lands with mfa straight away
    const next = await staffLogin(app, admin.email, admin.password, currentTotp(secret));
    expect((await get('/api/v1/admin/dashboard', next.jar)).statusCode).toBe(200);
  });

  it('KITCHEN_PARTNER is not affected', async () => {
    const kitchen = await createPickupLocation(t.db);
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    await assignPickupLocation(t.db, partner.id, kitchen.id);
    const { jar } = await staffLogin(app, partner.email, partner.password);
    expect((await get('/api/v1/partner/orders', jar)).statusCode).toBe(200);
  });
});

describe('staff login lockout (§10.1)', () => {
  it(`${LOGIN_MAX_FAILURES} wrong passwords lock the e-mail for 15 min — even the right password gets 429`, async () => {
    const staff = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      expect((await staffLogin(app, staff.email, 'wrong-password-123')).res.statusCode).toBe(401);
    }
    const locked = await staffLogin(app, staff.email, staff.password);
    expect(locked.res.statusCode).toBe(429);
    expect(locked.res.json().error.details.retryAfterSeconds).toBeGreaterThan(800);
    // Another account is unaffected; a success resets the counter
    const other = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    await staffLogin(app, other.email, 'wrong-password-123');
    expect((await staffLogin(app, other.email, other.password)).res.statusCode).toBe(200);
  });
});

describe('headers + CORS (§10.1)', () => {
  it('API: strict CSP, HSTS preload, nosniff, no framing, referrer policy', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    expect(res.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('bull-board: still ADMIN-only; its CSP allows only its own assets and the admin origin as framer', async () => {
    const anon = await app.inject({ method: 'GET', url: `${QUEUE_DASHBOARD_PATH}/` });
    expect(anon.statusCode).toBe(401);
    expect(anon.headers['content-security-policy']).toContain(`frame-ancestors ${TEST_ORIGIN}`);
    expect(anon.headers['x-frame-options']).toBeUndefined();
  });

  it('CORS: only allow-listed origins get credentials', async () => {
    const ok = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/products',
      headers: { origin: TEST_ORIGIN, 'access-control-request-method': 'GET' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/products',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
