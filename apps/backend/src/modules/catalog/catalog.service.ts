import { randomUUID } from 'node:crypto';
import {
  IMAGE_EXTENSIONS,
  missingForPublish,
  stockBadgeFor,
  type AdminProduct,
  type ImageUploadRequest,
  type ImageUploadResponse,
  type Nutrition,
  type ProductCard,
  type ProductCreateInput,
  type ProductDetail,
  type ProductListResponse,
  type ProductRow,
  type ProductUpdateRequest,
} from '@pk/shared';
import { DatabaseError } from 'pg';
import { z } from 'zod';
import type { Db, Queryable } from '../../config/db';
import type { ObjectStorage } from '../../integrations/storage/storage';
import type { StorefrontRevalidator } from '../../integrations/storefront/revalidate';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import type { InventoryService, MutationContext } from '../inventory/inventory.service';
import type { SettingsService } from '../settings/settings.service';
import * as repo from './catalog.repository';

const Threshold = z.number().int().min(0);

const nutritionToRow = (n: Nutrition | null) =>
  n && {
    energy_kcal: n.energyKcal,
    protein_g: n.proteinG,
    fat_g: n.fatG,
    carbs_g: n.carbsG,
    sugar_g: n.sugarG,
    sodium_mg: n.sodiumMg,
  };

const nutritionFromRow = (n: ProductRow['nutrition']): Nutrition | null =>
  n && {
    energyKcal: n.energy_kcal,
    proteinG: n.protein_g,
    fatG: n.fat_g,
    carbsG: n.carbs_g,
    sugarG: n.sugar_g,
    sodiumMg: n.sodium_mg,
  };

const DUPLICATE_FIELDS: Record<string, string> = {
  products_sku_key: 'sku',
  products_slug_key: 'slug',
  uq_products_group_weight: 'netWeightG',
};

/** Unique violations → 409 DUPLICATE naming the field; anything else is rethrown. */
function mapWriteError(err: unknown): never {
  if (err instanceof DatabaseError && err.code === '23505' && err.constraint && DUPLICATE_FIELDS[err.constraint]) {
    const field = DUPLICATE_FIELDS[err.constraint];
    throw new AppError(
      'DUPLICATE',
      field === 'netWeightG'
        ? 'This product group already has a jar of that weight.'
        : `That ${field} is already used.`,
      { field },
    );
  }
  throw err;
}

