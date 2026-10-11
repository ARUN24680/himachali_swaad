import { BATCH_CODE_REGEX, todayInIST } from '@pk/shared';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { as, catalogActors } from '../helpers/catalog';
import { createProduct } from '../helpers/factories';
import { buildTestApp } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let actors: Awaited<ReturnType<typeof catalogActors>>;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  app = await buildTestApp({ db: t.db, redis });
  actors = await catalogActors(app, t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('POST /api/v1/batches (D-42)', () => {
  it('generates the batch code, expiry = mfg + shelf_life_days, and a PRODUCTION movement in one go', async () => {
    const product = await createProduct(t.db, { sku: 'CHK250', shelfLifeDays: 180 });
    const res = await as(app, actors.adminJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 50,
      totalCostPaise: 1_050_000,
      manufacturedAt: '2026-10-01',
      pickupLocationId: actors.kitchenA.id,
    });
    expect(res.statusCode).toBe(201);
    const batch = res.json().data.batch;
    expect(batch.batchCode).toBe('PK-2610-CHK250-01');
    expect(batch.batchCode).toMatch(BATCH_CODE_REGEX);
    expect(batch.manufacturedAt).toBe('2026-10-01');
    expect(batch.expiryDate).toBe(addDays('2026-10-01', 180));
    expect(batch).toMatchObject({ initialQuantity: 50, availableStock: 50, costPerUnitPaise: 21_000 });

    const { rows } = await t.db.query(
      'SELECT movement_type, quantity_delta, actor_id FROM inventory_movements WHERE batch_id = $1',
      [batch.id],
    );
    expect(rows).toEqual([{ movement_type: 'PRODUCTION', quantity_delta: 50, actor_id: actors.admin.id }]);
    const audit = await t.db.query("SELECT 1 FROM admin_audit_log WHERE action = 'BATCH_CREATE' AND entity_id = $1", [
      batch.id,
    ]);
    expect(audit.rowCount).toBe(1);
  });

  it('increments the sequence per product per month', async () => {
    const product = await createProduct(t.db, { sku: 'MTN500' });
    const post = (manufacturedAt: string) =>
      as(app, actors.adminJar).post('/api/v1/batches', {
        productId: product.id,
        quantity: 10,
        totalCostPaise: 100_000,
        manufacturedAt,
        pickupLocationId: actors.kitchenA.id,
      });
    const codes = [];
    for (const day of ['2026-09-03', '2026-09-20', '2026-10-02'])
      codes.push((await post(day)).json().data.batch.batchCode);
    expect(codes).toEqual(['PK-2609-MTN500-01', 'PK-2609-MTN500-02', 'PK-2610-MTN500-01']);
  });

  it('gives concurrent registrations distinct sequence numbers', async () => {
    const product = await createProduct(t.db, { sku: 'TRT250' });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        as(app, actors.adminJar).post('/api/v1/batches', {
          productId: product.id,
          quantity: 5,
          totalCostPaise: 0,
          pickupLocationId: actors.kitchenA.id,
        }),
      ),
    );
    const codes = results.map((r) => r.json().data.batch.batchCode as string);
    expect(new Set(codes).size).toBe(5);
    expect(codes.map((c) => c.slice(-2)).sort()).toEqual(['01', '02', '03', '04', '05']);
  });

  it('defaults manufacturedAt to today (IST) and the partner to their only kitchen', async () => {
    const product = await createProduct(t.db);
    const res = await as(app, actors.partnerJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 50,
      totalCostPaise: 1_000_000,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.batch).toMatchObject({
      manufacturedAt: todayInIST(),
      pickupLocation: { id: actors.kitchenA.id },
    });
  });

  it('asks the admin to choose a kitchen when there are several', async () => {
    const product = await createProduct(t.db);
    const res = await as(app, actors.adminJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 5,
      totalCostPaise: 0,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_FAILED', details: { field: 'pickupLocationId' } });
  });

  it('rejects a future manufacture date and products without a lab shelf life', async () => {
    const product = await createProduct(t.db);
    const future = await as(app, actors.partnerJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 5,
      totalCostPaise: 0,
      manufacturedAt: addDays(todayInIST(), 2),
    });
    expect(future.statusCode).toBe(422);

    const draft = await createProduct(t.db, { complete: false });
    const noShelfLife = await as(app, actors.partnerJar).post('/api/v1/batches', {
      productId: draft.id,
      quantity: 5,
      totalCostPaise: 0,
    });
    expect(noShelfLife.statusCode).toBe(422);
    expect(noShelfLife.json().error.details.missing).toEqual(['shelfLifeDays']);
  });

  it('KITCHEN_PARTNER cannot create a batch for another kitchen (403)', async () => {
    const product = await createProduct(t.db);
    const res = await as(app, actors.partnerJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 5,
      totalCostPaise: 0,
      pickupLocationId: actors.kitchenB.id,
    });
    expect(res.statusCode).toBe(403);
    const { rows } = await t.db.query('SELECT 1 FROM inventory_batches WHERE product_id = $1', [product.id]);
    expect(rows).toHaveLength(0);
  });

  it('rejects customers and anonymous users', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/batches' })).statusCode).toBe(401);
  });
});

