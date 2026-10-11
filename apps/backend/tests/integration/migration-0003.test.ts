import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPickupLocation } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let kitchen: { id: string };
beforeAll(async () => {
  t = await createTestDb();
  kitchen = await createPickupLocation(t.db);
});
afterAll(() => t.destroy());

const insertOrder = (code: string, totals: { subtotal: number; shipping: number; total: number }) =>
  t.db.query(
    `INSERT INTO orders (order_code, idempotency_key, customer_name, customer_phone, shipping_address,
                         pickup_location_id, subtotal_paise, shipping_fee_paise, total_paise, reservation_expires_at)
     VALUES ($1, gen_random_uuid()::text, 'A', '+919812345678', '{}', $2, $3, $4, $5, NOW()) RETURNING id`,
    [code, kitchen.id, totals.subtotal, totals.shipping, totals.total],
  );

describe('migration 0003_orders_payments', () => {
  it('order_code is Crockford (D-27) and totals must add up', async () => {
    await expect(insertOrder('PK-ILOU12', { subtotal: 100, shipping: 0, total: 100 })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(insertOrder('PK-7KQ2M9', { subtotal: 100, shipping: 50, total: 100 })).rejects.toMatchObject({
      constraint: 'orders_total_math',
    });
    const ok = await insertOrder('PK-7KQ2M9', { subtotal: 100, shipping: 50, total: 150 });
    expect(ok.rowCount).toBe(1);
  });

  it('order_status_logs is append-only; movement.order_id references orders', async () => {
    const { rows } = await insertOrder('PK-7KQ2MA', { subtotal: 100, shipping: 0, total: 100 });
    const id = rows[0]!.id;
    await t.db.query(
      "INSERT INTO order_status_logs (order_id, to_status, actor_type) VALUES ($1, 'PENDING_PAYMENT', 'CUSTOMER')",
      [id],
    );
    await expect(t.db.query('DELETE FROM order_status_logs WHERE order_id = $1', [id])).rejects.toThrow();
    await expect(t.db.query("UPDATE order_status_logs SET reason = 'x' WHERE order_id = $1", [id])).rejects.toThrow();
    const fk = await t.db.query("SELECT 1 FROM pg_constraint WHERE conname = 'fk_movements_order'");
    expect(fk.rowCount).toBe(1);
  });

  it('one default address per user; refund keys fit refund:<uuid>:LATE_PAYMENT_STOCKOUT (D-52)', async () => {
    const u = await t.db.query("INSERT INTO users (phone, role) VALUES ('+919811111111', 'CUSTOMER') RETURNING id");
    const add = (isDefault: boolean) =>
      t.db.query(
        `INSERT INTO addresses (user_id, full_name, phone, line1, city, state, pincode, is_default)
         VALUES ($1, 'A', '+919811111111', 'x', 'Kullu', 'HP', '175101', $2)`,
        [u.rows[0]!.id, isDefault],
      );
    await add(true);
    await add(false);
    await expect(add(true)).rejects.toMatchObject({ code: '23505' });
    const len = await t.db.query(
      "SELECT character_maximum_length AS n FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'idempotency_key'",
    );
    expect(len.rows[0]!.n).toBeGreaterThanOrEqual(`refund:${'0'.repeat(36)}:LATE_PAYMENT_STOCKOUT`.length);
  });

  it('seeds seller_details as null until Q-02 closes', async () => {
    const { rows } = await t.db.query("SELECT value FROM settings WHERE key = 'seller_details'");
    expect(rows[0]!.value).toBeNull();
  });
});
