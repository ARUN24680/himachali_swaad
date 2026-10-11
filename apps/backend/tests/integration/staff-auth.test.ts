import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { currentTotp } from '../../src/modules/auth/auth.service';
import { assignPickupLocation, createPickupLocation, createStaff } from '../helpers/factories';
import { jarFrom, otpLogin, staffLogin } from '../helpers/session';
import { buildTestApp, fromBrowser, testAuthConfig } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
const auth = testAuthConfig();

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

const auditRows = async (action: string, entityId?: string) =>
  (
    await t.db.query<{ actor_id: string | null; entity_id: string; after: Record<string, unknown> }>(
      `SELECT actor_id, entity_id, after FROM admin_audit_log WHERE action = $1 ${entityId ? 'AND entity_id = $2' : ''} ORDER BY id`,
      entityId ? [action, entityId] : [action],
    )
  ).rows;

describe('POST /auth/staff/login', () => {
  it('logs staff in, returns no PII beyond the session user, and audits success', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { res, jar } = await staffLogin(app, admin.email, admin.password);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toMatchObject({ id: admin.id, role: 'ADMIN', totpEnabled: false });
    expect(jar.pk_at && jar.pk_rt).toBeTruthy();
    expect(await auditRows('STAFF_LOGIN_SUCCESS', admin.id)).toHaveLength(1);
  });

  it('uses one generic error for wrong password, unknown email and inactive staff — and audits each', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const inactive = await createStaff(t.db, { role: 'KITCHEN_PARTNER', isActive: false });
    const attempts = [
      await staffLogin(app, admin.email, 'wrong password!!'),
      await staffLogin(app, 'nobody@pahadikhatki.test', 'whatever-password'),
      await staffLogin(app, inactive.email, inactive.password),
    ];
    for (const { res, jar } of attempts) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toEqual({ code: 'UNAUTHENTICATED', message: 'Invalid email or password' });
      expect(jar.pk_at).toBeUndefined();
    }
    const failed = await auditRows('STAFF_LOGIN_FAILED');
    expect(failed.map((r) => r.after.reason)).toEqual(
      expect.arrayContaining(['bad_password', 'unknown_email', 'inactive']),
    );
    // The unknown email is stored only as a hash tag, never in clear text
    expect(JSON.stringify(failed)).not.toContain('nobody@pahadikhatki.test');
  });

  it('rate-limits 5 attempts per email + IP per 15 minutes', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    for (let i = 0; i < 5; i++) expect((await staffLogin(app, admin.email, 'nope-nope-nope')).res.statusCode).toBe(401);
    const sixth = await staffLogin(app, admin.email, admin.password);
    expect(sixth.res.statusCode).toBe(429);
    expect(sixth.res.json().error.code).toBe('RATE_LIMITED');
  });

  it('puts no phone or email in the JWT — only id, role and partner locations', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    await t.db.query(`UPDATE users SET phone = '+919811122233' WHERE id = $1`, [partner.id]);
    const loc = await createPickupLocation(t.db);
    await assignPickupLocation(t.db, partner.id, loc.id);

    const { jar } = await staffLogin(app, partner.email, partner.password);
    const claims = decodeJwt(jar.pk_at!);
    expect(claims).toMatchObject({ sub: partner.id, role: 'KITCHEN_PARTNER', locs: [loc.id] });
    const raw = JSON.stringify(claims);
    expect(raw).not.toContain(partner.email);
    expect(raw).not.toContain('9811122233');
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'locs', 'role', 'sub']);

    const { jar: customerJar } = await otpLogin(app, '+919700000001', (p) => auth.otpProvider.lastCodeFor(p));
    expect(JSON.stringify(decodeJwt(customerJar.pk_at!))).not.toContain('9700000001');
  });
});

describe('ADMIN TOTP 2FA', () => {
  it('enrolls, then requires the code at login', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { jar } = await staffLogin(app, admin.email, admin.password);

    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/2fa/setup',
      headers: fromBrowser(),
      cookies: jar,
    });
    const url = new URL(setup.json().data.otpauthUrl);
    const secret = url.searchParams.get('secret')!;
    expect(url.protocol).toBe('otpauth:');

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/2fa/verify',
      headers: fromBrowser(),
      cookies: jar,
      payload: { code: '000000' },
    });
    expect(bad.statusCode).toBe(400);
    const good = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/2fa/verify',
      headers: fromBrowser(),
      cookies: jar,
      payload: { code: currentTotp(secret) },
    });
    expect(good.json().data).toEqual({ enabled: true });
    expect(await auditRows('TOTP_ENROLLED', admin.id)).toHaveLength(1);

    // Secret is encrypted at rest
    const { rows } = await t.db.query<{ totp_secret_enc: string }>('SELECT totp_secret_enc FROM users WHERE id = $1', [
      admin.id,
    ]);
    expect(rows[0]!.totp_secret_enc).toMatch(/^v1\./);
    expect(rows[0]!.totp_secret_enc).not.toContain(secret);

    expect((await staffLogin(app, admin.email, admin.password)).res.json().error.code).toBe('TOTP_REQUIRED');
    expect((await staffLogin(app, admin.email, admin.password, '000000')).res.statusCode).toBe(401);
    const ok = await staffLogin(app, admin.email, admin.password, currentTotp(secret));
    expect(ok.res.statusCode).toBe(200);
    expect(ok.res.json().data.user.totpEnabled).toBe(true);
  });

  it('is not available to kitchen partners', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    const { jar } = await staffLogin(app, partner.email, partner.password);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/2fa/setup',
      headers: fromBrowser(),
      cookies: jar,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /auth/staff/change-password', () => {
  it('needs the current password, revokes every old session and issues a fresh one', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    const other = await staffLogin(app, partner.email, partner.password); // e.g. another device
    const { jar } = await staffLogin(app, partner.email, partner.password);

    const wrongCurrent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/change-password',
      headers: fromBrowser(),
      cookies: jar,
      payload: { currentPassword: 'not-it', newPassword: 'a brand new long passphrase' },
    });
    expect(wrongCurrent.statusCode).toBe(401);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/change-password',
      headers: fromBrowser(),
      cookies: jar,
      payload: { currentPassword: partner.password, newPassword: 'a brand new long passphrase' },
    });
    expect(res.statusCode).toBe(200);
    expect(jarFrom(res).pk_rt).toBeTruthy();
    expect(await auditRows('PASSWORD_CHANGED', partner.id)).toHaveLength(1);

    const otherRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: fromBrowser(),
      cookies: { pk_rt: other.jar.pk_rt! },
    });
    expect(otherRefresh.statusCode).toBe(401);
    expect((await staffLogin(app, partner.email, partner.password)).res.statusCode).toBe(401);
    expect((await staffLogin(app, partner.email, 'a brand new long passphrase')).res.statusCode).toBe(200);
  });
});