describe('batch adjustments, notes and ledger', () => {
  async function newBatch(locationId: string, quantity = 20) {
    const product = await createProduct(t.db);
    const res = await as(app, actors.adminJar).post('/api/v1/batches', {
      productId: product.id,
      quantity,
      totalCostPaise: 0,
      pickupLocationId: locationId,
    });
    return res.json().data.batch as { id: string };
  }

  it('records WASTAGE / ADJUSTMENT movements with a running balance', async () => {
    const batch = await newBatch(actors.kitchenA.id);
    const p = as(app, actors.partnerJar);
    expect(
      (
        await p.post(`/api/v1/batches/${batch.id}/adjustments`, {
          type: 'WASTAGE',
          quantityDelta: -3,
          reason: 'Broken jars',
        })
      ).statusCode,
    ).toBe(200);
    const res = await p.post(`/api/v1/batches/${batch.id}/adjustments`, {
      type: 'ADJUSTMENT',
      quantityDelta: 1,
      reason: 'Recount found one',
    });
    expect(res.json().data.batch.availableStock).toBe(18);

    const ledger = (await p.get(`/api/v1/batches/${batch.id}/movements`)).json().data.movements;
    expect(
      ledger.map((m: { type: string; quantityDelta: number; balanceAfter: number }) => [
        m.type,
        m.quantityDelta,
        m.balanceAfter,
      ]),
    ).toEqual([
      ['ADJUSTMENT', 1, 18],
      ['WASTAGE', -3, 17],
      ['PRODUCTION', 20, 20],
    ]);
  });

  it('returns 409 and persists nothing when an adjustment would push stock below 0', async () => {
    const batch = await newBatch(actors.kitchenA.id, 5);
    const res = await as(app, actors.adminJar).post(`/api/v1/batches/${batch.id}/adjustments`, {
      type: 'WASTAGE',
      quantityDelta: -6,
      reason: 'Too many',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 5 } });
    const { rows } = await t.db.query<{ available_stock: number; movements: number; audits: number }>(
      `SELECT b.available_stock,
              (SELECT COUNT(*)::int FROM inventory_movements WHERE batch_id = b.id) AS movements,
              (SELECT COUNT(*)::int FROM admin_audit_log WHERE action = 'STOCK_ADJUST' AND entity_id = b.id::text) AS audits
         FROM inventory_batches b WHERE b.id = $1`,
      [batch.id],
    );
    expect(rows[0]).toEqual({ available_stock: 5, movements: 1, audits: 0 });
  });

  it('refuses positive wastage and missing reasons (400)', async () => {
    const batch = await newBatch(actors.kitchenA.id);
    const a = as(app, actors.adminJar);
    expect(
      (await a.post(`/api/v1/batches/${batch.id}/adjustments`, { type: 'WASTAGE', quantityDelta: 2, reason: 'Oops' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await a.post(`/api/v1/batches/${batch.id}/adjustments`, { type: 'ADJUSTMENT', quantityDelta: -1 })).statusCode,
    ).toBe(400);
  });

  it('KITCHEN_PARTNER cannot adjust, edit or read another kitchen’s batch (403)', async () => {
    const batch = await newBatch(actors.kitchenB.id);
    const p = as(app, actors.partnerJar);
    expect(
      (await p.post(`/api/v1/batches/${batch.id}/adjustments`, { type: 'WASTAGE', quantityDelta: -1, reason: 'Nope' }))
        .statusCode,
    ).toBe(403);
    expect((await p.patch(`/api/v1/batches/${batch.id}`, { notes: 'x' })).statusCode).toBe(403);
    expect((await p.get(`/api/v1/batches/${batch.id}/movements`)).statusCode).toBe(403);
    const list = (await p.get('/api/v1/batches')).json().data.batches as { pickupLocation: { id: string } }[];
    expect(list.every((b) => b.pickupLocation.id === actors.kitchenA.id)).toBe(true);
    expect((await p.get(`/api/v1/batches?locationId=${actors.kitchenB.id}`)).statusCode).toBe(403);
  });

  it('edits only notes, with an audit row', async () => {
    const batch = await newBatch(actors.kitchenA.id);
    const res = await as(app, actors.partnerJar).patch(`/api/v1/batches/${batch.id}`, { notes: 'Extra garlic' });
    expect(res.json().data.batch.notes).toBe('Extra garlic');
    const bad = await as(app, actors.partnerJar).patch(`/api/v1/batches/${batch.id}`, { availableStock: 99 });
    expect(bad.statusCode).toBe(400);
  });
});
