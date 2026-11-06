import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { hashToken } from '../../src/modules/auth/auth.tokens';
import { createStaff } from '../helpers/factories';
import { jarFrom, staffLogin } from '../helpers/session';
import { buildTestApp, fromBrowser, testAuthConfig } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Audit 2026-11-03 M-8 / R-12: ADMIN sessions end after ADMIN_IDLE_TIMEOUT_MIN without a refresh. */
const IDLE_MIN = 20;
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
  app = await buildTestApp({ db: t.db, redis }, { auth: testAuthConfig({ adminIdleTimeoutMin: IDLE_MIN }) });
});
beforeEach(() => redis.flushdb());
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const refresh = (pk_rt: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: fromBrowser(), cookies: { pk_rt } });

/** Pretend the token was issued `minutes` ago (= the last refresh / activity was that long ago). */
const ageToken = (raw: string, minutes: number) =>
  t.db.query(`UPDATE refresh_tokens SET created_at = NOW() - make_interval(mins => $2) WHERE token_hash = $1`, [
    hashToken(raw),
    minutes,
  ]);

const familyOf = async (raw: string) =>
  (
    await t.db.query<{ family_id: string }>('SELECT family_id FROM refresh_tokens WHERE token_hash = $1', [
      hashToken(raw),
    ])
  ).rows[0]!.family_id;

const openTokens = async (familyId: string) =>
  Number(
    (
      await t.db.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL',
        [familyId],
      )
    ).rows[0]!.n,
  );

describe('ADMIN idle session timeout', () => {
  it('a refresh inside the window works and rotates as usual', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { jar } = await staffLogin(app, admin.email, admin.password);
    await ageToken(jar.pk_rt!, IDLE_MIN - 1);
    const res = await refresh(jar.pk_rt!);
    expect(res.statusCode).toBe(200);
    const next = jarFrom(res);
    expect(next.pk_rt).toBeDefined();
    expect(next.pk_rt).not.toBe(jar.pk_rt);
    expect(next.pk_at).toBeDefined();
    // the fresh token starts a new idle window
    expect((await refresh(next.pk_rt!)).statusCode).toBe(200);
  });

  it('a refresh after the window → 401 idle_timeout, cookies cleared, family revoked, audited; old cookie stays dead', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { jar } = await staffLogin(app, admin.email, admin.password);
    const family = await familyOf(jar.pk_rt!);
    await ageToken(jar.pk_rt!, IDLE_MIN + 1);

    const res = await refresh(jar.pk_rt!);
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'UNAUTHENTICATED', details: { reason: 'idle_timeout' } });
    expect(jarFrom(res, { ...jar })).toEqual({}); // both cookies cleared
    expect(await openTokens(family)).toBe(0);

    const audit = await t.db.query<{ entity_id: string; after: Record<string, unknown> }>(
      'SELECT entity_id, after FROM admin_audit_log WHERE action = $1 AND actor_id = $2',
      ['SESSION_IDLE_TIMEOUT', admin.id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]).toMatchObject({ entity_id: family, after: { revokedTokens: 1, idleTimeoutMin: IDLE_MIN } });
    expect(audit.rows[0]!.after.tokenAgeSec).toBeGreaterThanOrEqual((IDLE_MIN + 1) * 60 - 5);

    // Presenting the same cookie again is still refused (no new session can be minted from it)
    const again = await refresh(jar.pk_rt!);
    expect(again.statusCode).toBe(401);
    expect(jarFrom(again).pk_rt).toBeUndefined();
    expect(await openTokens(family)).toBe(0);
    // Signing in again works — the lockout is per session, not per account
    expect((await staffLogin(app, admin.email, admin.password)).res.statusCode).toBe(200);
  });

  it('KITCHEN_PARTNER and CUSTOMER sessions are not affected (offline packing desk)', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    const { jar } = await staffLogin(app, partner.email, partner.password);
    await ageToken(jar.pk_rt!, IDLE_MIN * 10);
    const res = await refresh(jar.pk_rt!);
    expect(res.statusCode).toBe(200);
    expect(jarFrom(res).pk_rt).not.toBe(jar.pk_rt);
    const idle = await t.db.query('SELECT 1 FROM admin_audit_log WHERE action = $1 AND actor_id = $2', [
      'SESSION_IDLE_TIMEOUT',
      partner.id,
    ]);
    expect(idle.rowCount).toBe(0);
  });

  it('keeps the D-48 two-tab race grace for admins', async () => {
    const admin = await createStaff(t.db, { role: 'ADMIN' });
    const { jar } = await staffLogin(app, admin.email, admin.password);
    const winner = jarFrom(await refresh(jar.pk_rt!)).pk_rt!;
    const loser = await refresh(jar.pk_rt!);
    expect(loser.statusCode).toBe(401);
    expect(loser.json().error.details).toEqual({ reason: 'race' });
    expect((await refresh(winner)).statusCode).toBe(200);
  });
});
