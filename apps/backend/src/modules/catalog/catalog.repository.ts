import { ProductRowSchema, type ProductRow } from '@pk/shared';
import { z } from 'zod';
import type { Queryable } from '../../config/db';

const parse = (rows: unknown[]) => rows.map((r) => ProductRowSchema.parse(r));

export async function listProducts(db: Queryable, opts: { activeOnly: boolean }): Promise<ProductRow[]> {
  const { rows } = await db.query(
    `SELECT * FROM products WHERE ($1::boolean = FALSE OR is_active)
      AND NOT EXISTS (SELECT 1 FROM demo_catalog_products d WHERE d.product_id = products.id AND d.cleared_at IS NOT NULL)
      ORDER BY sort_order, product_group, net_weight_g`,
    [opts.activeOnly],
  );
  return parse(rows);
}

export async function findProductById(db: Queryable, id: string, opts: { forUpdate?: boolean } = {}) {
  const { rows } = await db.query(`SELECT * FROM products WHERE id = $1${opts.forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return parse(rows)[0] ?? null;
}

export async function findActiveProductBySlug(db: Queryable, slug: string) {
  const { rows } = await db.query('SELECT * FROM products WHERE slug = $1 AND is_active', [slug]);
  return parse(rows)[0] ?? null;
}

export async function listActiveGroupProducts(db: Queryable, productGroup: string) {
  const { rows } = await db.query(
    'SELECT * FROM products WHERE product_group = $1 AND is_active ORDER BY net_weight_g',
    [productGroup],
  );
  return parse(rows);
}

/** API field → column. The only column names that ever reach SQL text (never user input). */
export const PRODUCT_COLUMNS = {
  sku: 'sku',
  slug: 'slug',
  productGroup: 'product_group',
  title: 'title',
  shortDescription: 'short_description',
  description: 'description',
  meatType: 'meat_type',
  netWeightG: 'net_weight_g',
  packedWeightG: 'packed_weight_g',
  packageLengthCm: 'package_length_cm',
  packageBreadthCm: 'package_breadth_cm',
  packageHeightCm: 'package_height_cm',
  pricePaise: 'price_paise',
  comparePricePaise: 'compare_price_paise',
  hsnCode: 'hsn_code',
  gstRateBp: 'gst_rate_bp',
  ingredients: 'ingredients',
  allergens: 'allergens',
  spiceLevel: 'spice_level',
  shelfLifeDays: 'shelf_life_days',
  storageInstructions: 'storage_instructions',
  nutrition: 'nutrition',
  images: 'images',
  sortOrder: 'sort_order',
} as const;
export type ProductColumnField = keyof typeof PRODUCT_COLUMNS;

/** `values` keys are API fields; nutrition must already be in its DB (snake_case) shape. */
export async function insertProduct(client: Queryable, values: Partial<Record<ProductColumnField, unknown>>) {
  const fields = Object.keys(values) as ProductColumnField[];
  const { rows } = await client.query(
    `INSERT INTO products (${fields.map((f) => PRODUCT_COLUMNS[f]).join(', ')})
     VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING *`,
    fields.map((f) => values[f]),
  );
  return parse(rows)[0]!;
}

export async function updateProduct(
  client: Queryable,
  id: string,
  values: Partial<Record<ProductColumnField, unknown>>,
): Promise<ProductRow> {
  const fields = Object.keys(values) as ProductColumnField[];
  const { rows } = await client.query(
    `UPDATE products SET ${fields.map((f, i) => `${PRODUCT_COLUMNS[f]} = $${i + 2}`).join(', ')}
      WHERE id = $1 RETURNING *`,
    [id, ...fields.map((f) => values[f])],
  );
  return parse(rows)[0]!;
}

export async function setProductActive(client: Queryable, id: string, active: boolean): Promise<ProductRow> {
  const { rows } = await client.query('UPDATE products SET is_active = $2 WHERE id = $1 RETURNING *', [id, active]);
  return parse(rows)[0]!;
}

/**
 * Storefront stock (sellable only) — architecture/01 "Common Read Query", verbatim except
 * CURRENT_DATE → ist_today() (D-49). `$1` = sellable buffer days, the same value Phase 5
 * allocation filters with, so the count shown never exceeds what checkout can reserve.
 */
export async function storefrontStock(db: Queryable, sellableBufferDays: number): Promise<Map<string, number>> {
  const { rows } = await db.query<{ id: string; sellable_stock: number }>(
    `SELECT p.id, p.slug, p.title, p.price_paise, p.compare_price_paise,
            COALESCE(SUM(b.available_stock), 0)::int AS sellable_stock
       FROM products p
       LEFT JOIN inventory_batches b
              ON b.product_id = p.id
             AND b.available_stock > 0
             AND b.expiry_date >= ist_today() + $1::int
      WHERE p.is_active = TRUE
      GROUP BY p.id
      ORDER BY p.sort_order, p.title`,
    [sellableBufferDays],
  );
  return new Map(rows.map((r) => [r.id, r.sellable_stock]));
}

/** Admin view: sellable (same D-24 filter as above) and everything on hand, for any products. */
export async function stockSummary(db: Queryable, sellableBufferDays: number, productIds: string[]) {
  const { rows } = await db.query<{ id: string; sellable: number; on_hand: number }>(
    `SELECT p.id,
            COALESCE(SUM(b.available_stock) FILTER (WHERE b.expiry_date >= ist_today() + $1::int), 0)::int AS sellable,
            COALESCE(SUM(b.available_stock), 0)::int AS on_hand
       FROM products p
       LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.available_stock > 0
      WHERE p.id = ANY($2::uuid[])
      GROUP BY p.id`,
    [sellableBufferDays, productIds],
  );
  return new Map(rows.map((r) => [r.id, { sellable: r.sellable, onHand: r.on_hand }]));
}

/** The batch the next order ships from: FIFO by expiry among sellable batches (D-23, D-24). */
export async function findCurrentSellableBatch(db: Queryable, productId: string, sellableBufferDays: number) {
  const { rows } = await db.query<{
    batch_code: string;
    manufactured_at: string;
    expiry_date: string;
    fssai_license_no: string | null;
  }>(
    `SELECT b.batch_code, b.manufactured_at, b.expiry_date, l.fssai_license_no
       FROM inventory_batches b
       JOIN pickup_locations l ON l.id = b.pickup_location_id
      WHERE b.product_id = $1
        AND b.available_stock > 0
        AND b.expiry_date >= ist_today() + $2::int
      ORDER BY b.expiry_date ASC, b.manufactured_at ASC
      LIMIT 1`,
    [productId, sellableBufferDays],
  );
  return rows[0] ?? null;
}

/** Fallback FSSAI number when nothing is in stock (single-kitchen launch). */
export async function findDefaultFssaiLicense(db: Queryable): Promise<string | null> {
  const { rows } = await db.query<{ fssai_license_no: string }>(
    `SELECT fssai_license_no FROM pickup_locations
      WHERE is_active AND fssai_license_no IS NOT NULL ORDER BY code LIMIT 1`,
  );
  return rows[0]?.fssai_license_no ?? null;
}

export async function listProductsByIds(db: Queryable, ids: string[]): Promise<ProductRow[]> {
  const { rows } = await db.query('SELECT * FROM products WHERE id = ANY($1::uuid[])', [ids]);
  return parse(rows);
}

/** Latest-made sellable batch of any live product (home "current batch" badge). */
export async function findFreshestSellableBatch(db: Queryable, sellableBufferDays: number) {
  const { rows } = await db.query<{ batch_code: string; manufactured_at: string; title: string }>(
    `SELECT b.batch_code, b.manufactured_at, p.title
       FROM inventory_batches b
       JOIN products p ON p.id = b.product_id AND p.is_active
      WHERE b.available_stock > 0
        AND b.expiry_date >= ist_today() + $1::int
      ORDER BY b.manufactured_at DESC, b.created_at DESC
      LIMIT 1`,
    [sellableBufferDays],
  );
  return rows[0] ?? null;
}

/** Is this image key still on any product (re-added, or shared)? Guard before deleting the object. */
export async function isImageReferenced(db: Queryable, key: string): Promise<boolean> {
  const { rows } = await db.query('SELECT EXISTS (SELECT 1 FROM products WHERE $1 = ANY(images)) AS referenced', [key]);
  return z.object({ referenced: z.boolean() }).parse(rows[0]).referenced;
}
