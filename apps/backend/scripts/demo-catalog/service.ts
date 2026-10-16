import { batchCodePrefix, formatBatchCode, todayInIST } from '@pk/shared';
import type { Db } from '../../src/config/db';
import { audit } from '../../src/modules/audit/audit.service';
import * as inventory from '../../src/modules/inventory/inventory.repository';
import { DEMO_PRODUCTS, DEMO_QUANTITY, DEMO_SHELF_LIFE_DAYS } from './fixtures';
import * as repo from './repository';

export type DemoAction = 'seed' | 'clear' | 'reset';

/** CLI-only local fixture workflow. Every stock write and its ledger/audit commit together. */
export async function runDemoCatalog(db: Db, action: DemoAction, options: { nodeEnv: string; kitchenCode?: string }) {
  if (!['development', 'test'].includes(options.nodeEnv))
    throw new Error('Demo data is only allowed in development/test.');
  return db.transaction(async (client) => {
    const owned = await repo.lockDemoSet(client);
    const targets = DEMO_PRODUCTS.filter(
      (p) => action === 'reset' || !owned.some((r) => r.product_id === p.id && !r.cleared_at),
    );
    const clearIds = action === 'seed' ? [] : owned.filter((r) => !r.cleared_at).map((r) => r.product_id);
    if (!clearIds.length && (action === 'clear' || !targets.length))
      return { created: 0, restored: 0, cleared: 0, skipped: owned.length };

    // No kitchen is needed for clear; use an existing admin for the audit actor.
    const admin = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'ADMIN' AND is_active ORDER BY created_at, id LIMIT 1",
    );
    if (!admin.rows[0]) throw new Error('An active admin is required. Run pnpm db:seed:staff first.');
    const adminId = admin.rows[0].id;
    const actors = action === 'clear' ? null : await repo.resolveActors(client, options.kitchenCode);

    if (clearIds.length) {
      const batches = await repo.lockBatchesForClear(client, clearIds);
      for (const b of batches) {
        if (!b.available_stock) continue;
        await inventory.setBatchStock(client, b.id, 0);
        await inventory.insertMovement(client, {
          batchId: b.id,
          type: 'ADJUSTMENT',
          quantityDelta: -b.available_stock,
          actorId: adminId,
          reason: 'Demo catalog clear: remove remaining sample stock',
        });
        await audit(client, {
          actorId: adminId,
          action: 'STOCK_ADJUST',
          entityType: 'inventory_batch',
          entityId: b.id,
          before: { availableStock: b.available_stock },
          after: { availableStock: 0, source: 'pickle-demo-v1' },
        });
      }
      await repo.archiveProducts(client, clearIds);
      for (const id of clearIds)
        await audit(client, {
          actorId: adminId,
          action: 'PRODUCT_UNPUBLISH',
          entityType: 'product',
          entityId: id,
          after: { source: 'pickle-demo-v1', cleared: true },
        });
    }
    let created = 0;
    let restored = 0;
    if (actors) {
      const manufacturedAt = todayInIST();
      for (const p of [...targets].sort((a, b) => a.id.localeCompare(b.id))) {
        const exists = owned.some((r) => r.product_id === p.id);
        await repo.writeProduct(client, p, exists);
        await audit(client, {
          actorId: adminId,
          action: exists ? 'PRODUCT_UPDATE' : 'PRODUCT_CREATE',
          entityType: 'product',
          entityId: p.id,
          after: { sku: p.sku, source: 'pickle-demo-v1' },
        });
        await audit(client, {
          actorId: adminId,
          action: 'PRODUCT_PUBLISH',
          entityType: 'product',
          entityId: p.id,
          after: { source: 'pickle-demo-v1' },
        });
        const prefix = batchCodePrefix(manufacturedAt, p.sku);
        const batchCode = formatBatchCode(manufacturedAt, p.sku, await inventory.nextBatchSeq(client, prefix));
        const batchId = await inventory.insertBatch(client, {
          productId: p.id,
          pickupLocationId: actors.kitchen.id,
          batchCode,
          manufacturedAt,
          shelfLifeDays: DEMO_SHELF_LIFE_DAYS,
          quantity: DEMO_QUANTITY,
          totalCostPaise: Math.round(p.price / 2) * DEMO_QUANTITY,
          createdById: adminId,
          notes: 'pickle-demo-v1: sample stock, not real production',
        });
        await inventory.insertMovement(client, {
          batchId,
          type: 'PRODUCTION',
          quantityDelta: DEMO_QUANTITY,
          actorId: adminId,
          reason: 'Demo catalog seed: sample stock',
        });
        await audit(client, {
          actorId: adminId,
          action: 'BATCH_CREATE',
          entityType: 'inventory_batch',
          entityId: batchId,
          after: { batchCode, productId: p.id, quantity: DEMO_QUANTITY, source: 'pickle-demo-v1' },
        });
        if (exists) restored++;
        else created++;
      }
    }
    return {
      created,
      restored,
      cleared: clearIds.length,
      skipped: action === 'seed' ? DEMO_PRODUCTS.length - targets.length : 0,
    };
  });
}
