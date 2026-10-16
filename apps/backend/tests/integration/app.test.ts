import type { FastifyInstance } from 'fastify';
import { once } from 'node:events';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { createDb } from '../../src/config/db';
import { healthRoutes } from '../../src/modules/health/health.routes';
import { createHealthService } from '../../src/modules/health/health.service';
import { AppError } from '../../src/utils/app-error';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { buildTestApp, fakeReporter, fromBrowser } from '../helpers/test-app';
import { capturingLogger, silentLogger } from '../helpers/test-logger';

let t: TestDb;
let redis: Redis;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
});
afterAll(async () => {
  await redis.quit();
  await t.destroy();
});

async function appWith(overrides: Parameters<typeof buildTestApp>[1] = {}): Promise<FastifyInstance> {
  return buildTestApp({ db: t.db, redis }, overrides);
}

describe('health endpoints', () => {
  it('GET /healthz → 200 envelope', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { status: 'ok' }, error: null });
    await app.close();
  });

  it('GET /readyz → 200 when DB and Redis are up', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ ready: true, database: 'up', redis: 'up' });
    await app.close();
  });

  it('GET /readyz → 503 when the database is down', async () => {
    const deadDb = createDb(
      {
        connectionString: 'postgres://pk:pk@127.0.0.1:1/none',
        max: 1,
        slowQueryMs: 1000,
        applicationName: 'dead',
        ssl: false,
        connectionTimeoutMillis: 500,
      },
      silentLogger(),
    );
    const app = await appWith({ db: deadDb });
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', details: { database: 'down', redis: 'up' } },
    });
    await app.close();
    await deadDb.close();
  });

  it('GET /readyz → 503 when Redis is down', async () => {
    const deadRedis = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    const service = createHealthService({ db: t.db, redis: deadRedis });
    const app = await appWith();
    // Swap only the readiness dependency; the rate limiter keeps the healthy client
    await app.register(healthRoutes, { prefix: '/dead-redis', service });
    const res = await app.inject({ method: 'GET', url: '/dead-redis/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      details: { database: 'up', redis: 'down' },
    });
    await app.close();
    deadRedis.disconnect();
  });

  it('catalog and session checks return 503 promptly when Redis disconnects', async () => {
    const disconnected = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
    await disconnected.ping();
    const app = await appWith({ redis: disconnected });
    await app.ready();
    const ended = once(disconnected, 'end');
    disconnected.disconnect();
    await ended;
    try {
      for (const url of ['/api/v1/products', '/api/v1/auth/me']) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
      }
      expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  }, 5_000);
});

describe('envelope & errors', () => {
  it('sets x-request-id and echoes it in the envelope', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(res.json().requestId).toBe(id);

    const forwarded = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'edge-abc12345' },
    });
    expect(forwarded.headers['x-request-id']).toBe('edge-abc12345');
    const unsafe = await app.inject({ method: 'GET', url: '/healthz', headers: { 'x-request-id': '<script>' } });
    expect(unsafe.headers['x-request-id']).toMatch(/^req_/);
    await app.close();
  });

  it('unknown route → NOT_FOUND envelope', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, data: null, error: { code: 'NOT_FOUND' } });
    await app.close();
  });

  it('Zod validation failure → VALIDATION_ERROR with issues', async () => {
    const app = await appWith();
    app.post(
      '/test/validate',
      { schema: { body: z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/) }) } },
      async () => ({}),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/test/validate',
      payload: { pincode: '12' },
      headers: fromBrowser(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details.issues.length).toBeGreaterThan(0);
    await app.close();
  });

  it('AppError keeps its code and status', async () => {
    const app = await appWith();
    app.get('/test/stock', async () => {
      throw new AppError('OUT_OF_STOCK', 'Only 2 jars left', { available: 2 });
    });
    const res = await app.inject({ method: 'GET', url: '/test/stock' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({ code: 'OUT_OF_STOCK', message: 'Only 2 jars left', details: { available: 2 } });
    await app.close();
  });

  it('unknown error → INTERNAL_ERROR envelope, Sentry event, requestId in log, no stack leak', async () => {
    const reporter = fakeReporter();
    const { logger, lines } = capturingLogger();
    const app = await appWith({ reporter, logger });
    app.get('/test/boom', async () => {
      throw new Error('db password is hunter2');
    });

    const res = await app.inject({ method: 'GET', url: '/test/boom' });
    const body = res.json();
    expect(res.statusCode).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      details: { sentryEventId: 'evt_test_123' },
    });
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('at ');

    expect(reporter.capture).toHaveBeenCalledOnce();
    expect(reporter.capture.mock.calls[0]?.[1]).toMatchObject({ requestId: body.requestId, route: '/test/boom' });

    const errorLog = lines.find((l) => l.msg === 'unhandled error');
    expect(errorLog?.requestId).toBe(body.requestId);
    await app.close();
  });

  it('rate limit → RATE_LIMITED envelope with Retry-After', async () => {
    await redis.flushdb();
    const app = await appWith({ rateLimit: { max: 2, windowMs: 60_000 } });
    app.get('/test/limited', async (req) => ({ ok: req.id }));
    expect((await app.inject({ method: 'GET', url: '/test/limited' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/test/limited' })).statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: '/test/limited' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    await app.close();
  });

  it('logs never contain PII fields', async () => {
    const { logger, lines } = capturingLogger();
    logger.info({ phone: '+919876543210', customer: { email: 'a@b.in', address: 'x' } }, 'pii probe');
    const line = JSON.stringify(lines.find((l) => l.msg === 'pii probe'));
    expect(line).not.toContain('+919876543210');
    expect(line).not.toContain('a@b.in');
    expect(line).toContain('[REDACTED]');
  });
});
