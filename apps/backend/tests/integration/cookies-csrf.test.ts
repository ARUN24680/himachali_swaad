import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { buildTestApp, fromBrowser, testAuthConfig } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let prodLike: FastifyInstance;
const auth = testAuthConfig({
  cookies: { domain: '.pahadikhatki.in', secure: true, accessTtlSec: 900, refreshTtlSec: 30 * 24 * 3600 },
});

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
  prodLike = await buildTestApp({ db: t.db, redis }, { auth });
});
beforeEach(() => redis.flushdb());
afterAll(async () => {
  await prodLike.close();
  await redis.quit();
  await t.destroy();
});

describe('session cookies (production config)', () => {
  it('are HttpOnly; Secure; SameSite=Lax; Domain=.pahadikhatki.in with the right paths and lifetimes', async () => {
    const phone = '+919700000201';
    await prodLike.inject({ method: 'POST', url: '/api/v1/auth/otp/send', headers: fromBrowser(), payload: { phone } });
    const res = await prodLike.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      headers: fromBrowser(),
      payload: { phone, otp: auth.otpProvider.lastCodeFor(phone) },
    });
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const at = raw.find((c) => c.startsWith('pk_at='))!;
    const rt = raw.find((c) => c.startsWith('pk_rt='))!;

    for (const c of [at, rt]) {
      expect(c).toMatch(/; HttpOnly/);
      expect(c).toMatch(/; Secure/);
      expect(c).toMatch(/; SameSite=Lax/);
      expect(c).toMatch(/; Domain=\.pahadikhatki\.in/);
    }
    expect(at).toMatch(/; Path=\/(;|$)/);
    expect(at).toMatch(/; Max-Age=900/);
    expect(rt).toMatch(/; Path=\/api\/v1\/auth/);
    expect(rt).toMatch(/; Max-Age=2592000/);
  });
});

describe('CSRF origin check (D-20)', () => {
  const post = (headers: Record<string, string>) =>
    prodLike.inject({ method: 'POST', url: '/api/v1/auth/otp/send', headers, payload: { phone: '+919700000202' } });

  it('blocks a mutating request from a foreign origin', async () => {
    const res = await post({ origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'FORBIDDEN', message: 'Request origin not allowed.' });
  });

  it('blocks a mutating request with no Origin header', async () => {
    expect((await post({})).statusCode).toBe(403);
  });

  it('allows an allowed origin, and never checks GET or webhooks', async () => {
    expect((await post(fromBrowser())).statusCode).toBe(200);
    expect((await prodLike.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    // No Origin: the CSRF guard must not reject it — the webhook's own signature check does (400, not 403)
    const webhook = await prodLike.inject({ method: 'POST', url: '/api/v1/webhooks/razorpay', payload: {} });
    expect(webhook.statusCode).toBe(400);
    expect(webhook.json().error.code).toBe('INVALID_SIGNATURE');
  });
});
