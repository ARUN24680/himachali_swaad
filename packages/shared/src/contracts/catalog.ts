import { z } from 'zod';
import { SKU_REGEX } from '../catalog/batch-code';
import { MeatTypeEnum } from '../catalog/rows';
import { STOCK_BADGES } from '../catalog/shelf-life';
import { PaiseSchema } from '../schemas/common';

/** Request/response contracts for /api/v1/products and /api/v1/admin/products (Phase 3 §3.2–3.3). */

export const SkuSchema = z.string().trim().toUpperCase().regex(SKU_REGEX, 'Use 2–20 capital letters or digits');
export const SlugSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens');

export const NutritionSchema = z.object({
  energyKcal: z.number().nonnegative().max(2000),
  proteinG: z.number().nonnegative().max(100),
  fatG: z.number().nonnegative().max(100),
  carbsG: z.number().nonnegative().max(100),
  sugarG: z.number().nonnegative().max(100),
  sodiumMg: z.number().nonnegative().max(100_000),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

export const IMAGE_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export const IMAGE_EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 8;

/** R2 key: products/<productId>/<uuid>.<ext> */
export const ProductImageKeySchema = z
  .string()
  .regex(/^products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png)$/, 'Invalid image key');

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

/** Fields an admin edits. Lab/CA-dependent ones may stay null on a draft (D-49). */
const ProductFieldsSchema = z.object({
  slug: SlugSchema,
  productGroup: SlugSchema.max(80),
  title: text(150),
  shortDescription: nullableText(300),
  description: text(5000),
  meatType: MeatTypeEnum,
  netWeightG: z.number().int().positive().max(10_000),
  packedWeightG: z.number().int().positive().max(20_000).nullable(),
  packageLengthCm: z.number().positive().max(999),
  packageBreadthCm: z.number().positive().max(999),
  packageHeightCm: z.number().positive().max(999),
  pricePaise: PaiseSchema.positive(),
  comparePricePaise: PaiseSchema.positive().nullable(),
  hsnCode: z.string().regex(/^\d{4,8}$/, 'HSN is 4–8 digits'),
  gstRateBp: z.number().int().min(0).max(2800).nullable(),
  ingredients: nullableText(2000),
  allergens: nullableText(500),
  spiceLevel: z.number().int().min(1).max(5).nullable(),
  shelfLifeDays: z.number().int().positive().max(3650).nullable(),
  storageInstructions: nullableText(1000),
  nutrition: NutritionSchema.nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
});

const comparePriceAbovePrice = (p: { pricePaise?: number; comparePricePaise?: number | null }) =>
  p.comparePricePaise == null || p.pricePaise === undefined || p.comparePricePaise > p.pricePaise;
const packedAboveNet = (p: { netWeightG?: number; packedWeightG?: number | null }) =>
  p.packedWeightG == null || p.netWeightG === undefined || p.packedWeightG >= p.netWeightG;

export const ProductCreateRequestSchema = ProductFieldsSchema.extend({
  sku: SkuSchema,
  shortDescription: ProductFieldsSchema.shape.shortDescription.default(null),
  packedWeightG: ProductFieldsSchema.shape.packedWeightG.default(null),
  packageLengthCm: ProductFieldsSchema.shape.packageLengthCm.default(15),
  packageBreadthCm: ProductFieldsSchema.shape.packageBreadthCm.default(10),
  packageHeightCm: ProductFieldsSchema.shape.packageHeightCm.default(10),
  comparePricePaise: ProductFieldsSchema.shape.comparePricePaise.default(null),
  hsnCode: ProductFieldsSchema.shape.hsnCode.default('2001'),
  gstRateBp: ProductFieldsSchema.shape.gstRateBp.default(null),
  ingredients: ProductFieldsSchema.shape.ingredients.default(null),
  allergens: ProductFieldsSchema.shape.allergens.default(null),
  spiceLevel: ProductFieldsSchema.shape.spiceLevel.default(null),
  shelfLifeDays: ProductFieldsSchema.shape.shelfLifeDays.default(null),
  storageInstructions: ProductFieldsSchema.shape.storageInstructions.default(null),
  nutrition: ProductFieldsSchema.shape.nutrition.default(null),
  sortOrder: ProductFieldsSchema.shape.sortOrder.default(0),
})
  .refine(comparePriceAbovePrice, { path: ['comparePricePaise'], message: 'Compare-at price must be above the price' })
  .refine(packedAboveNet, { path: ['packedWeightG'], message: 'Packed weight must be at least the net weight' });

/** SKU is immutable — batch codes embed it. `images` replaces the whole list ([0] = primary). */
export const ProductUpdateRequestSchema = ProductFieldsSchema.partial()
  .extend({ images: z.array(ProductImageKeySchema).max(MAX_PRODUCT_IMAGES).optional() })
  .refine((p) => Object.keys(p).length > 0, { message: 'Nothing to update' })
  .refine(comparePriceAbovePrice, { path: ['comparePricePaise'], message: 'Compare-at price must be above the price' })
  .refine(packedAboveNet, { path: ['packedWeightG'], message: 'Packed weight must be at least the net weight' });

export type ProductCreateRequest = z.input<typeof ProductCreateRequestSchema>;
/** After defaults are applied (what the server receives). */
export type ProductCreateInput = z.output<typeof ProductCreateRequestSchema>;
export type ProductUpdateRequest = z.infer<typeof ProductUpdateRequestSchema>;

/** D-49 / Phase 3 §3.2: what a product needs before it can be published (FSSAI + tax + shipping). */
export const PUBLISH_REQUIREMENTS = [
  'gstRateBp',
  'shelfLifeDays',
  'ingredients',
  'packedWeightG',
  'nutrition',
  'images',
] as const;
export type PublishRequirement = (typeof PUBLISH_REQUIREMENTS)[number];

export function missingForPublish(p: {
  gstRateBp: number | null;
  shelfLifeDays: number | null;
  ingredients: string | null;
  packedWeightG: number | null;
  nutrition: unknown;
  images: readonly unknown[];
}): PublishRequirement[] {
  return PUBLISH_REQUIREMENTS.filter((field) => (field === 'images' ? p.images.length === 0 : p[field] == null));
}

export const ProductImageSchema = z.object({ key: z.string(), url: z.url() });
export const StockBadgeEnum = z.enum(STOCK_BADGES);

export const AdminProductSchema = ProductFieldsSchema.extend({
  id: z.uuid(),
  sku: z.string(),
  images: z.array(ProductImageSchema),
  isActive: z.boolean(),
  stock: z.object({
    /** Jars the storefront can sell (D-24 filter). */
    sellable: z.number().int(),
    /** All jars on hand, including NOT_SELLABLE / EXPIRED batches. */
    onHand: z.number().int(),
  }),
  missingForPublish: z.array(z.enum(PUBLISH_REQUIREMENTS)),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AdminProduct = z.infer<typeof AdminProductSchema>;

export const AdminProductListResponseSchema = z.object({ products: z.array(AdminProductSchema) });
export const AdminProductResponseSchema = z.object({ product: AdminProductSchema });

// ── Public storefront ─────────────────────────────────────────────────────

export const ProductCardSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  productGroup: z.string(),
  title: z.string(),
  shortDescription: z.string().nullable(),
  meatType: MeatTypeEnum,
  netWeightG: z.number().int(),
  pricePaise: z.number().int(),
  comparePricePaise: z.number().int().nullable(),
  images: z.array(z.url()),
  spiceLevel: z.number().int().nullable(),
  sellableStock: z.number().int(),
  stockBadge: StockBadgeEnum,
});
export type ProductCard = z.infer<typeof ProductCardSchema>;

export const ProductListResponseSchema = z.object({
  groups: z.array(z.object({ productGroup: z.string(), variants: z.array(ProductCardSchema) })),
  /** Most recently made sellable batch across the catalog (home "current batch" badge) — real data only. */
  freshestBatch: z.object({ batchCode: z.string(), manufacturedAt: z.string(), productTitle: z.string() }).nullable(),
});
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

export const ProductDetailSchema = ProductCardSchema.extend({
  description: z.string(),
  ingredients: z.string().nullable(),
  allergens: z.string().nullable(),
  nutrition: NutritionSchema.nullable(),
  shelfLifeDays: z.number().int().nullable(),
  storageInstructions: z.string().nullable(),
  /** Same product_group (250g ↔ 500g), including this one, lightest first. */
  variants: z.array(
    ProductCardSchema.pick({
      id: true,
      slug: true,
      netWeightG: true,
      pricePaise: true,
      comparePricePaise: true,
      sellableStock: true,
      stockBadge: true,
    }),
  ),
  fssaiLicenseNo: z.string().nullable(),
  /** The batch the next order ships from (FIFO, sellable only). */
  currentBatch: z.object({ batchCode: z.string(), manufacturedAt: z.string(), expiryDate: z.string() }).nullable(),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;
export const ProductDetailResponseSchema = z.object({ product: ProductDetailSchema });

// ── Image upload (D-11) ───────────────────────────────────────────────────

export const ImageUploadRequestSchema = z.object({
  productId: z.uuid(),
  contentType: z.enum(IMAGE_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Images must be 5 MB or smaller'),
});
export type ImageUploadRequest = z.infer<typeof ImageUploadRequestSchema>;

/** PUT the file to `uploadUrl` with exactly `headers`, then save `key` via PATCH images. */
export const ImageUploadResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  publicUrl: z.url(),
  expiresInSec: z.number().int().positive(),
});
export type ImageUploadResponse = z.infer<typeof ImageUploadResponseSchema>;
