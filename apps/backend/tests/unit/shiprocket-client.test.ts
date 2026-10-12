import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { createShiprocketClient, ShiprocketError } from '../../src/integrations/shiprocket/client';
import { parseShiprocketTime, shiprocketOrderDate } from '../../src/integrations/shiprocket/time';
import { toJobError } from '../../src/jobs/runner';
import { PermanentJobError } from '../../src/jobs/errors';
import { silentLogger } from '../helpers/test-logger';

/** Phase 6 §6.13: the real client against recorded (sanitized) fixtures via an injected fetch — no network. */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/shiprocket', `${name}.json`), 'utf8'));

/** Just enough of ioredis for the token cache + lock. */
function memoryRedis() {
  const m = new Map<string, string>();
  return {
    store: m,
    async get(k: string) {
      return m.get(k) ?? null;
    },
    async set(k: string, v: string, ...args: unknown[]) {
      if (args.includes('NX') && m.has(k)) return null;
      m.set(k, v);
      return 'OK';
    },
    async del(...keys: string[]) {
      keys.forEach((k) => m.delete(k));
      return keys.length;
    },
  };
}

type Route =
  { status?: number; body: unknown } | ((req: { url: URL; init: RequestInit }) => { status?: number; body: unknown });

function fakeShiprocket(routes: Record<string, Route | Route[]>) {
  const seen: { method: string; path: string; auth: string | null; body: unknown }[] = [];
  const fetchImpl = (async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v1\/external\//, '');
    const key = `${init.method ?? 'GET'} ${path}`;
    seen.push({
      method: init.method ?? 'GET',
      path,
      auth: (init.headers as Record<string, string> | undefined)?.authorization ?? null,
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    let route = routes[key];
    if (Array.isArray(route)) route = route.length > 1 ? route.shift()! : route[0]!;
    if (!route) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    const r = typeof route === 'function' ? route({ url, init }) : route;
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const client = (routes: Record<string, Route | Route[]>, redis = memoryRedis()) => {
  const fake = fakeShiprocket({ 'POST auth/login': { body: fixture('login') }, ...routes });
  return {
    ...fake,
    redis,
    api: createShiprocketClient({
      email: 'api-user@example.com',
      password: 'secret-pass',
      redis: redis as unknown as Redis,
      logger: silentLogger(),
      fetchImpl: fake.fetchImpl,
    }),
  };
};

describe('Shiprocket client — fixtures', () => {
  it('logs in once, caches the token (TTL 9 d) and sends it as Bearer', async () => {
    const c = client({ 'GET account/details/wallet-balance': { body: fixture('wallet') } });
    await expect(c.api.getWalletBalancePaise()).resolves.toBe(123_456);
    await c.api.getWalletBalancePaise();
    expect(c.seen.filter((s) => s.path === 'auth/login')).toHaveLength(1);
    expect(c.seen.at(-1)!.auth).toMatch(/^Bearer eyJ/);
    expect(c.redis.store.get('pk:shiprocket:token')).toMatch(/^eyJ/);
  });

  it('401 → one forced re-login and retry', async () => {
    const c = client({
      'GET account/details/wallet-balance': [
        { status: 401, body: { message: 'Token has expired' } },
        { body: fixture('wallet') },
      ],
    });
    await c.redis.set('pk:shiprocket:token', 'stale-token');
    await expect(c.api.getWalletBalancePaise()).resolves.toBe(123_456);
    expect(c.seen.map((s) => s.path)).toEqual([
      'account/details/wallet-balance',
      'auth/login',
      'account/details/wallet-balance',
    ]);
  });

  it('serviceability: rupees → paise, coerced numbers; 404 = no courier', async () => {
    const c = client({ 'GET courier/serviceability/': { body: fixture('serviceability') } });
    const options = await c.api.checkServiceability({
      pickupPincode: '175101',
      deliveryPincode: '110001',
      weightKg: 0.5,
    });
    expect(options).toEqual([
      {
        courierId: 10,
        courierName: 'Delhivery Surface',
        ratePaise: 6250,
        rating: 4.4,
        etdDays: 5,
        etd: 'Oct 17, 2026',
      },
      {
        courierId: 33,
        courierName: 'Xpressbees Surface',
        ratePaise: 4800,
        rating: 3.2,
        etdDays: 8,
        etd: 'Oct 20, 2026',
      },
    ]);
    const q = new URL(`http://x/?${c.seen.at(-1)!.path}`);
    expect(q).toBeTruthy();
    const none = client({
      'GET courier/serviceability/': { status: 404, body: { status: 404, message: 'no courier' } },
    });
    await expect(
      none.api.checkServiceability({ pickupPincode: '175101', deliveryPincode: '999999', weightKg: 0.5 }),
    ).resolves.toEqual([]);
  });

  it('create order / AWB / label / pickup / manifest / track parse the documented shapes', async () => {
    const c = client({
      'POST orders/create/adhoc': { body: fixture('create-order') },
      'POST courier/assign/awb': { body: fixture('assign-awb') },
      'POST courier/generate/label': { body: fixture('label') },
      'POST courier/generate/pickup': { body: fixture('pickup') },
      'POST manifests/generate': { body: fixture('manifest') },
      'GET courier/track/awb/19041424751540': { body: fixture('track') },
    });
    await expect(c.api.createOrder({} as never)).resolves.toEqual({
      shiprocketOrderId: '281248157',
      shipmentId: '280652512',
    });
    await expect(c.api.assignAwb('280652512', 10)).resolves.toEqual({
      awb: '19041424751540',
      courierName: 'Delhivery Surface',
    });
    expect(c.seen.at(-1)!.body).toEqual({ shipment_id: '280652512', courier_id: 10 });
    await expect(c.api.generateLabel(['280652512'])).resolves.toEqual({ labelUrl: expect.stringMatching(/\.pdf$/) });
    await expect(c.api.generatePickup(['280652512'], '2026-10-13')).resolves.toEqual({
      pickupToken: 'Reference No: 194_BIGFOOT 1966840_11122022',
      scheduledDate: '2026-10-13 10:00:00',
    });
    expect(c.seen.at(-1)!.body).toEqual({ shipment_id: ['280652512'], pickup_date: ['2026-10-13'] });
    await expect(c.api.generateManifest(['280652512'])).resolves.toEqual({
      manifestUrl: expect.stringMatching(/\.pdf$/),
    });
    const track = await c.api.trackByAwb('19041424751540');
    expect(track.chargedWeightG).toBe(750);
    expect(track.activities[0]).toEqual({
      date: '2026-10-16 13:40:00',
      statusText: 'DELIVERED',
      statusId: 7,
      location: 'Kullu_Bus_Stand (Himachal Pradesh)',
    });
    // Unlabelled scan falls back to the activity text
    expect(track.activities[3]).toMatchObject({ statusText: 'Manifested - Manifest uploaded', statusId: null });
  });

  it('error classes: 5xx / 429 / network retryable; 4xx and a failed AWB assignment distinguish', async () => {
    const c = client({
      'POST orders/create/adhoc': [
        { status: 503, body: {} },
        { status: 429, body: {} },
        { status: 422, body: { message: 'Invalid pincode' } },
      ],
      'POST courier/assign/awb': { body: fixture('assign-awb-failed') },
    });
    await expect(c.api.createOrder({} as never)).rejects.toMatchObject({ status: 503, retryable: true });
    await expect(c.api.createOrder({} as never)).rejects.toMatchObject({ status: 429, retryable: true });
    await expect(c.api.createOrder({} as never)).rejects.toMatchObject({
      status: 422,
      retryable: false,
      message: expect.stringContaining('Invalid pincode'),
    });
    await expect(c.api.assignAwb('1', 10)).rejects.toThrow(/Insufficient wallet balance/);

    const down = createShiprocketClient({
      email: 'a@b.in',
      password: 'secret-pass',
      redis: memoryRedis() as unknown as Redis,
      logger: silentLogger(),
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(down.getWalletBalancePaise()).rejects.toMatchObject({ retryable: true, status: null });
  });

  it('runner: non-retryable errors become UnrecoverableError (fail at once), retryable pass through', () => {
    expect(toJobError(new ShiprocketError('x', 422, false))).toMatchObject({ name: 'UnrecoverableError' });
    expect(toJobError(new PermanentJobError('no pickup name'))).toMatchObject({ name: 'UnrecoverableError' });
    const retry = new ShiprocketError('x', 503, true);
    expect(toJobError(retry)).toBe(retry);
  });
});

describe('Shiprocket time formats (IST wall clock)', () => {
  it('parses webhook DD MM YYYY and scan YYYY-MM-DD forms as IST', () => {
    expect(parseShiprocketTime('14 10 2026 11:43:52')?.toISOString()).toBe('2026-10-14T06:13:52.000Z');
    expect(parseShiprocketTime('2026-10-16 13:40:00')?.toISOString()).toBe('2026-10-16T08:10:00.000Z');
    expect(parseShiprocketTime('2026-10-16T13:40:00+05:30')?.toISOString()).toBe('2026-10-16T08:10:00.000Z');
    expect(parseShiprocketTime('garbage')).toBeNull();
    expect(parseShiprocketTime('')).toBeNull();
    expect(shiprocketOrderDate(new Date('2026-10-12T06:00:00Z'))).toBe('2026-10-12 11:30');
  });
});
