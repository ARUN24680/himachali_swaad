import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { catalogActors, cookieHeader } from '../helpers/catalog';
import { nextIp } from '../helpers/checkout';
import { buildTestApp, fromBrowser } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Audit 2026-11-03 R-5: public waitlist join (5 / 10 min per IP), ADMIN list + CSV export. */
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
beforeEach(() => redis.flushdb());
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const join = (payload: object, ip = nextIp()) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/waitlist',
    remoteAddress: ip,
    headers: fromBrowser({ 'user-agent': 'x'.repeat(400) }),
    payload,
  });

const adminGet = (url: string, jar = actors.adminJar) =>
  app.inject({ method: 'GET', url, headers: fromBrowser({ cookie: cookieHeader(jar) }) });

const rowFor = (where: string, value: string) =>
  t.db.query<{
    phone: string | null;
    email: string | null;
    name: string | null;
    ip_hash: string | null;
    user_agent: string;
  }>(`SELECT phone, email, name, ip_hash, user_agent FROM waitlist_entries WHERE ${where} = $1`, [value]);

describe('POST /waitlist (public)', () => {
  it('joins by phone — 10 digits are normalised to E.164, IP is stored as a hash, user-agent truncated', async () => {
    const res = await join({ phone: '98765 43210', name: ' Asha ', consent: true }, '203.0.113.7');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ joined: true, alreadyJoined: false });
    const { rows } = await rowFor('phone', '+919876543210');
    expect(rows[0]).toMatchObject({ phone: '+919876543210', email: null, name: 'Asha' });
    expect(rows[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.ip_hash).not.toContain('203.0.113.7');
    expect(rows[0]!.user_agent).toHaveLength(300);
  });

  it('joins by e-mail only (lower-cased), source defaults to coming-soon', async () => {
    const res = await join({ email: 'Pickle.Fan@Example.com', consent: true });
    expect(res.json().data).toEqual({ joined: true, alreadyJoined: false });
    const { rows } = await t.db.query<{ source: string; phone: string | null }>(
      'SELECT source, phone FROM waitlist_entries WHERE email = $1',
      ['pickle.fan@example.com'],
    );
    expect(rows[0]).toEqual({ source: 'coming-soon', phone: null });
  });

  it('a phone or e-mail already on the list → 200 alreadyJoined (never an error, no enumeration by status)', async () => {
    expect((await join({ phone: '+919876500001', consent: true })).json().data.alreadyJoined).toBe(false);
    const again = await join({ phone: '9876500001', email: 'new@example.com', consent: true });
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toEqual({ joined: true, alreadyJoined: true });
    expect((await join({ email: 'pickle.fan@example.com', consent: true })).json().data.alreadyJoined).toBe(true);
    const { rows } = await t.db.query('SELECT 1 FROM waitlist_entries WHERE email = $1', ['new@example.com']);
    expect(rows).toHaveLength(0); // the duplicate attempt did not create a second row
  });

  it('400 when neither phone nor e-mail is given, when consent is missing, or the phone is not an Indian mobile', async () => {
    for (const bad of [
      { consent: true },
      { phone: '', email: '  ', consent: true },
      { phone: '9876543299' },
      { phone: '9876543299', consent: false },
      { phone: '12345', consent: true },
      { email: 'not-an-email', consent: true },
      { phone: '9876543299', consent: true, source: 'newsletter' },
    ]) {
      const res = await join(bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('is CSRF-protected like every mutation: no / foreign Origin → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/waitlist',
      headers: { origin: 'https://evil.example' },
      payload: { phone: '9876543298', consent: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rate limit: the 6th call from one IP within 10 min → 429 with retry-after; another IP is unaffected', async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      expect((await join({ email: `rl-${i}@example.com`, consent: true }, ip)).statusCode).toBe(200);
    }
    const sixth = await join({ email: 'rl-6@example.com', consent: true }, ip);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('RATE_LIMITED');
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
    expect((await join({ email: 'rl-7@example.com', consent: true }, nextIp())).statusCode).toBe(200);
  });
});

describe('GET /admin/waitlist (ADMIN)', () => {
  beforeAll(async () => {
    await t.db.query('DELETE FROM waitlist_entries');
    // 30 entries, oldest first so "newest first" is testable; mix of sources
    for (let i = 0; i < 30; i++) {
      await t.db.query(
        `INSERT INTO waitlist_entries (phone, email, name, source, consent_at, created_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW() - make_interval(mins => $5))`,
        [
          i % 3 === 0 ? null : `+9198000001${String(i).padStart(2, '0')}`,
          i % 3 === 1 ? null : `person${i}@example.com`,
          i % 5 === 0 ? `Name ${i}` : null,
          i % 4 === 0 ? 'storefront' : 'coming-soon',
          30 - i,
        ],
      );
    }
  });

  it('requires ADMIN: anonymous → 401, KITCHEN_PARTNER → 403', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/waitlist' })).statusCode).toBe(401);
    const partner = await adminGet('/api/v1/admin/waitlist', actors.partnerJar);
    expect(partner.statusCode).toBe(403);
    expect((await adminGet('/api/v1/admin/waitlist/export.csv', actors.partnerJar)).statusCode).toBe(403);
  });

  it('lists newest first with pagination + total, phone / e-mail in full', async () => {
    const page1 = await adminGet('/api/v1/admin/waitlist?pageSize=10');
    expect(page1.statusCode).toBe(200);
    const d = page1.json().data;
    expect(d).toMatchObject({ total: 30, page: 1, pageSize: 10 });
    expect(d.entries).toHaveLength(10);
    expect(d.entries[0]).toMatchObject({
      phone: '+919800000129',
      email: 'person29@example.com',
      source: 'coming-soon',
    });
    expect(d.entries[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const page3 = (await adminGet('/api/v1/admin/waitlist?pageSize=10&page=3')).json().data;
    expect(page3.entries).toHaveLength(10);
    expect(page3.entries[9].email).toBe('person0@example.com');
    expect((await adminGet('/api/v1/admin/waitlist?pageSize=10&page=4')).json().data.entries).toEqual([]);
    expect((await adminGet('/api/v1/admin/waitlist?pageSize=500')).statusCode).toBe(400);
  });

  it('search is a contains match on phone or e-mail; LIKE wildcards are literal; source filter', async () => {
    // phones are +9198000001NN; "00012" hits NN = 20…29 (minus the e-mail-only rows 21, 24, 27), newest first
    const byPhone = (await adminGet('/api/v1/admin/waitlist?q=00012')).json().data;
    expect(byPhone.entries.map((e: { phone: string }) => e.phone)).toEqual(
      [29, 28, 26, 25, 23, 22, 20].map((n) => `+9198000001${n}`),
    );
    const byEmail = (await adminGet('/api/v1/admin/waitlist?q=person2%40')).json().data;
    expect(byEmail.total).toBe(1);
    expect(byEmail.entries[0].email).toBe('person2@example.com');
    expect((await adminGet('/api/v1/admin/waitlist?q=%25')).json().data.total).toBe(0);
    const storefront = (await adminGet('/api/v1/admin/waitlist?source=storefront')).json().data;
    expect(storefront.total).toBe(8);
    expect(storefront.entries.every((e: { source: string }) => e.source === 'storefront')).toBe(true);
  });

  it('CSV export: attachment headers, BOM, header row + one line per entry, audited EXPORT (pii)', async () => {
    // A visitor-supplied name is untrusted: formula prefixes must be neutralised (exports.service csvCell)
    await t.db.query(
      `INSERT INTO waitlist_entries (email, name, source, consent_at) VALUES ('evil@example.com', '=HYPERLINK("x")', 'storefront', NOW())`,
    );
    const res = await adminGet('/api/v1/admin/waitlist/export.csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="pahadi-khatki-waitlist-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.startsWith('\uFEFF')).toBe(true);
    const lines = res.body.slice(1).split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('phone,email,name,source,consent_at_ist,joined_at_ist');
    expect(lines).toHaveLength(32);
    expect(lines[1]).toMatch(/^,person0@example.com,Name 0,storefront,\d{4}-\d{2}-\d{2} \d{2}:\d{2},/); // e-mail only
    // Phones start with "+", so they get the same apostrophe guard as every other admin CSV export
    expect(lines[2]).toMatch(/^'\+919800000101,,,coming-soon,/);
    expect(lines[31]).toMatch(/^,evil@example.com,"'=HYPERLINK\(""x""\)",storefront,/);
    const audit = await t.db.query('SELECT after FROM admin_audit_log WHERE action = $1 AND entity_id = $2', [
      'EXPORT',
      'waitlist',
    ]);
    expect(audit.rows[0]).toMatchObject({ after: { rows: 31, pii: true } });
  });
});
