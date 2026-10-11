import {
  batchCodePrefix,
  formatBatchCode,
  shelfStatusFor,
  todayInIST,
  type AdjustmentRequest,
  type Batch,
  type BatchCreateRequest,
  type Movement,
  type ShelfStatus,
} from '@pk/shared';
import { z } from 'zod';
import type { Db, Queryable } from '../../config/db';
import type { StorefrontRevalidator } from '../../integrations/storefront/revalidate';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import type { SettingsService } from '../settings/settings.service';
import * as repo from './inventory.repository';

export interface MutationContext {
  ip: string | null;
}

const Days = z.number().int().min(0).max(3650);

function toBatch(r: repo.BatchViewRow, bufferDays: number): Batch {
  return {
    id: r.id,
    batchCode: r.batch_code,
    product: { id: r.product_id, sku: r.product_sku, title: r.product_title, netWeightG: r.product_net_weight_g },
    pickupLocation: { id: r.pickup_location_id, code: r.location_code, name: r.location_name },
    manufacturedAt: r.manufactured_at,
    expiryDate: r.expiry_date,
    initialQuantity: r.initial_quantity,
    availableStock: r.available_stock,
    totalCostPaise: r.total_cost_paise,
    costPerUnitPaise: r.cost_per_unit_paise,
    notes: r.notes,
    daysToExpiry: r.days_to_expiry,
    shelfStatus: shelfStatusFor(r.days_to_expiry, bufferDays),
    createdAt: r.created_at.toISOString(),
  };
}

