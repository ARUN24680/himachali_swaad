import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { OTP_TTL_SEC } from '../../src/modules/auth/auth.service';
import { createStaff } from '../helpers/factories';
import { jarFrom } from '../helpers/session';
import { buildTestApp, fromBrowser, testAuthConfig } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
const auth = testAuthConfig();
const phone = () => `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const send = (p: string, ip = '10.1.0.1') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/send',
    headers: fromBrowser(),
    payload: { phone: p },
    remoteAddress: ip,
  });
const verify = (p: string, otp: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', headers: fromBrowser(), payload: { phone: p, otp } });
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
  app = await buildTestApp({ db: t.db, redis }, { auth });
});
beforeEach(() => redis.flushdb());
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

describe('POST /auth/otp/send + /verify', () => {
  it('logs a new phone in as CUSTOMER with httpOnly session cookies', async () => {
    const p = phone();
    expect((await send(p)).json().data).toEqual({ sent: true, resendAfterSec: 30 });
    const res = await verify(p, auth.otpProvider.lastCodeFor(p)!);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toMatchObject({ role: 'CUSTOMER', phoneMasked: `+91******${p.slice(-4)}` });
    expect(res.body).not.toContain(p);
    const jar = jarFrom(res);
    expect(jar.pk_at).toBeTruthy();
    expect(jar.pk_rt).toBeTruthy();
  });

  it('stores only a hash of the code, with a 5-minute TTL', async () => {
    const p = phone();
    await send(p);
    const code = auth.otpProvider.lastCodeFor(p)!;
    const stored = await redis.hgetall(`pk:otp:code:${p}`);
    expect(JSON.stringify(stored)).not.toContain(code);
    const ttl = await redis.ttl(`pk:otp:code:${p}`);
    expect(ttl).toBeGreaterThan(OTP_TTL_SEC - 5);
    expect(ttl).toBeLessThanOrEqual(OTP_TTL_SEC);
  });

  it('rejects an expired code', async () => {
    const p = phone();
    await send(p);
    await redis.del(`pk:otp:code:${p}`); // what Redis does when the 5-min TTL runs out
    const res = await verify(p, auth.otpProvider.lastCodeFor(p)!);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('OTP_INVALID');
  });

  it('invalidates the code after 5 wrong attempts — the 6th fails even with the right code', async () => {
    const p = phone();
    await send(p);
    const code = auth.otpProvider.lastCodeFor(p)!;
    for (let i = 0; i < 5; i++) expect((await verify(p, wrong(code))).json().error.code).toBe('OTP_INVALID');
    const sixth = await verify(p, code);
    expect(sixth.statusCode).toBe(400);
    expect(sixth.json().error.code).toBe('OTP_INVALID');
  });

  it('limits sends to 3 per phone per 10 minutes (4th → 429)', async () => {
    const p = phone();
    for (let i = 0; i < 3; i++) {
      await redis.del(`pk:otp:cooldown:${p}`); // skip the 30 s resend cooldown
      expect((await send(p)).statusCode).toBe(200);
    }
    await redis.del(`pk:otp:cooldown:${p}`);
    const fourth = await send(p);
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.code).toBe('RATE_LIMITED');
    expect(Number(fourth.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('enforces the 30-second resend cooldown', async () => {
    const p = phone();
    await send(p);
    expect((await send(p)).statusCode).toBe(429);
  });

  it('limits sends per IP (10 / 10 min)', async () => {
    for (let i = 0; i < 10; i++) expect((await send(phone(), '10.9.9.9')).statusCode).toBe(200);
    const eleventh = await send(phone(), '10.9.9.9');
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.code).toBe('RATE_LIMITED');
  });

  it('answers identically for registered and unknown phones (no enumeration)', async () => {
    const known = phone();
    await t.db.query(`INSERT INTO users (phone, role) VALUES ($1, 'CUSTOMER')`, [known]);
    const a = (await send(known)).json();
    const b = (await send(phone())).json();
    expect(a.data).toEqual(b.data);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it('never logs a staff account in through OTP', async () => {
    const staff = await createStaff(t.db, { role: 'ADMIN' });
    const p = phone();
    await t.db.query('UPDATE users SET phone = $2 WHERE id = $1', [staff.id, p]);
    await send(p);
    const res = await verify(p, auth.otpProvider.lastCodeFor(p)!);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(jarFrom(res).pk_at).toBeUndefined();
  });
});
