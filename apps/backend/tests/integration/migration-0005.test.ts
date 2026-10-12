import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Migration 0005_notifications (Phase 7 §7.1). Up/down round-trip runs in the CI migrations job. */
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.destroy());

describe('migration 0005_notifications', () => {
  it('push endpoints are unique and go away with the user', async () => {
    const u = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    const add = () =>
      t.db.query(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.example/1', 'p', 'a')",
        [u.id],
      );
    await add();
    await expect(add()).rejects.toMatchObject({ code: '23505' });
    await t.db.query('DELETE FROM users WHERE id = $1', [u.id]);
    const left = await t.db.query("SELECT 1 FROM push_subscriptions WHERE endpoint = 'https://push.example/1'");
    expect(left.rowCount).toBe(0);
  });

  it('notifications_log: enum channel/status, QUEUED default, unique provider message id, updated_at trigger', async () => {
    const ins = (id: string | null, channel = 'WHATSAPP') =>
      t.db.query(
        `INSERT INTO notifications_log (channel, recipient, template, provider_message_id)
         VALUES ($1::notification_channel, '+919800000000', 'order_confirmed', $2) RETURNING id, status, updated_at`,
        [channel, id],
      );
    const row = (await ins('wamid.1')).rows[0]!;
    expect(row.status).toBe('QUEUED');
    await expect(ins('wamid.1')).rejects.toMatchObject({ code: '23505' });
    await expect(ins(null, 'PIGEON')).rejects.toMatchObject({ code: '22P02' });
    await new Promise((r) => setTimeout(r, 10));
    const upd = await t.db.query(
      "UPDATE notifications_log SET status = 'DELIVERED' WHERE id = $1 RETURNING updated_at",
      [row.id],
    );
    expect(upd.rows[0]!.updated_at.getTime()).toBeGreaterThan(row.updated_at.getTime());
  });
});
