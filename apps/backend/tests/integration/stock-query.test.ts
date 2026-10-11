import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { as, catalogActors } from '../helpers/catalog';
import { createPickupLocation, createProduct, insertBatchDirect } from '../helpers/factories';
import { buildTestApp } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let kitchen: { id: string };

// Default settings: min_remaining_shelf_days 45 + transit_buffer_days 7 → sellable buffer 52 days
const BUFFER = 52;
const IMG = (id: string) => [`products/${id}/00000000-0000-4000-8000-000000000000.webp`];

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  app = await buildTestApp({ db: t.db, redis });
  kitchen = await createPickupLocation(t.db);
  await t.db.query("UPDATE pickup_locations SET fssai_license_no = '10012345678901' WHERE id = $1", [kitchen.id]);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

async function liveProduct(overrides: Parameters<typeof createProduct>[1] = {}) {
  const p = await createProduct(t.db, overrides);
  await t.db.query('UPDATE products SET images = $2, is_active = TRUE WHERE id = $1', [p.id, IMG(p.id)]);
  return p;
}

const publicList = async () =>
  (await app.inject({ method: 'GET', url: '/api/v1/products' })).json().data.groups as {
    productGroup: string;
    variants: { id: string; sellableStock: number; stockBadge: string }[];
  }[];
const variant = async (id: string) => (await publicList()).flatMap((g) => g.variants).find((v) => v.id === id);

describe('storefront sellable stock (D-24)', () => {
  it('counts only batches with expiry >= today + buffer; NOT_SELLABLE and EXPIRED are excluded', async () => {
    const p = await liveProduct();
    await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 30,
      expiresInDays: BUFFER + 100,
    }); // FRESH
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 7, expiresInDays: BUFFER }); // AGING, boundary sellable
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 5, expiresInDays: BUFFER - 1 }); // NOT_SELLABLE
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 9, expiresInDays: 0 }); // EXPIRED
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 4, expiresInDays: -10 }); // EXPIRED

    expect((await variant(p.id))?.sellableStock).toBe(37);
  });

  it('returns 0 (not null) and SOLD_OUT for a live product with no batches', async () => {
    const p = await liveProduct();
    expect(await variant(p.id)).toMatchObject({ sellableStock: 0, stockBadge: 'SOLD_OUT' });
  });

  it('marks LOW_STOCK below settings.low_stock_threshold (20)', async () => {
    const low = await liveProduct();
    await insertBatchDirect(t.db, { productId: low.id, locationId: kitchen.id, quantity: 19, expiresInDays: 200 });
    const ok = await liveProduct();
    await insertBatchDirect(t.db, { productId: ok.id, locationId: kitchen.id, quantity: 20, expiresInDays: 200 });
    expect((await variant(low.id))?.stockBadge).toBe('LOW_STOCK');
    expect((await variant(ok.id))?.stockBadge).toBe('IN_STOCK');
  });

  it('follows the buffer when settings change', async () => {
    const p = await liveProduct();
    await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 11, expiresInDays: 40 });
    expect((await variant(p.id))?.sellableStock).toBe(0);
    await t.db.query("UPDATE settings SET value = '30' WHERE key = 'min_remaining_shelf_days'");
    const fresh = await buildTestApp({ db: t.db, redis }); // settings are cached per app instance (30 s)
    const groups = (await fresh.inject({ method: 'GET', url: '/api/v1/products' })).json().data.groups;
    await fresh.close();
    await t.db.query("UPDATE settings SET value = '45' WHERE key = 'min_remaining_shelf_days'");
    const v = groups
      .flatMap((g: { variants: { id: string }[] }) => g.variants)
      .find((x: { id: string }) => x.id === p.id);
    expect(v.sellableStock).toBe(11);
  });

  it('hides drafts, groups variants and sets cache headers', async () => {
    const group = `chicken-${Date.now()}`;
    const small = await liveProduct({ group, netWeightG: 250 });
    const big = await liveProduct({ group, netWeightG: 500 });
    const draft = await createProduct(t.db);
    const res = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(res.headers['cache-control']).toContain('public');
    const groups = res.json().data.groups as { productGroup: string; variants: { id: string }[] }[];
    expect(groups.find((g) => g.productGroup === group)?.variants.map((v) => v.id)).toEqual([small.id, big.id]);
    expect(groups.flatMap((g) => g.variants).some((v) => v.id === draft.id)).toBe(false);
  });
});

describe('GET /api/v1/products/:slug', () => {
  it('returns compliance detail, variants and the FIFO batch the next order ships from', async () => {
    const group = `mutton-${Date.now()}`;
    const p = await liveProduct({ group, netWeightG: 250 });
    const sibling = await liveProduct({ group, netWeightG: 500 });
    await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 10,
      expiresInDays: 300,
      code: 'PK-2610-LATER-01',
    });
    await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 10,
      expiresInDays: 120,
      code: 'PK-2609-SOONER-01',
    });
    await insertBatchDirect(t.db, {
      productId: p.id,
      locationId: kitchen.id,
      quantity: 10,
      expiresInDays: 20,
      code: 'PK-2601-UNSELL-01',
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/products/${p.slug}` });
    expect(res.statusCode).toBe(200);
    const product = res.json().data.product;
    expect(product.currentBatch.batchCode).toBe('PK-2609-SOONER-01');
    expect(product.fssaiLicenseNo).toBe('10012345678901');
    expect(product.sellableStock).toBe(20);
    expect(product.variants.map((v: { id: string }) => v.id)).toEqual([p.id, sibling.id]);
    expect(product.ingredients).toBeTruthy();
    expect(product.nutrition).toMatchObject({ energyKcal: 300, sodiumMg: 1400 });
  });

  it('404s for drafts and unknown slugs', async () => {
    const draft = await createProduct(t.db);
    expect((await app.inject({ method: 'GET', url: `/api/v1/products/${draft.slug}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/products/no-such-pickle' })).statusCode).toBe(404);
  });
});

describe('batch shelfStatus (computed, not stored)', () => {
  it('labels FRESH / AGING / NOT_SELLABLE / EXPIRED at the rule boundaries', async () => {
    const { adminJar } = await catalogActors(app, t.db);
    const p = await createProduct(t.db);
    const cases = [
      [BUFFER + 30, 'FRESH'],
      [BUFFER + 29, 'AGING'],
      [BUFFER, 'AGING'],
      [BUFFER - 1, 'NOT_SELLABLE'],
      [1, 'NOT_SELLABLE'],
      [0, 'EXPIRED'],
      [-5, 'EXPIRED'],
    ] as const;
    for (const [days] of cases) {
      await insertBatchDirect(t.db, { productId: p.id, locationId: kitchen.id, quantity: 1, expiresInDays: days });
    }
    const res = await as(app, adminJar).get(`/api/v1/batches?productId=${p.id}`);
    const body = res.json().data;
    expect(body.sellableBufferDays).toBe(BUFFER);
    // FIFO: soonest expiry first
    const got = body.batches.map((b: { daysToExpiry: number; shelfStatus: string }) => [b.daysToExpiry, b.shelfStatus]);
    expect(got).toEqual([...cases].reverse().map(([d, s]) => [d, s]));

    const aging = await as(app, adminJar).get(`/api/v1/batches?productId=${p.id}&status=AGING`);
    expect(aging.json().data.batches).toHaveLength(2);
  });
});
