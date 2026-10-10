import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPickupLocation, createUser } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.destroy());

describe('migration 0001_foundation', () => {
  it('seeds the default settings', async () => {
    const { rows } = await t.db.query<{ key: string; value: unknown }>('SELECT key, value FROM settings ORDER BY key');
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(rows).toHaveLength(14);
    expect(settings.reservation_ttl_minutes).toBe(15);
    expect(settings.cod_enabled).toBe(false);
    expect(settings.min_remaining_shelf_days).toBe(45);
    expect(settings.free_shipping_threshold_paise).toBeNull();
  });

  it('rejects staff users without email + password (users_staff_login)', async () => {
    await expect(createUser(t.db, { role: 'ADMIN', passwordHash: null })).rejects.toMatchObject({
      code: '23514',
      constraint: 'users_staff_login',
    });
    await expect(createUser(t.db, { role: 'KITCHEN_PARTNER', email: null })).rejects.toMatchObject({
      constraint: 'users_staff_login',
    });
    await expect(createUser(t.db, { role: 'ADMIN' })).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('rejects malformed phone numbers', async () => {
    await expect(createUser(t.db, { phone: '9876543210' })).rejects.toMatchObject({ constraint: 'users_phone_format' });
  });

  it('keeps updated_at current via trigger', async () => {
    const user = await createUser(t.db);
    await t.db.query("UPDATE users SET updated_at = NOW() - INTERVAL '1 day' WHERE id = $1", [user.id]);
    await t.db.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, 'Renamed']);
    const { rows } = await t.db.query<{ fresh: boolean }>(
      "SELECT updated_at > NOW() - INTERVAL '1 minute' AS fresh FROM users WHERE id = $1",
      [user.id],
    );
    expect(rows[0]?.fresh).toBe(true);
  });

  it('makes admin_audit_log append-only', async () => {
    const actor = await createUser(t.db, { role: 'ADMIN' });
    const loc = await createPickupLocation(t.db);
    const { rows } = await t.db.query<{ id: string }>(
      `INSERT INTO admin_audit_log (actor_id, action, entity_type, entity_id, after)
       VALUES ($1, 'SETTING_UPDATE', 'pickup_location', $2, '{"x":1}') RETURNING id`,
      [actor.id, loc.id],
    );
    await expect(
      t.db.query('UPDATE admin_audit_log SET action = $2 WHERE id = $1', [rows[0]?.id, 'X']),
    ).rejects.toThrow(/append-only/);
    await expect(t.db.query('DELETE FROM admin_audit_log WHERE id = $1', [rows[0]?.id])).rejects.toThrow(/append-only/);
  });
});
