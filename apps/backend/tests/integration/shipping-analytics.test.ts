import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import type { ServiceabilityProvider } from '../../src/integrations/shipping/serviceability';
import { buildTestApp, fromBrowser } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
const provider = {
  check: vi.fn<ServiceabilityProvider['check']>(async (pincode: string) =>
    pincode.startsWith('9')
      ? { serviceable: false, estimatedDays: null, courierHint: null }
      : { serviceable: true, estimatedDays: { min: 2, max: 4 }, courierHint: 'Delhivery' },
  ),
};
const capi = { enabled: true, send: vi.fn(async () => undefined) };

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  app = await buildTestApp({ db: t.db, redis }, { serviceability: provider, capi });
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const check = (pincode: string) =>
  app.inject({ method: 'POST', url: '/api/v1/shipping/check-pincode', headers: fromBrowser(), payload: { pincode } });

describe('POST /api/v1/shipping/check-pincode', () => {
  it('returns serviceability and caches it for 24 h per pincode', async () => {
    const first = await check('175101');
    expect(first.json().data).toEqual({
      pincode: '175101',
      serviceable: true,
      estimatedDays: { min: 2, max: 4 },
      courierHint: 'Delhivery',
    });
    await check('175101');
    expect(provider.check).toHaveBeenCalledTimes(1);
    const ttl = await redis.ttl('pk:pincode:175101');
    expect(ttl).toBeGreaterThan(24 * 3600 - 10);
  });

  it('reports not-serviceable pincodes and rejects malformed ones', async () => {
    expect((await check('900001')).json().data).toMatchObject({ serviceable: false, estimatedDays: null });
    expect((await check('012345')).statusCode).toBe(400);
    expect((await check('17510')).statusCode).toBe(400);
  });
});

describe('POST /api/v1/analytics/events (Meta CAPI relay)', () => {
  const event = {
    eventName: 'AddToCart',
    eventId: 'evt_1234567890',
    eventSourceUrl: 'http://localhost:3000/products/x',
    contentIds: ['CHK250'],
    valuePaise: 44_900,
    consent: true,
  };

  it('relays with the browser ids (fbp/fbc, UA, IP) and the same event id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      headers: fromBrowser({ cookie: '_fbp=fb.1.1.123; _fbc=fb.1.1.abc', 'user-agent': 'TestUA' }),
      payload: event,
    });
    expect(res.statusCode).toBe(202);
    expect(capi.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'AddToCart',
        eventId: 'evt_1234567890',
        userData: expect.objectContaining({ fbp: 'fb.1.1.123', fbc: 'fb.1.1.abc', clientUserAgent: 'TestUA' }),
        customData: expect.objectContaining({ value: 449, contentIds: ['CHK250'] }),
      }),
    );
  });

  it('refuses events without marketing consent and browser Purchase events', async () => {
    const post = (payload: object) =>
      app.inject({ method: 'POST', url: '/api/v1/analytics/events', headers: fromBrowser(), payload });
    expect((await post({ ...event, consent: false })).statusCode).toBe(400);
    expect((await post({ ...event, eventName: 'Purchase' })).statusCode).toBe(400);
  });
});