/** Products, storefront catalog reads, publishing and image uploads (Phase 3 §3.2–3.3). */
export function createCatalogService(deps: {
  db: Db;
  settings: SettingsService;
  inventory: InventoryService;
  storage: ObjectStorage;
  revalidator: StorefrontRevalidator;
}) {
  const { db, settings, inventory, storage, revalidator } = deps;

  const lowStockThreshold = (q: Queryable = db) => settings.getSetting(q, 'low_stock_threshold', Threshold);
  const imageUrls = (keys: string[]) => keys.map((k) => storage.publicUrl(k));

  function toAdmin(p: ProductRow, stock: { sellable: number; onHand: number }): AdminProduct {
    const nutrition = nutritionFromRow(p.nutrition);
    return {
      id: p.id,
      sku: p.sku,
      slug: p.slug,
      productGroup: p.product_group,
      title: p.title,
      shortDescription: p.short_description,
      description: p.description,
      meatType: p.meat_type,
      netWeightG: p.net_weight_g,
      packedWeightG: p.packed_weight_g,
      packageLengthCm: p.package_length_cm,
      packageBreadthCm: p.package_breadth_cm,
      packageHeightCm: p.package_height_cm,
      pricePaise: p.price_paise,
      comparePricePaise: p.compare_price_paise,
      hsnCode: p.hsn_code,
      gstRateBp: p.gst_rate_bp,
      ingredients: p.ingredients,
      allergens: p.allergens,
      spiceLevel: p.spice_level,
      shelfLifeDays: p.shelf_life_days,
      storageInstructions: p.storage_instructions,
      nutrition,
      sortOrder: p.sort_order,
      images: p.images.map((key) => ({ key, url: storage.publicUrl(key) })),
      isActive: p.is_active,
      stock,
      missingForPublish: missingFor(p),
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString(),
    };
  }

  const missingFor = (p: ProductRow) =>
    missingForPublish({
      gstRateBp: p.gst_rate_bp,
      shelfLifeDays: p.shelf_life_days,
      ingredients: p.ingredients,
      packedWeightG: p.packed_weight_g,
      nutrition: p.nutrition,
      images: p.images,
    });

  function toCard(p: ProductRow, sellableStock: number, threshold: number): ProductCard {
    return {
      id: p.id,
      slug: p.slug,
      productGroup: p.product_group,
      title: p.title,
      shortDescription: p.short_description,
      meatType: p.meat_type,
      netWeightG: p.net_weight_g,
      pricePaise: p.price_paise,
      comparePricePaise: p.compare_price_paise,
      images: imageUrls(p.images),
      spiceLevel: p.spice_level,
      sellableStock,
      stockBadge: stockBadgeFor(sellableStock, threshold),
    };
  }

  async function adminView(p: ProductRow): Promise<AdminProduct> {
    const stock = await repo.stockSummary(db, await inventory.sellableBufferDays(), [p.id]);
    return toAdmin(p, stock.get(p.id) ?? { sellable: 0, onHand: 0 });
  }

  /** Storefront picks up the change on its next request (cache tag `products`), after COMMIT. */
  const afterWrite = (p: ProductRow) => revalidator.revalidate(['products']).then(() => adminView(p));

  async function setActive(auth: AuthContext, id: string, active: boolean, ctx: MutationContext) {
    const product = await db.transaction(async (client) => {
      const current = await repo.findProductById(client, id, { forUpdate: true });
      if (!current) throw new AppError('NOT_FOUND', 'Product not found.');
      if (active) {
        const missing = missingFor(current);
        if (missing.length > 0) {
          throw new AppError('VALIDATION_FAILED', 'Fill in the required details before publishing.', { missing });
        }
      }
      if (current.is_active === active) return current;
      const updated = await repo.setProductActive(client, id, active);
      await audit(client, {
        actorId: auth.userId,
        action: active ? 'PRODUCT_PUBLISH' : 'PRODUCT_UNPUBLISH',
        entityType: 'product',
        entityId: id,
        before: { isActive: current.is_active },
        after: { isActive: active },
        ip: ctx.ip,
      });
      return updated;
    });
    return afterWrite(product);
  }

  return {
    // ── Public storefront ───────────────────────────────────────────────
    async listPublic(): Promise<ProductListResponse> {
      const buffer = await inventory.sellableBufferDays();
      const [products, stock, threshold, freshest] = await Promise.all([
        repo.listProducts(db, { activeOnly: true }),
        repo.storefrontStock(db, buffer),
        lowStockThreshold(),
        repo.findFreshestSellableBatch(db, buffer),
      ]);
      const groups = new Map<string, ProductCard[]>();
      for (const p of products) {
        const list = groups.get(p.product_group) ?? [];
        list.push(toCard(p, stock.get(p.id) ?? 0, threshold));
        groups.set(p.product_group, list);
      }
      return {
        groups: [...groups].map(([productGroup, variants]) => ({ productGroup, variants })),
        freshestBatch: freshest
          ? { batchCode: freshest.batch_code, manufacturedAt: freshest.manufactured_at, productTitle: freshest.title }
          : null,
      };
    },

    async detailPublic(slug: string): Promise<ProductDetail> {
      const product = await repo.findActiveProductBySlug(db, slug);
      if (!product) throw new AppError('NOT_FOUND', 'Product not found.');
      const buffer = await inventory.sellableBufferDays();
      const [siblings, stock, threshold, batch] = await Promise.all([
        repo.listActiveGroupProducts(db, product.product_group),
        repo.storefrontStock(db, buffer),
        lowStockThreshold(),
        repo.findCurrentSellableBatch(db, product.id, buffer),
      ]);
      const card = toCard(product, stock.get(product.id) ?? 0, threshold);
      return {
        ...card,
        description: product.description,
        ingredients: product.ingredients,
        allergens: product.allergens,
        nutrition: nutritionFromRow(product.nutrition),
        shelfLifeDays: product.shelf_life_days,
        storageInstructions: product.storage_instructions,
        variants: siblings.map((s) => {
          const c = toCard(s, stock.get(s.id) ?? 0, threshold);
          return {
            id: c.id,
            slug: c.slug,
            netWeightG: c.netWeightG,
            pricePaise: c.pricePaise,
            comparePricePaise: c.comparePricePaise,
            sellableStock: c.sellableStock,
            stockBadge: c.stockBadge,
          };
        }),
        fssaiLicenseNo: batch?.fssai_license_no ?? (await repo.findDefaultFssaiLicense(db)),
        currentBatch: batch
          ? { batchCode: batch.batch_code, manufacturedAt: batch.manufactured_at, expiryDate: batch.expiry_date }
          : null,
      };
    },

    /**
     * Pricing + sellable stock for cart quotes (Phase 4) and order creation (Phase 5). Unknown ids
     * are simply absent from the result; inactive products come back with `isActive: false`.
     */
    async productsForQuote(q: Queryable, ids: string[]) {
      const buffer = await inventory.sellableBufferDays(q);
      const [products, stock] = await Promise.all([repo.listProductsByIds(q, ids), repo.storefrontStock(q, buffer)]);
      return products.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        netWeightG: p.net_weight_g,
        image: p.images[0] ? storage.publicUrl(p.images[0]) : null,
        pricePaise: p.price_paise,
        comparePricePaise: p.compare_price_paise,
        isActive: p.is_active,
        sellableStock: p.is_active ? (stock.get(p.id) ?? 0) : 0,
      }));
    },

    // ── Admin ───────────────────────────────────────────────────────────
    async listAdmin(): Promise<AdminProduct[]> {
      const products = await repo.listProducts(db, { activeOnly: false });
      const stock = await repo.stockSummary(
        db,
        await inventory.sellableBufferDays(),
        products.map((p) => p.id),
      );
      return products.map((p) => toAdmin(p, stock.get(p.id) ?? { sellable: 0, onHand: 0 }));
    },

    async getAdmin(id: string): Promise<AdminProduct> {
      const product = await repo.findProductById(db, id);
      if (!product) throw new AppError('NOT_FOUND', 'Product not found.');
      return adminView(product);
    },

    /** New products are always drafts (is_active = false) until published. */
    async create(auth: AuthContext, input: ProductCreateInput, ctx: MutationContext) {
      const product = await db
        .transaction(async (client) => {
          const row = await repo.insertProduct(client, { ...input, nutrition: nutritionToRow(input.nutrition) });
          await audit(client, {
            actorId: auth.userId,
            action: 'PRODUCT_CREATE',
            entityType: 'product',
            entityId: row.id,
            after: { sku: row.sku, slug: row.slug, pricePaise: row.price_paise },
            ip: ctx.ip,
          });
          return row;
        })
        .catch(mapWriteError);
      return afterWrite(product);
    },

    async update(auth: AuthContext, id: string, patch: ProductUpdateRequest, ctx: MutationContext) {
      const badKey = patch.images?.find((key) => !key.startsWith(`products/${id}/`));
      if (badKey) {
        throw new AppError('VALIDATION_FAILED', 'That image belongs to a different product.', { field: 'images' });
      }
      const product = await db
        .transaction(async (client) => {
          const current = await repo.findProductById(client, id, { forUpdate: true });
          if (!current) throw new AppError('NOT_FOUND', 'Product not found.');

          const values: Partial<Record<repo.ProductColumnField, unknown>> = { ...patch };
          if ('nutrition' in patch) values.nutrition = nutritionToRow(patch.nutrition ?? null);
          // Validate the merged state — the request may change only one side of a cross-field rule
          const merged = { ...current } as Record<string, unknown>;
          for (const [field, value] of Object.entries(values)) {
            merged[repo.PRODUCT_COLUMNS[field as repo.ProductColumnField]] = value;
          }
          const next = merged as ProductRow;
          if (next.compare_price_paise != null && next.compare_price_paise <= next.price_paise) {
            throw new AppError('VALIDATION_FAILED', 'Compare-at price must be above the price.', {
              field: 'comparePricePaise',
            });
          }
          if (next.packed_weight_g != null && next.packed_weight_g < next.net_weight_g) {
            throw new AppError('VALIDATION_FAILED', 'Packed weight must be at least the net weight.', {
              field: 'packedWeightG',
            });
          }
          const missing = current.is_active ? missingFor(next) : [];
          if (missing.length > 0) {
            throw new AppError('VALIDATION_FAILED', 'A live product needs these details. Unpublish it first.', {
              missing,
            });
          }

          const updated = await repo.updateProduct(client, id, values);
          await audit(client, {
            actorId: auth.userId,
            action: 'PRODUCT_UPDATE',
            entityType: 'product',
            entityId: id,
            before: Object.fromEntries(
              Object.keys(patch).map((f) => [f, current[repo.PRODUCT_COLUMNS[f as repo.ProductColumnField]]]),
            ),
            after: values,
            ip: ctx.ip,
          });
          return updated;
        })
        .catch(mapWriteError);
      return afterWrite(product);
    },

    publish: (auth: AuthContext, id: string, ctx: MutationContext) => setActive(auth, id, true, ctx),
    unpublish: (auth: AuthContext, id: string, ctx: MutationContext) => setActive(auth, id, false, ctx),

    /** D-11: presigned PUT to the public bucket; the key is saved on the product via PATCH images. */
    async presignImage(input: ImageUploadRequest): Promise<ImageUploadResponse> {
      const product = await repo.findProductById(db, input.productId);
      if (!product) throw new AppError('NOT_FOUND', 'Product not found.');
      const key = `products/${product.id}/${randomUUID()}.${IMAGE_EXTENSIONS[input.contentType]}`;
      const upload = await storage.presignPut({ key, contentType: input.contentType, sizeBytes: input.sizeBytes });
      return {
        key,
        uploadUrl: upload.url,
        method: upload.method,
        headers: upload.headers,
        publicUrl: storage.publicUrl(key),
        expiresInSec: upload.expiresInSec,
      };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
