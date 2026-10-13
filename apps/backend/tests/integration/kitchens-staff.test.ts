import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { as, catalogActors } from '../helpers/catalog';
import { createStaff } from '../helpers/factories';
import { staffLogin } from '../helpers/session';
import { buildTestApp, fromBrowser } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Workflow gaps: kitchens editable from the admin console; admin password reset for staff. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let actors: Awaited<ReturnType<typeof catalogActors>>;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  app = await buildTestApp({ db: t.db, redis });
  actors = await catalogActors(app, t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const kitchen = (code: string, pickup: string | null = null) => ({
  code,
  name: 'Mandi Kitchen',
  contactName: 'Ramesh Thakur',
  contactPhone: '+919816000001',
  addressLine1: 'Near bus stand, Ward 4',
  city: 'Mandi',
  state: 'Himachal Pradesh',
  pincode: '175001',
  shiprocketPickupName: pickup,
  fssaiLicenseNo: null,
});
const audits = async (action: string, entityId: string) =>
  (
    await t.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM admin_audit_log WHERE action = $1 AND entity_id = $2',
      [action, entityId],
    )
  ).rows[0]!.n;

describe('/api/v1/admin/kitchens', () => {
  it('create → list → edit pickup name / FSSAI / deactivate, all audited; partner refused', async () => {
    const admin = as(app, actors.adminJar);
    const created = await admin.post('/api/v1/admin/kitchens', kitchen('hp-mandi-01'));
    expect(created.statusCode).toBe(201);
    const k = created.json().data;
    expect(k).toMatchObject({ code: 'HP-MANDI-01', isActive: true, partnerCount: 0, shiprocketPickupName: null });
    expect(await audits('KITCHEN_CREATE', k.id)).toBe(1);

    const list = (await admin.get('/api/v1/admin/kitchens')).json().data.kitchens;
    expect(list.map((x: { code: string }) => x.code)).toContain('HP-MANDI-01');
    const a = list.find((x: { id: string }) => x.id === actors.kitchenA.id);
    expect(a.partnerCount).toBe(1);

    const patched = await admin.patch(`/api/v1/admin/kitchens/${k.id}`, {
      shiprocketPickupName: 'Mandi Kitchen',
      fssaiLicenseNo: '12345678901234',
      isActive: false,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data).toMatchObject({
      shiprocketPickupName: 'Mandi Kitchen',
      fssaiLicenseNo: '12345678901234',
      isActive: false,
      name: 'Mandi Kitchen',
    });
    expect(await audits('KITCHEN_UPDATE', k.id)).toBe(1);

    expect((await as(app, actors.partnerJar).get('/api/v1/admin/kitchens')).statusCode).toBe(403);
  });

  it('duplicate code or Shiprocket pickup name → 409; bad FSSAI → 400', async () => {
    const admin = as(app, actors.adminJar);
    expect((await admin.post('/api/v1/admin/kitchens', kitchen('HP-SHIMLA-01', 'Shimla'))).statusCode).toBe(201);
    expect((await admin.post('/api/v1/admin/kitchens', kitchen('HP-SHIMLA-01'))).statusCode).toBe(409);
    expect((await admin.post('/api/v1/admin/kitchens', kitchen('HP-SHIMLA-02', 'Shimla'))).statusCode).toBe(409);
    const other = (await admin.post('/api/v1/admin/kitchens', kitchen('HP-SHIMLA-03'))).json().data;
    expect(
      (await admin.patch(`/api/v1/admin/kitchens/${other.id}`, { shiprocketPickupName: 'Shimla' })).statusCode,
    ).toBe(409);
    expect((await admin.patch(`/api/v1/admin/kitchens/${other.id}`, { fssaiLicenseNo: '123' })).statusCode).toBe(400);
  });
});

describe('POST /api/v1/admin/staff/:id/reset-password', () => {
  it('sets a temporary password, signs the person out, lifts a lockout, is audited', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    const old = await staffLogin(app, partner.email, partner.password);
    // Locked out (D-57 b) — the lock key the login path checks
    const tag = createHash('sha256').update(partner.email.toLowerCase()).digest('hex').slice(0, 12);
    await redis.set(`pk:login-lock:${tag}`, '1', 'EX', 900);
    const res = await as(app, actors.adminJar).post(`/api/v1/admin/staff/${partner.id}/reset-password`, {
      password: 'Temporary-Pass-2026',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.revokedSessions).toBeGreaterThanOrEqual(1);
    expect(await audits('STAFF_PASSWORD_RESET', partner.id)).toBe(1);

    // old session's refresh token is dead; new password works right away (lock lifted)
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: fromBrowser(),
      cookies: old.jar,
    });
    expect(refresh.statusCode).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/login',
      headers: fromBrowser(),
      payload: { email: partner.email, password: 'Temporary-Pass-2026' },
    });
    expect(login.statusCode).toBe(200);
    expect(await redis.exists(`pk:login-lock:${tag}`)).toBe(0);
  });

  it('short password → 400; own account → 400; partner caller → 403', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    const admin = as(app, actors.adminJar);
    expect(
      (await admin.post(`/api/v1/admin/staff/${partner.id}/reset-password`, { password: 'short' })).statusCode,
    ).toBe(400);
    expect(
      (await admin.post(`/api/v1/admin/staff/${actors.admin.id}/reset-password`, { password: 'Another-Long-Pass-1' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await as(app, actors.partnerJar).post(`/api/v1/admin/staff/${partner.id}/reset-password`, {
          password: 'Another-Long-Pass-1',
        })
      ).statusCode,
    ).toBe(403);
  });
});
