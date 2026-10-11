import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createInventoryService } from '../../src/modules/inventory/inventory.service';
import { createSettingsService } from '../../src/modules/settings/settings.service';
import { as, catalogActors } from '../helpers/catalog';
import { createProduct } from '../helpers/factories';
import { buildTestApp } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  // Property test makes ~150 requests; lift the global limit so it measures the ledger, not the limiter
  app = await buildTestApp({ db: t.db, redis }, { rateLimit: { max: 10_000, windowMs: 60_000 } });
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

/** Small deterministic PRNG so a failure is reproducible from the printed seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ledger invariant: available_stock = SUM(quantity_delta)', () => {
  it('holds after batch creation + 50 random adjustments (valid and invalid)', async () => {
    const seed = Number(process.env.LEDGER_SEED ?? Date.now() % 1_000_000);
    const rand = mulberry32(seed);
    const { adminJar, kitchenA } = await catalogActors(app, t.db);
    const client = as(app, adminJar);

    const batchIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const product = await createProduct(t.db);
      const res = await client.post('/api/v1/batches', {
        productId: product.id,
        quantity: 30 + i * 10,
        totalCostPaise: 0,
        pickupLocationId: kitchenA.id,
      });
      batchIds.push(res.json().data.batch.id);
    }

    const statuses: Record<number, number> = {};
    for (let i = 0; i < 50; i++) {
      const batchId = batchIds[Math.floor(rand() * batchIds.length)]!;
      const magnitude = 1 + Math.floor(rand() * 25);
      const wastage = rand() < 0.5;
      const res = await client.post(`/api/v1/batches/${batchId}/adjustments`, {
        type: wastage ? 'WASTAGE' : 'ADJUSTMENT',
        quantityDelta: wastage ? -magnitude : rand() < 0.5 ? magnitude : -magnitude,
        reason: `random adjustment ${i}`,
      });
      statuses[res.statusCode] = (statuses[res.statusCode] ?? 0) + 1;
      expect([200, 409], `seed ${seed}, step ${i}`).toContain(res.statusCode);
    }

    const inventory = createInventoryService({
      db: t.db,
      settings: createSettingsService(),
      revalidator: { revalidate: async () => undefined },
    });
    expect(await inventory.findLedgerMismatches(t.db, batchIds), `seed ${seed}`).toEqual([]);
    expect(await inventory.findLedgerMismatches(t.db), `seed ${seed}`).toEqual([]);
    // Both paths were exercised (bounds rejections included) — otherwise the test proves little
    expect(statuses[200], `seed ${seed}`).toBeGreaterThan(0);

    const { rows } = await t.db.query<{ ok: boolean }>(
      `SELECT bool_and(available_stock BETWEEN 0 AND initial_quantity) AS ok FROM inventory_batches WHERE id = ANY($1)`,
      [batchIds],
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it('flags a batch whose stock was changed without a movement', async () => {
    const { adminJar, kitchenA } = await catalogActors(app, t.db);
    const product = await createProduct(t.db);
    const res = await as(app, adminJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 10,
      totalCostPaise: 0,
      pickupLocationId: kitchenA.id,
    });
    const id = res.json().data.batch.id as string;
    await t.db.query('UPDATE inventory_batches SET available_stock = 7 WHERE id = $1', [id]); // the bug we guard against
    const inventory = createInventoryService({
      db: t.db,
      settings: createSettingsService(),
      revalidator: { revalidate: async () => undefined },
    });
    expect(await inventory.findLedgerMismatches(t.db, [id])).toEqual([
      { batchId: id, availableStock: 7, ledgerSum: 10 },
    ]);
  });
});