/** Batches + append-only stock ledger (Phase 3 §3.4–3.6). Every stock change writes a movement + audit row. */
export function createInventoryService(deps: {
  db: Db;
  settings: SettingsService;
  revalidator: StorefrontRevalidator;
}) {
  const { db, settings, revalidator } = deps;

  /** D-24: min_remaining_shelf_days + transit_buffer_days. Storefront stock and Phase 5 allocation use this. */
  async function sellableBufferDays(q: Queryable = db): Promise<number> {
    const [minRemaining, transit] = await Promise.all([
      settings.getSetting(q, 'min_remaining_shelf_days', Days),
      settings.getSetting(q, 'transit_buffer_days', Days),
    ]);
    return minRemaining + transit;
  }

  /** ADMIN: any kitchen. KITCHEN_PARTNER: only their own (user_pickup_locations, in the JWT). */
  function assertLocationAccess(auth: AuthContext, locationId: string): void {
    if (auth.role === 'ADMIN') return;
    if (auth.role !== 'KITCHEN_PARTNER' || !auth.pickupLocationIds.includes(locationId)) {
      throw new AppError('FORBIDDEN', 'You do not have access to this kitchen.');
    }
  }

  async function assertBatchAccess(auth: AuthContext, batchId: string): Promise<void> {
    const locationId = await repo.findBatchLocationId(db, batchId);
    if (!locationId) throw new AppError('NOT_FOUND', 'Batch not found.');
    assertLocationAccess(auth, locationId);
  }

  async function resolveLocation(auth: AuthContext, requested: string | undefined): Promise<string> {
    if (requested) {
      assertLocationAccess(auth, requested);
      if (!(await repo.isActiveLocation(db, requested))) {
        throw new AppError('VALIDATION_FAILED', 'That kitchen is not active.', { field: 'pickupLocationId' });
      }
      return requested;
    }
    const candidates = auth.role === 'ADMIN' ? await repo.listActiveLocationIds(db) : auth.pickupLocationIds;
    if (candidates.length === 1) return candidates[0]!;
    throw new AppError(
      'VALIDATION_FAILED',
      candidates.length === 0 ? 'No kitchen is set up for batch logging.' : 'Choose which kitchen made this batch.',
      { field: 'pickupLocationId' },
    );
  }

  async function batchView(id: string): Promise<Batch> {
    const [row, buffer] = await Promise.all([repo.findBatchView(db, id), sellableBufferDays()]);
    if (!row) throw new AppError('NOT_FOUND', 'Batch not found.');
    return toBatch(row, buffer);
  }

  return {
    sellableBufferDays,

    findLedgerMismatches: (q: Queryable = db, batchIds: string[] | null = null) =>
      repo.findLedgerMismatches(q, batchIds),

    productOptions: () => repo.listProductOptions(db),

    async listBatches(
      auth: AuthContext,
      f: { productId?: string; locationId?: string; status?: ShelfStatus; includeEmpty: boolean },
    ): Promise<{ batches: Batch[]; sellableBufferDays: number }> {
      if (f.locationId) assertLocationAccess(auth, f.locationId);
      const locationIds = f.locationId ? [f.locationId] : auth.role === 'ADMIN' ? null : auth.pickupLocationIds;
      const [rows, buffer] = await Promise.all([
        repo.listBatchViews(db, { productId: f.productId ?? null, locationIds, includeEmpty: f.includeEmpty }),
        sellableBufferDays(),
      ]);
      const batches = rows.map((r) => toBatch(r, buffer));
      return {
        batches: f.status ? batches.filter((b) => b.shelfStatus === f.status) : batches,
        sellableBufferDays: buffer,
      };
    },

    /** D-42: server-generated code, expiry = mfg + shelf_life_days, PRODUCTION movement — one transaction. */
    async createBatch(auth: AuthContext, input: BatchCreateRequest, ctx: MutationContext): Promise<Batch> {
      const today = todayInIST();
      const manufacturedAt = input.manufacturedAt ?? today;
      if (manufacturedAt > today) {
        throw new AppError('VALIDATION_FAILED', 'Manufacture date cannot be in the future.', {
          field: 'manufacturedAt',
        });
      }
      const pickupLocationId = await resolveLocation(auth, input.pickupLocationId);

      const id = await db.transaction(async (client) => {
        const product = await repo.lockProductForBatch(client, input.productId);
        if (!product) throw new AppError('NOT_FOUND', 'Product not found.');
        if (product.shelf_life_days == null) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Add the lab-tested shelf life to this product before logging batches.',
            {
              field: 'productId',
              missing: ['shelfLifeDays'],
            },
          );
        }
        const expiry = new Date(`${manufacturedAt}T00:00:00Z`);
        expiry.setUTCDate(expiry.getUTCDate() + product.shelf_life_days);
        if (expiry.toISOString().slice(0, 10) <= today) {
          throw new AppError('VALIDATION_FAILED', 'This batch would already be expired.', { field: 'manufacturedAt' });
        }

        const prefix = batchCodePrefix(manufacturedAt, product.sku);
        const batchCode = formatBatchCode(manufacturedAt, product.sku, await repo.nextBatchSeq(client, prefix));
        const batchId = await repo.insertBatch(client, {
          productId: product.id,
          pickupLocationId,
          batchCode,
          manufacturedAt,
          shelfLifeDays: product.shelf_life_days,
          quantity: input.quantity,
          totalCostPaise: input.totalCostPaise,
          createdById: auth.userId,
          notes: input.notes ?? null,
        });
        await repo.insertMovement(client, {
          batchId,
          type: 'PRODUCTION',
          quantityDelta: input.quantity,
          actorId: auth.userId,
          reason: null,
        });
        await audit(client, {
          actorId: auth.userId,
          action: 'BATCH_CREATE',
          entityType: 'inventory_batch',
          entityId: batchId,
          after: { batchCode, productId: product.id, pickupLocationId, quantity: input.quantity, manufacturedAt },
          ip: ctx.ip,
        });
        return batchId;
      });

      await revalidator.revalidate(['products']); // after COMMIT (D-30)
      return batchView(id);
    },

    async updateNotes(auth: AuthContext, id: string, notes: string | null, ctx: MutationContext): Promise<Batch> {
      await assertBatchAccess(auth, id);
      await db.transaction(async (client) => {
        const batch = await repo.lockBatch(client, id);
        if (!batch) throw new AppError('NOT_FOUND', 'Batch not found.');
        await repo.setBatchNotes(client, id, notes);
        await audit(client, {
          actorId: auth.userId,
          action: 'BATCH_UPDATE',
          entityType: 'inventory_batch',
          entityId: id,
          before: { notes: batch.notes },
          after: { notes },
          ip: ctx.ip,
        });
      });
      return batchView(id);
    },

    /** Lock → bounds check → stock update → movement → audit, all or nothing (Phase 3 §3.5). */
    async adjust(auth: AuthContext, id: string, input: AdjustmentRequest, ctx: MutationContext): Promise<Batch> {
      await assertBatchAccess(auth, id);
      await db.transaction(async (client) => {
        const batch = await repo.lockBatch(client, id);
        if (!batch) throw new AppError('NOT_FOUND', 'Batch not found.');
        const next = batch.available_stock + input.quantityDelta;
        if (next < 0 || next > batch.initial_quantity) {
          throw new AppError(
            'INSUFFICIENT_STOCK',
            next < 0
              ? `Only ${batch.available_stock} jars are left in this batch.`
              : `A batch can't hold more than the ${batch.initial_quantity} jars it was made with.`,
            { available: batch.available_stock, initialQuantity: batch.initial_quantity },
          );
        }
        await repo.setBatchStock(client, id, next);
        await repo.insertMovement(client, {
          batchId: id,
          type: input.type,
          quantityDelta: input.quantityDelta,
          actorId: auth.userId,
          reason: input.reason,
        });
        await audit(client, {
          actorId: auth.userId,
          action: 'STOCK_ADJUST',
          entityType: 'inventory_batch',
          entityId: id,
          before: { availableStock: batch.available_stock },
          after: { availableStock: next, type: input.type, quantityDelta: input.quantityDelta, reason: input.reason },
          ip: ctx.ip,
        });
      });
      await revalidator.revalidate(['products']);
      return batchView(id);
    },

    async movements(auth: AuthContext, id: string): Promise<Movement[]> {
      await assertBatchAccess(auth, id);
      const rows = await repo.listMovements(db, id);
      return rows.map((r) => ({
        id: r.id,
        type: r.movement_type,
        quantityDelta: r.quantity_delta,
        balanceAfter: r.balance_after,
        reason: r.reason,
        orderId: r.order_id,
        actorName: r.actor_name,
        createdAt: r.created_at.toISOString(),
      }));
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
