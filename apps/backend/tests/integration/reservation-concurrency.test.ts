import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPickupLocation, createProduct, insertBatchDirect } from '../helpers/factories';
import { batchStock, liveProduct, orderBody, orderRow, placeOrder } from '../helpers/checkout';
import { buildTestApp } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Phase 5 verification: zero overselling, no deadlocks, FIFO split, idempotency (07 §4.1, D-22/23/24). */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let kitchen: { id: string };

beforeAll(async () => {
  // Pool larger than the parallelism so contention happens on row locks, not on connections
  t = await createTestDb({ max: 30 });
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  app = await buildTestApp({ db: t.db, redis });
  kitchen = await createPickupLocation(t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const ledgerMismatches = async () =>
  (
    await t.db.query(
      `SELECT b.id FROM inventory_batches b LEFT JOIN inventory_movements m ON m.batch_id = b.id
        GROUP BY b.id HAVING b.available_stock <> COALESCE(SUM(m.quantity_delta), 0)`,
    )
  ).rowCount;

describe('reservation concurrency (Phase 5 checklist)', () => {
  it('10 parallel checkouts for the last jar → exactly one 201, nine 409 OUT_OF_STOCK, stock 0, ledger intact', async () => {
    const p = await liveProduct(t.db, kitchen.id, { stock: 1 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => placeOrder(app, [{ productId: p.id, quantity: 1 }])),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(9);
    for (const r of results.filter((x) => x.statusCode === 409)) {
      expect(r.json().error).toMatchObject({ code: 'OUT_OF_STOCK', details: { productId: p.id, available: 0 } });
    }
    expect(await batchStock(t.db, p.batchId!)).toBe(0);
    expect(await ledgerMismatches()).toBe(0);
    const { rows } = await t.db.query("SELECT COUNT(*)::int AS n FROM orders WHERE status = 'PENDING_PAYMENT'");
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('multi-item orders in opposite product order, 50 parallel → zero deadlocks, stock exact', async () => {
    const a = await liveProduct(t.db, kitchen.id, { stock: 500 });
    const b = await liveProduct(t.db, kitchen.id, { stock: 500 });
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        placeOrder(
          app,
          i % 2 === 0
            ? [
                { productId: a.id, quantity: 1 },
                { productId: b.id, quantity: 2 },
              ]
            : [
                { productId: b.id, quantity: 2 },
                { productId: a.id, quantity: 1 },
              ],
        ),
      ),
    );
    const failures = results.filter((r) => r.statusCode !== 201).map((r) => r.json().error);
    expect(failures).toEqual([]); // a deadlock would surface as 500 INTERNAL_ERROR
    expect(await batchStock(t.db, a.batchId!)).toBe(500 - 50);
    expect(await batchStock(t.db, b.batchId!)).toBe(500 - 100);
    expect(await ledgerMismatches()).toBe(0);
  });

  it('splits across batches, earliest expiry first, and never touches a NOT_SELLABLE batch', async () => {
    const p = await createProduct(t.db);
    await t.db.query(
      "UPDATE products SET images = ARRAY['products/' || id || '/a.webp'], is_active = TRUE WHERE id = $1",
      [p.id],
    );
    const later = await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 3,
      expiresInDays: 300,
    });
    const sooner = await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 3,
      expiresInDays: 120,
    });
    // 45 + 7 = 52-day buffer: a batch expiring in 30 days must never be sold
    const notSellable = await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 9,
      expiresInDays: 30,
    });

    const res = await placeOrder(app, [{ productId: p.id, quantity: 5 }]);
    expect(res.statusCode).toBe(201);
    const order = await orderRow(t.db, res.json().data.orderCode);
    const { rows } = await t.db.query(
      `SELECT a.batch_id, a.quantity, a.status FROM order_item_allocations a
         JOIN order_items oi ON oi.id = a.order_item_id
        WHERE oi.order_id = $1 ORDER BY a.created_at, a.quantity DESC`,
      [order.id],
    );
    expect(rows).toEqual([
      { batch_id: sooner, quantity: 3, status: 'RESERVED' },
      { batch_id: later, quantity: 2, status: 'RESERVED' },
    ]);
    expect(await batchStock(t.db, sooner)).toBe(0);
    expect(await batchStock(t.db, later)).toBe(1);
    expect(await batchStock(t.db, notSellable)).toBe(9);

    // 1 sellable jar left (9 on hand are NOT_SELLABLE) → asking for 2 is OUT_OF_STOCK
    const tooMany = await placeOrder(app, [{ productId: p.id, quantity: 2 }]);
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error.details).toMatchObject({ productId: p.id, available: 1 });
  });

  it('same Idempotency-Key twice (sequential and concurrent) → one order, stock reserved once', async () => {
    const p = await liveProduct(t.db, kitchen.id, { stock: 10 });
    const key = randomUUID();
    const body = orderBody([{ productId: p.id, quantity: 2 }]);
    const first = await placeOrder(app, [], { key, body });
    const again = await placeOrder(app, [], { key, body });
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.json().data).toEqual(first.json().data);

    const key2 = randomUUID();
    const body2 = orderBody([{ productId: p.id, quantity: 3 }]);
    const burst = await Promise.all(Array.from({ length: 5 }, () => placeOrder(app, [], { key: key2, body: body2 })));
    expect(new Set(burst.map((r) => r.json().data?.orderCode)).size).toBe(1);
    expect(burst.every((r) => r.statusCode === 201)).toBe(true);

    expect(await batchStock(t.db, p.batchId!)).toBe(10 - 2 - 3);
    const { rows } = await t.db.query('SELECT COUNT(*)::int AS n FROM orders WHERE idempotency_key = ANY($1)', [
      [key, key2],
    ]);
    expect(rows[0]!.n).toBe(2);
  });

  it('same key with a different cart → 409 IDEMPOTENCY_CONFLICT', async () => {
    const p = await liveProduct(t.db, kitchen.id, { stock: 10 });
    const key = randomUUID();
    const body = orderBody([{ productId: p.id, quantity: 1 }]);
    expect((await placeOrder(app, [], { key, body })).statusCode).toBe(201);
    const changed = await placeOrder(app, [], { key, body: { ...body, items: [{ productId: p.id, quantity: 4 }] } });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
