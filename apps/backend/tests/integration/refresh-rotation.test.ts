import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { hashToken } from '../../src/modules/auth/auth.tokens';
import { createStaff } from '../helpers/factories';
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

const refresh = (pk_rt: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: fromBrowser(), cookies: { pk_rt } });

const tokenRow = async (raw: string) =>
  (
    await t.db.query<{ id: string; family_id: string; revoked_at: Date | null; replaced_by_id: string | null }>(
      'SELECT id, family_id, revoked_at, replaced_by_id FROM refresh_tokens WHERE token_hash = $1',
      [hashToken(raw)],
    )
  ).rows[0]!;

/** Pretend the rotation happened long ago (outside the concurrent-refresh grace window). */
const ageRotation = (raw: string) =>
  t.db.query(`UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL '1 minute' WHERE token_hash = $1`, [
    hashToken(raw),
  ]);

describe('refresh token rotation (D-20)', () => {
  it('rotates: new token in the same family, old one revoked and linked', async () => {
    const { jar } = await otpLogin(app, '+919700000101', (p) => auth.otpProvider.lastCodeFor(p));
    const first = jar.pk_rt!;
    const res = await refresh(first);
    expect(res.statusCode).toBe(200);
    const second = jarFrom(res).pk_rt!;
    expect(second).not.toBe(first);

    const oldRow = await tokenRow(first);
    const newRow = await tokenRow(second);
    expect(oldRow.revoked_at).not.toBeNull();
    expect(oldRow.replaced_by_id).toBe(newRow.id);
    expect(newRow.family_id).toBe(oldRow.family_id);
    expect(newRow.revoked_at).toBeNull();
  });

  it('reuse of a rotated token revokes the whole family, returns 401 and is audited', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { jar } = await staffLogin(app, admin.email, admin.password);
    const stolen = jar.pk_rt!;
    const legit = jarFrom(await refresh(stolen)).pk_rt!;
    await ageRotation(stolen);

    const replay = await refresh(stolen);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error).toMatchObject({ code: 'UNAUTHENTICATED', details: { reason: 'reuse' } });
    expect(jarFrom(replay).pk_rt).toBeUndefined();

    const reuseAudits = () =>
      t.db.query('SELECT 1 FROM admin_audit_log WHERE action = $1 AND actor_id = $2', [
        'TOKEN_REUSE_DETECTED',
        admin.id,
      ]);
    expect((await reuseAudits()).rowCount).toBe(1);

    // The legitimate holder's newer token is dead too (and presenting it is itself recorded)
    expect((await refresh(legit)).statusCode).toBe(401);
    const { rows } = await t.db.query<{ open: string }>(
      'SELECT count(*)::text AS open FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL',
      [(await tokenRow(stolen)).family_id],
    );
    expect(rows[0]!.open).toBe('0');

    expect((await reuseAudits()).rowCount).toBe(2);
  });

  it('treats a near-simultaneous second refresh (two tabs) as a race, not theft', async () => {
    const { jar } = await otpLogin(app, '+919700000102', (p) => auth.otpProvider.lastCodeFor(p));
    const shared = jar.pk_rt!;
    const winner = jarFrom(await refresh(shared)).pk_rt!;
    const loser = await refresh(shared);
    expect(loser.statusCode).toBe(401);
    expect(loser.json().error.details).toEqual({ reason: 'race' });
    expect((await refresh(winner)).statusCode).toBe(200); // family still alive
  });

  it('rejects unknown and expired refresh tokens', async () => {
    expect((await refresh('not-a-real-token')).statusCode).toBe(401);
    const { jar } = await otpLogin(app, '+919700000103', (p) => auth.otpProvider.lastCodeFor(p));
    await t.db.query(`UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1`, [
      hashToken(jar.pk_rt!),
    ]);
    const res = await refresh(jar.pk_rt!);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.details).toEqual({ reason: 'expired' });
  });
});

describe('logout', () => {
  it('logout revokes the current family and clears both cookies', async () => {
    const { jar } = await otpLogin(app, '+919700000104', (p) => auth.otpProvider.lastCodeFor(p));
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: fromBrowser(), cookies: jar });
    expect(res.statusCode).toBe(200);
    expect(jarFrom(res, { ...jar })).toEqual({});
    expect((await refresh(jar.pk_rt!)).statusCode).toBe(401);
  });

  it('logout-all revokes every session of the user and is audited', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const a = await staffLogin(app, admin.email, admin.password);
    const b = await staffLogin(app, admin.email, admin.password);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: fromBrowser(),
      cookies: a.jar,
    });
    expect(res.statusCode).toBe(200);
    expect((await refresh(b.jar.pk_rt!)).statusCode).toBe(401);
    const audit = await t.db.query('SELECT after FROM admin_audit_log WHERE action = $1 AND actor_id = $2', [
      'LOGOUT_ALL',
      admin.id,
    ]);
    expect(audit.rows[0]).toMatchObject({ after: { revokedTokens: 2 } });
  });
});
