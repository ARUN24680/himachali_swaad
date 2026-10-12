import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPickupLocation } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Migration 0004_logistics (Phase 6 §6.1). Up/down round-trip runs in the CI migrations job. */
let t: TestDb;
let orderId: string;
beforeAll(async () => {
  t = await createTestDb();
  const kitchen = await createPickupLocation(t.db);
  const { rows } = await t.db.query(
    `INSERT INTO orders (order_code, idempotency_key, customer_name, customer_phone, shipping_address,
                         pickup_location_id, subtotal_paise, shipping_fee_paise, total_paise, reservation_expires_at)
     VALUES ('PK-7KQ2M9', gen_random_uuid()::text, 'A', '+919812345678', '{}', $1, 100, 0, 100, NOW()) RETURNING id`,
    [kitchen.id],
  );
  orderId = rows[0]!.id;
});
afterAll(() => t.destroy());

describe('migration 0004_logistics', () => {
  it('one shipment per order, unique AWB; tracking events dedup on (shipment, status, time)', async () => {
    const s = await t.db.query("INSERT INTO shipments (order_id, awb_code) VALUES ($1, 'AWB1') RETURNING id", [
      orderId,
    ]);
    await expect(t.db.query('INSERT INTO shipments (order_id) VALUES ($1)', [orderId])).rejects.toMatchObject({
      code: '23505',
    });
    const id = s.rows[0]!.id;
    const ev = (text: string) =>
      t.db.query(
        `INSERT INTO tracking_events (shipment_id, status_text, event_time, source) VALUES ($1, $2, '2026-10-12T05:00:00Z', 'WEBHOOK')
         ON CONFLICT ON CONSTRAINT uq_tracking_event DO NOTHING`,
        [id, text],
      );
    expect((await ev('IN TRANSIT')).rowCount).toBe(1);
    expect((await ev('IN TRANSIT')).rowCount).toBe(0);
    await expect(
      t.db.query(
        "INSERT INTO tracking_events (shipment_id, status_text, event_time, source) VALUES ($1, 'X', NOW(), 'EMAIL')",
        [id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    // Orders with a shipment can't be deleted out from under it
    await expect(t.db.query('DELETE FROM orders WHERE id = $1', [orderId])).rejects.toMatchObject({ code: '23503' });
  });

  it('updated_at trigger + the Phase 6 courier settings exist', async () => {
    const before = await t.db.query('SELECT updated_at FROM shipments WHERE order_id = $1', [orderId]);
    await new Promise((r) => setTimeout(r, 10));
    await t.db.query("UPDATE shipments SET last_error = 'x' WHERE order_id = $1", [orderId]);
    const after = await t.db.query('SELECT updated_at FROM shipments WHERE order_id = $1', [orderId]);
    expect(after.rows[0]!.updated_at.getTime()).toBeGreaterThan(before.rows[0]!.updated_at.getTime());
    const settings = await t.db.query(
      "SELECT key FROM settings WHERE key IN ('min_courier_rating','max_courier_etd_days','pickup_cutoff_hour_ist','shiprocket_wallet_min_paise') ORDER BY key",
    );
    expect(settings.rowCount).toBe(4);
  });
});
