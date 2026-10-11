import { z } from 'zod';

/**
 * Database row schemas (D-07): every catalog/inventory query result is parsed through these, so a
 * schema drift fails loudly instead of leaking undefined into the API. Columns are snake_case as
 * returned by `pg` (BIGINT → number and DATE → 'YYYY-MM-DD' via the backend's type parsers).
 */
export const MeatTypeEnum = z.enum(['CHICKEN', 'MUTTON', 'FISH', 'PRAWN']);
export type MeatType = z.infer<typeof MeatTypeEnum>;

export const MovementTypeEnum = z.enum(['PRODUCTION', 'RESERVE', 'RELEASE', 'ADJUSTMENT', 'WASTAGE']);
export type MovementType = z.infer<typeof MovementTypeEnum>;

/** products.nutrition JSONB, per 100 g. */
export const NutritionRowSchema = z.object({
  energy_kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  sugar_g: z.number().nonnegative(),
  sodium_mg: z.number().nonnegative(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paise = z.number().int().nonnegative();

export const ProductRowSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  slug: z.string(),
  product_group: z.string(),
  title: z.string(),
  short_description: z.string().nullable(),
  description: z.string(),
  meat_type: MeatTypeEnum,
  net_weight_g: z.number().int(),
  packed_weight_g: z.number().int().nullable(),
  // NUMERIC(5,1) arrives as a string from pg
  package_length_cm: z.coerce.number(),
  package_breadth_cm: z.coerce.number(),
  package_height_cm: z.coerce.number(),
  price_paise: paise,
  compare_price_paise: paise.nullable(),
  hsn_code: z.string(),
  gst_rate_bp: z.number().int().nullable(),
  ingredients: z.string().nullable(),
  allergens: z.string().nullable(),
  spice_level: z.number().int().nullable(),
  shelf_life_days: z.number().int().nullable(),
  storage_instructions: z.string().nullable(),
  nutrition: NutritionRowSchema.nullable(),
  images: z.array(z.string()),
  is_active: z.boolean(),
  sort_order: z.number().int(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type ProductRow = z.infer<typeof ProductRowSchema>;

export const BatchRowSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  pickup_location_id: z.uuid(),
  batch_code: z.string(),
  manufactured_at: isoDate,
  expiry_date: isoDate,
  initial_quantity: z.number().int().positive(),
  available_stock: z.number().int().nonnegative(),
  total_cost_paise: paise,
  cost_per_unit_paise: paise,
  created_by_id: z.uuid().nullable(),
  notes: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type BatchRow = z.infer<typeof BatchRowSchema>;

export const MovementRowSchema = z.object({
  id: z.number().int(),
  batch_id: z.uuid(),
  movement_type: MovementTypeEnum,
  quantity_delta: z.number().int(),
  order_id: z.uuid().nullable(),
  actor_id: z.uuid().nullable(),
  reason: z.string().nullable(),
  created_at: z.date(),
});
export type MovementRow = z.infer<typeof MovementRowSchema>;
