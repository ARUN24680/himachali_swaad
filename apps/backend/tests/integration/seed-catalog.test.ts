import { afterEach, beforeEach, expect, it } from 'vitest';
import { logCatalogDemoBatches } from '../../scripts/seed-catalog/demo-batches';
import { findLedgerMismatches } from '../../src/modules/inventory/inventory.repository';
import { createPickupLocation, createProduct, createStaff, insertBatchDirect } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
  await createStaff(t.db, { role: 'ADMIN' });
});
afterEach(async () => {
  await t?.destroy();
});

const batchesBySku = async () =>
  (
    await t.db.query<{ sku: string; n: number; stock: number; kitchens: string[] }>(
      `SELECT p.sku, COUNT(b.id)::int AS n, COALESCE(SUM(b.available_stock), 0)::int AS stock,
              COALESCE(ARRAY_AGG(DISTINCT b.pickup_location_id::text) FILTER (WHERE b.id IS NOT NULL), '{}') AS kitchens
         FROM products p LEFT JOIN inventory_batches b ON b.product_id = p.id GROUP BY p.sku ORDER BY p.sku`,
    )
  ).rows;

it('with several kitchens requires DEMO_KITCHEN_CODE, then logs per SKU at that kitchen and stays idempotent', async () => {
  const kitchenA = await createPickupLocation(t.db, { code: 'HP-A-01' });
  const kitchenB = await createPickupLocation(t.db, { code: 'HP-B-02' });
  await createProduct(t.db, { sku: 'CHK250' });
  await createProduct(t.db, { sku: 'MTN500' });
  // Another seed (e.g. pnpm db:demo:seed) already stocked an unrelated product — must not block this one.
  const other = await createProduct(t.db, { sku: 'DEMO-OTHER' });
  await insertBatchDirect(t.db, { productId: other.id, locationId: kitchenB.id, quantity: 7, expiresInDays: 200 });

  await expect(logCatalogDemoBatches(t.db, ['CHK250', 'MTN500'])).rejects.toThrow(
    /More than one active kitchen.*DEMO_KITCHEN_CODE[\s\S]*HP-A-01[\s\S]*HP-B-02/,
  );
  await expect(logCatalogDemoBatches(t.db, ['CHK250', 'MTN500'], { kitchenCode: 'NOPE' })).rejects.toThrow(
    /NOPE is not an active kitchen/,
  );
  expect((await batchesBySku()).filter((r) => r.n > 0).map((r) => r.sku)).toEqual(['DEMO-OTHER']);

  const first = await logCatalogDemoBatches(t.db, ['CHK250', 'MTN500'], { kitchenCode: 'HP-A-01' });
  expect(first).toEqual({
    kitchenCode: 'HP-A-01',
    logged: expect.arrayContaining(['CHK250', 'MTN500']),
    shelfExamples: true,
  });
  expect(await batchesBySku()).toEqual([
    { sku: 'CHK250', n: 3, stock: 48 + 12 + 6, kitchens: [kitchenA.id] },
    { sku: 'DEMO-OTHER', n: 1, stock: 7, kitchens: [kitchenB.id] },
    { sku: 'MTN500', n: 1, stock: 48, kitchens: [kitchenA.id] },
  ]);

  // Re-run: nothing missing, so no kitchen is needed and nothing is added.
  const again = await logCatalogDemoBatches(t.db, ['CHK250', 'MTN500']);
  expect(again).toEqual({ kitchenCode: null, logged: [], shelfExamples: false });

  // A new catalog SKU gets stock on its own; CHK250 shelf examples are not repeated.
  await createProduct(t.db, { sku: 'TRT250' });
  const third = await logCatalogDemoBatches(t.db, ['CHK250', 'MTN500', 'TRT250'], { kitchenCode: 'HP-B-02' });
  expect(third).toEqual({ kitchenCode: 'HP-B-02', logged: ['TRT250'], shelfExamples: false });
  const rows = await batchesBySku();
  expect(rows.find((r) => r.sku === 'CHK250')!.n).toBe(3);
  expect(rows.find((r) => r.sku === 'TRT250')).toEqual({ sku: 'TRT250', n: 1, stock: 48, kitchens: [kitchenB.id] });
  expect(await findLedgerMismatches(t.db)).toEqual([]);
});

it('uses the only active kitchen automatically', async () => {
  const kitchen = await createPickupLocation(t.db);
  await t.db.query(
    "INSERT INTO pickup_locations (code, name, contact_name, contact_phone, address_line1, city, state, pincode, is_active) VALUES ('HP-OFF-09', 'Closed', 'X', '+919876543210', 'Road', 'Kullu', 'Himachal Pradesh', '175101', FALSE)",
  );
  await createProduct(t.db, { sku: 'CHK500' });
  const res = await logCatalogDemoBatches(t.db, ['CHK500']);
  expect(res).toEqual({ kitchenCode: kitchen.code, logged: ['CHK500'], shelfExamples: false });
  expect((await batchesBySku())[0]).toMatchObject({ sku: 'CHK500', n: 1, stock: 48, kitchens: [kitchen.id] });
});
