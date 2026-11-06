import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Migration 0009_waitlist (audit 2026-11-03 R-5). Up/down round-trip runs in the CI migrations job. */
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.destroy());

const insert = (phone: string | null, email: string | null, source = 'coming-soon') =>
  t.db.query<{ id: string; updated_at: Date }>(
    `INSERT INTO waitlist_entries (phone, email, source, consent_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING RETURNING id, updated_at`,
    [phone, email, source],
  );

describe('migration 0009_waitlist', () => {
  it('needs a phone or an e-mail, and only the two known sources', async () => {
    await expect(insert(null, null)).rejects.toMatchObject({ constraint: 'waitlist_contact_required' });
    await expect(insert('+919800000001', null, 'newsletter')).rejects.toMatchObject({ code: '23514' });
  });

  it('phone and e-mail are each unique (partial indexes) and a duplicate is a silent no-op', async () => {
    expect((await insert('+919800000002', null)).rowCount).toBe(1);
    expect((await insert('+919800000002', 'other@example.com')).rowCount).toBe(0);
    expect((await insert(null, 'dup@example.com')).rowCount).toBe(1);
    expect((await insert('+919800000003', 'dup@example.com')).rowCount).toBe(0);
    // several rows may have no phone / no e-mail — NULLs do not collide
    expect((await insert(null, 'a@example.com')).rowCount).toBe(1);
    expect((await insert(null, 'b@example.com')).rowCount).toBe(1);
  });

  it('updated_at trigger fires', async () => {
    const row = (await insert('+919800000004', null)).rows[0]!;
    await new Promise((r) => setTimeout(r, 10));
    const upd = await t.db.query<{ updated_at: Date }>(
      "UPDATE waitlist_entries SET name = 'Asha' WHERE id = $1 RETURNING updated_at",
      [row.id],
    );
    expect(upd.rows[0]!.updated_at.getTime()).toBeGreaterThan(row.updated_at.getTime());
  });
});
