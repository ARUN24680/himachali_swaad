import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createStaff } from '../helpers/factories';
import { buildTestApp, fromBrowser } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Audit 2026-11-03 M-2: behind nginx every request's socket address is the proxy. Only with
 * `trustProxy: true` (env TRUST_PROXY=true, set by compose) does the per-IP limiter key on the
 * client address from X-Forwarded-For; otherwise all visitors share one bucket.
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance | undefined;

const PROXY = '172.18.0.2';
const LOGIN_LIMIT = 5; // auth.routes.ts: 5 / 15 min per IP + e-mail

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  await redis.flushdb();
});
afterAll(async () => {
  await redis.quit();
  await t.destroy();
});

/** Successful logins (so the per-account lockout never fires) — only the route limiter can say 429. */
const login = (a: FastifyInstance, staff: { email: string; password: string }, forwardedFor: string) =>
  a.inject({
    method: 'POST',
    url: '/api/v1/auth/staff/login',
    remoteAddress: PROXY,
    headers: fromBrowser({ 'x-forwarded-for': forwardedFor }),
    payload: { email: staff.email, password: staff.password },
  });

describe('per-route rate limit vs trustProxy (M-2)', () => {
  it('trustProxy: true — keys on X-Forwarded-For, so two forwarded clients each get their own budget', async () => {
    app = await buildTestApp({ db: t.db, redis }, { trustProxy: true });
    const staff = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    for (let i = 0; i < LOGIN_LIMIT; i++) expect((await login(app, staff, '203.0.113.10')).statusCode).toBe(200);
    const sixth = await login(app, staff, '203.0.113.10');
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('RATE_LIMITED');
    // A different client behind the same proxy is not affected
    expect((await login(app, staff, '203.0.113.11')).statusCode).toBe(200);
    // ...and a spoofed multi-hop header still keys on the leftmost (client) address
    expect((await login(app, staff, '203.0.113.11, 10.0.0.9')).statusCode).toBe(200);
  });

  it('trustProxy: false — the header is ignored and every forwarded client shares the proxy bucket', async () => {
    app = await buildTestApp({ db: t.db, redis }, { trustProxy: false });
    const staff = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    for (let i = 0; i < LOGIN_LIMIT; i++) expect((await login(app, staff, `203.0.113.${20 + i}`)).statusCode).toBe(200);
    const next = await login(app, staff, '203.0.113.99');
    expect(next.statusCode).toBe(429);
  });
});
