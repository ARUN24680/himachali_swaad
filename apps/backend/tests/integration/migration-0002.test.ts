import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPickupLocation, createProduct, insertBatchDirect } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.destroy());

describe('migration 0002_catalog_inventory', () => {
  it('allows incomplete drafts but blocks activating them (products_publishable, D-49)', async () => {
    const draft = await createProduct(t.db, { complete: false });
    await expect(t.db.query('UPDATE products SET is_active = TRUE WHERE id = $1', [draft.id])).rejects.toMatchObject({
      constraint: 'products_publishable',
    });
    const complete = await createProduct(t.db);
    await expect(t.db.query('UPDATE products SET is_active = TRUE WHERE id = $1', [complete.id])).rejects.toMatchObject(
      {
        constraint: 'products_publishable', // no image yet
      },
    );
    await t.db.query("UPDATE products SET images = '{products/x.webp}', is_active = TRUE WHERE id = $1", [complete.id]);
  });

  it('generates cost_per_unit_paise and enforces stock bounds', async () => {
    const p = await createProduct(t.db);
    const loc = await createPickupLocation(t.db);
    const { rows } = await t.db.query<{ id: string; cost_per_unit_paise: number }>(
      `INSERT INTO inventory_batches (product_id, pickup_location_id, batch_code, manufactured_at, expiry_date,
                                      initial_quantity, available_stock, total_cost_paise)
       VALUES ($1, $2, 'PK-2610-GEN-01', '2026-10-01', '2027-04-01', 3, 3, 1000) RETURNING id, cost_per_unit_paise`,
      [p.id, loc.id],
    );
    expect(rows[0]?.cost_per_unit_paise).toBe(333);
    await expect(
      t.db.query('UPDATE inventory_batches SET available_stock = -1 WHERE id = $1', [rows[0]?.id]),
    ).rejects.toMatchObject({ constraint: 'batches_stock_bounds' });
    await expect(
      t.db.query('UPDATE inventory_batches SET available_stock = 4 WHERE id = $1', [rows[0]?.id]),
    ).rejects.toMatchObject({ constraint: 'batches_stock_bounds' });
  });

  it('makes inventory_movements append-only', async () => {
    const p = await createProduct(t.db);
    const loc = await createPickupLocation(t.db);
    const batchId = await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: loc.id,
      quantity: 5,
      expiresInDays: 90,
    });
    await expect(
      t.db.query('UPDATE inventory_movements SET quantity_delta = 6 WHERE batch_id = $1', [batchId]),
    ).rejects.toThrow(/append-only/);
    await expect(t.db.query('DELETE FROM inventory_movements WHERE batch_id = $1', [batchId])).rejects.toThrow(
      /append-only/,
    );
  });

  it('ist_today() is the calendar day in India', async () => {
    const { rows } = await t.db.query<{ d: string; expected: string }>(
      "SELECT ist_today() AS d, to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS expected",
    );
    expect(rows[0]?.d).toBe(rows[0]?.expected);
  });
});
