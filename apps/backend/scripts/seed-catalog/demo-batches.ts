import { todayInIST } from '@pk/shared';
import type { Db, Queryable } from '../../src/config/db';
import type { AuthContext } from '../../src/middleware/auth';
import { createInventoryService } from '../../src/modules/inventory/inventory.service';
import { createSettingsService } from '../../src/modules/settings/settings.service';

/** SKU that also gets the AGING / NOT_SELLABLE shelf-status example batches. */
export const SHELF_EXAMPLE_SKU = 'CHK250';

/**
 * Same rule as `pnpm db:demo` (demo-catalog/repository.ts resolveActors): one active kitchen is used
 * automatically; with more than one, DEMO_KITCHEN_CODE must name it.
 */
export async function resolveSeedKitchen(db: Queryable, kitchenCode?: string) {
  const { rows } = await db.query<{ id: string; code: string; name: string }>(
    'SELECT id, code, name FROM pickup_locations WHERE is_active ORDER BY code',
  );
  const list = rows.map((k) => `  - ${k.code} (${k.name})`).join('\n');
  if (kitchenCode) {
    const match = rows.find((k) => k.code === kitchenCode);
    if (!match) throw new Error(`DEMO_KITCHEN_CODE=${kitchenCode} is not an active kitchen. Active kitchens:\n${list}`);
    return match;
  }
  if (rows.length === 0)
    throw new Error('No active kitchen found. Create a pickup location in the admin portal first.');
  if (rows.length > 1)
    throw new Error(
      `More than one active kitchen — set DEMO_KITCHEN_CODE to choose which one made the demo batches:\n${list}`,
    );
  return rows[0]!;
}

/**
 * Logs demo batches (through the real inventory service) only for the given SKUs that have NO batches
 * yet — other products' batches (e.g. `pnpm db:demo:seed`) don't block it. Re-running is a no-op.
 */
export async function logCatalogDemoBatches(db: Db, skus: readonly string[], opts: { kitchenCode?: string } = {}) {
  const { rows: missing } = await db.query<{ id: string; sku: string }>(
    `SELECT p.id, p.sku FROM products p
      WHERE p.sku = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM inventory_batches b WHERE b.product_id = p.id)
      ORDER BY p.sort_order, p.sku`,
    [[...skus]],
  );
  if (missing.length === 0) return { kitchenCode: null, logged: [] as string[], shelfExamples: false };

  const admin = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE role = 'ADMIN' AND is_active ORDER BY created_at, id LIMIT 1",
  );
  if (!admin.rows[0]) throw new Error('Run pnpm db:seed:staff first (demo batches need an ADMIN actor)');
  const kitchen = await resolveSeedKitchen(db, opts.kitchenCode);

  const inventory = createInventoryService({
    db,
    settings: createSettingsService(),
    revalidator: { revalidate: async () => undefined },
  });
  const auth: AuthContext = { userId: admin.rows[0].id, role: 'ADMIN', pickupLocationIds: [], mfa: true };
  const daysAgo = (n: number) => {
    const d = new Date(`${todayInIST()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  for (const p of missing) {
    await inventory.createBatch(
      auth,
      { productId: p.id, pickupLocationId: kitchen.id, quantity: 48, totalCostPaise: 48 * 21_000 },
      { ip: null },
    );
  }
  // Shelf-status examples (shelf life 180, buffer 45 + 7): AGING (70 d left), NOT_SELLABLE (30 d left)
  const shelf = missing.find((p) => p.sku === SHELF_EXAMPLE_SKU);
  if (shelf) {
    for (const [ago, qty] of [
      [110, 12],
      [150, 6],
    ] as const) {
      await inventory.createBatch(
        auth,
        {
          productId: shelf.id,
          pickupLocationId: kitchen.id,
          quantity: qty,
          totalCostPaise: qty * 20_000,
          manufacturedAt: daysAgo(ago),
        },
        { ip: null },
      );
    }
  }
  return { kitchenCode: kitchen.code, logged: missing.map((p) => p.sku), shelfExamples: Boolean(shelf) };
}
