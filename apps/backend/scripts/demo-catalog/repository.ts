import type { Queryable } from '../../src/config/db';
import { DEMO_PRODUCTS, DEMO_SHELF_LIFE_DAYS, type DemoProduct } from './fixtures';

export async function lockDemoSet(db: Queryable) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['pickle-demo-v1']);
  // Product locks precede stock locks, in the same order as checkout.
  await db.query('SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
    DEMO_PRODUCTS.map((p) => p.id),
  ]);
  const { rows } = await db.query<{ fixture_key: string; product_id: string; cleared_at: Date | null }>(
    'SELECT * FROM demo_catalog_products WHERE fixture_key = ANY($1::text[]) ORDER BY product_id FOR UPDATE',
    [DEMO_PRODUCTS.map((p) => p.key)],
  );
  for (const p of DEMO_PRODUCTS) {
    const owned = rows.find((r) => r.fixture_key === p.key);
    if (owned && owned.product_id !== p.id) throw new Error(`Unexpected ownership for ${p.sku}`);
    if (!owned) {
      const collision = await db.query(
        'SELECT 1 FROM products WHERE id = $1 OR sku = $2 OR slug = $3 OR (product_group = $4 AND net_weight_g = 250)',
        [p.id, p.sku, p.slug, p.group],
      );
      if (collision.rowCount) throw new Error(`Refusing to overwrite unowned product ${p.sku}`);
    }
  }
  return rows;
}

export async function resolveActors(db: Queryable, kitchenCode?: string) {
  const admin = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE role = 'ADMIN' AND is_active ORDER BY created_at, id LIMIT 1",
  );
  if (!admin.rows[0]) throw new Error('An active admin is required. Run pnpm db:seed:staff first.');
  const kitchens = await db.query<{ id: string; code: string }>(
    'SELECT id, code FROM pickup_locations WHERE is_active AND ($1::text IS NULL OR code = $1) ORDER BY code',
    [kitchenCode ?? null],
  );
  if (kitchens.rows.length !== 1)
    throw new Error('Choose an existing active kitchen with DEMO_KITCHEN_CODE (see pnpm db:demo:status).');
  return { adminId: admin.rows[0].id, kitchen: kitchens.rows[0]! };
}

export async function writeProduct(db: Queryable, p: DemoProduct, exists: boolean) {
  // A reset deliberately restores fixture content. A plain seed skips installed fixtures entirely.
  const values = [
    p.id,
    p.sku,
    p.slug,
    p.group,
    p.title,
    p.short,
    p.description,
    p.meat,
    p.price,
    p.price + 5000,
    p.ingredients,
    p.allergens,
    p.spice,
    DEMO_SHELF_LIFE_DAYS,
    [p.imageKey],
    p.sortOrder,
  ];
  const columns = [
    'id',
    'sku',
    'slug',
    'product_group',
    'title',
    'short_description',
    'description',
    'meat_type',
    'price_paise',
    'compare_price_paise',
    'ingredients',
    'allergens',
    'spice_level',
    'shelf_life_days',
    'images',
    'sort_order',
  ];
  const extra = `net_weight_g = 250, packed_weight_g = 480, gst_rate_bp = 500, hsn_code = '2001',
    storage_instructions = 'DEMO: Store in a cool, dry place. Use a clean, dry spoon. Refrigerate after opening.',
    nutrition = '{"energy_kcal":310,"protein_g":18,"fat_g":24,"carbs_g":6,"sugar_g":1,"sodium_mg":1450}', is_active = TRUE`;
  if (exists) {
    await db.query(
      `UPDATE products SET ${columns
        .slice(1)
        .map((c, i) => `${c} = $${i + 2}`)
        .join(', ')}, ${extra} WHERE id = $1`,
      values,
    );
  } else {
    await db.query(
      `INSERT INTO products (${columns.join(', ')}, net_weight_g)
      VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}, 250)`,
      values,
    );
    await db.query(`UPDATE products SET ${extra} WHERE id = $1`, [p.id]);
    await db.query('INSERT INTO demo_catalog_products (fixture_key, product_id) VALUES ($1, $2)', [p.key, p.id]);
  }
  await db.query('UPDATE demo_catalog_products SET cleared_at = NULL WHERE product_id = $1', [p.id]);
}

export async function lockBatchesForClear(db: Queryable, ids: string[]) {
  // Lock before checking allocations: concurrent reserve/release cannot slip between check and adjustment.
  const { rows } = await db.query<{ id: string; product_id: string; available_stock: number }>(
    `SELECT id, product_id, available_stock FROM inventory_batches WHERE product_id = ANY($1::uuid[])
      ORDER BY product_id, expiry_date, manufactured_at, id FOR UPDATE`,
    [ids],
  );
  const live = await db.query(
    `SELECT 1 FROM order_item_allocations a JOIN inventory_batches b ON b.id = a.batch_id
      JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE b.product_id = ANY($1::uuid[]) AND a.status <> 'RELEASED'
        AND o.status NOT IN ('EXPIRED', 'CANCELLED', 'DELIVERED', 'RTO_DELIVERED', 'LOST') LIMIT 1`,
    [ids],
  );
  if (live.rowCount)
    throw new Error(
      'Demo products have unfinished orders. Complete or cancel them through the app before clear/reset.',
    );
  return rows;
}

export async function archiveProducts(db: Queryable, ids: string[]) {
  await db.query('UPDATE products SET is_active = FALSE WHERE id = ANY($1::uuid[])', [ids]);
  await db.query('UPDATE demo_catalog_products SET cleared_at = NOW() WHERE product_id = ANY($1::uuid[])', [ids]);
}

export async function demoStatus(db: Queryable) {
  const products = await db.query(
    `SELECT p.sku, p.title, p.is_active, d.cleared_at IS NOT NULL AS cleared,
        COALESCE(SUM(b.available_stock), 0)::int AS stock
      FROM demo_catalog_products d JOIN products p ON p.id = d.product_id
      LEFT JOIN inventory_batches b ON b.product_id = p.id
      WHERE d.fixture_key = ANY($1::text[]) GROUP BY p.id, d.cleared_at ORDER BY p.sku`,
    [DEMO_PRODUCTS.map((p) => p.key)],
  );
  const kitchens = await db.query('SELECT code, name FROM pickup_locations WHERE is_active ORDER BY code');
  return { products: products.rows, kitchens: kitchens.rows };
}
