import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createPickupLocation, createProduct, insertBatchDirect } from '../helpers/factories';
import { buildTestApp, fromBrowser } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let kitchen: { id: string };

beforeAll(async () => {
  t = await createTestDb();
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

async function liveProduct(stock: number, pricePaise = 44_900) {
  const p = await createProduct(t.db, { pricePaise });
  await t.db.query(
    "UPDATE products SET images = ARRAY['products/' || id || '/a.webp'], is_active = TRUE WHERE id = $1",
    [p.id],
  );
  if (stock > 0)
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: stock, expiresInDays: 200 });
  return p;
}

/** Settings are cached per app instance, so settings tests use a fresh app. */
async function quote(items: { productId: string; quantity: number }[], on: FastifyInstance = app) {
  const res = await on.inject({
    method: 'POST',
    url: '/api/v1/cart/quote',
    headers: fromBrowser(),
    payload: { items },
  });
  expect(res.statusCode).toBe(200);
  return res.json().data;
}

describe('POST /api/v1/cart/quote (D-15)', () => {
  beforeEach(async () => {
    await t.db.query(
      "UPDATE settings SET value = 'null' WHERE key IN ('free_shipping_threshold_paise', 'flat_shipping_fee_paise')",
    );
  });

  it('prices from the DB: a price change shows up in the next quote', async () => {
    const p = await liveProduct(30, 44_900);
    const first = await quote([{ productId: p.id, quantity: 2 }]);
    expect(first.items[0]).toMatchObject({ unitPricePaise: 44_900, quantity: 2, lineTotalPaise: 89_800, issue: null });
    expect(first).toMatchObject({ subtotalPaise: 89_800, shippingFeePaise: 0, totalPaise: 89_800, maxQtyPerItem: 10 });

    await t.db.query('UPDATE products SET price_paise = 47_900 WHERE id = $1', [p.id]);
    const second = await quote([{ productId: p.id, quantity: 2 }]);
    expect(second.items[0]).toMatchObject({ unitPricePaise: 47_900, lineTotalPaise: 95_800 });
    expect(second.items[0].image).toMatch(/\/products\/.+\/a\.webp$/);
  });

  it('flags QTY_REDUCED when stock drops below the cart quantity, and OUT_OF_STOCK at zero', async () => {
    const p = await liveProduct(5);
    const reduced = await quote([{ productId: p.id, quantity: 8 }]);
    expect(reduced.items[0]).toMatchObject({
      requestedQuantity: 8,
      quantity: 5,
      availableQuantity: 5,
      issue: 'QTY_REDUCED',
    });

    await t.db.query('UPDATE inventory_batches SET available_stock = 0 WHERE product_id = $1', [p.id]);
    const sold = await quote([{ productId: p.id, quantity: 1 }]);
    expect(sold.items[0]).toMatchObject({ quantity: 0, lineTotalPaise: 0, issue: 'OUT_OF_STOCK' });
    expect(sold.subtotalPaise).toBe(0);
  });

  it('caps at max_qty_per_item and merges duplicate lines', async () => {
    const p = await liveProduct(50);
    const res = await quote([
      { productId: p.id, quantity: 7 },
      { productId: p.id, quantity: 6 },
    ]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ requestedQuantity: 13, quantity: 10, issue: 'QTY_REDUCED' });
  });

  it('ignores stock that is not sellable (D-24)', async () => {
    const p = await liveProduct(0);
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 9, expiresInDays: 20 });
    expect((await quote([{ productId: p.id, quantity: 1 }])).items[0].issue).toBe('OUT_OF_STOCK');
  });

  it('marks drafts and unknown products INACTIVE with quantity 0', async () => {
    const draft = await createProduct(t.db);
    const res = await quote([
      { productId: draft.id, quantity: 1 },
      { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
    ]);
    expect(res.items.map((l: { issue: string; quantity: number }) => [l.issue, l.quantity])).toEqual([
      ['INACTIVE', 0],
      ['INACTIVE', 0],
    ]);
    expect(res.items[1].title).toBeNull();
  });

  it('applies flat shipping below the free-shipping threshold (Q-03 settings)', async () => {
    await t.db.query("UPDATE settings SET value = '99900' WHERE key = 'free_shipping_threshold_paise'");
    await t.db.query("UPDATE settings SET value = '6000' WHERE key = 'flat_shipping_fee_paise'");
    const fresh = await buildTestApp({ db: t.db, redis });
    const p = await liveProduct(30, 44_900);
    const below = await quote([{ productId: p.id, quantity: 2 }], fresh);
    expect(below).toMatchObject({
      subtotalPaise: 89_800,
      shippingFeePaise: 6000,
      totalPaise: 95_800,
      freeShippingThresholdPaise: 99_900,
      freeShippingRemainingPaise: 10_100,
    });
    const above = await quote([{ productId: p.id, quantity: 3 }], fresh);
    expect(above).toMatchObject({ shippingFeePaise: 0, freeShippingRemainingPaise: 0, totalPaise: 134_700 });
    await fresh.close();
  });

  it('validates the body (400) and accepts an empty cart', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/cart/quote',
      headers: fromBrowser(),
      payload: { items: [{ productId: 'nope', quantity: 0 }] },
    });
    expect(bad.statusCode).toBe(400);
    expect(await quote([])).toMatchObject({ items: [], subtotalPaise: 0, totalPaise: 0 });
  });
});

describe('GET /api/v1/products freshestBatch', () => {
  it('reports the most recently made sellable batch of a live product', async () => {
    const p = await liveProduct(0);
    await t.db.query(
      `INSERT INTO inventory_batches (product_id, pickup_location_id, batch_code, manufactured_at, expiry_date,
                                      initial_quantity, available_stock, total_cost_paise)
       VALUES ($1, $2, 'PK-2610-FRESH-01', ist_today(), ist_today() + 200, 5, 5, 0)`,
      [p.id, kitchen.id],
    );
    const res = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json().data;
    expect(res.freshestBatch).toMatchObject({ batchCode: 'PK-2610-FRESH-01', productTitle: 'Test Pickle' });
  });
});
