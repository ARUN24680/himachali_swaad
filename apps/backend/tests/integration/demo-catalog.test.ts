import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterEach, beforeEach, expect, inject, it } from 'vitest';
import { DEMO_PRODUCTS, DEMO_QUANTITY } from '../../scripts/demo-catalog/fixtures';
import { runDemoCatalog } from '../../scripts/demo-catalog/service';
import { listProducts } from '../../src/modules/catalog/catalog.repository';
import { findLedgerMismatches, listProductOptions } from '../../src/modules/inventory/inventory.repository';
import { as, catalogActors } from '../helpers/catalog';
import { liveProduct, payAtGateway, placeOrder, verify } from '../helpers/checkout';
import { createProduct } from '../helpers/factories';
import { buildTestApp, fromBrowser, testGateway } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: ReturnType<typeof testGateway>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const opts = () => ({ nodeEnv: 'test', kitchenCode: actors.kitchenA.code });

beforeEach(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  gateway = testGateway(redis);
  app = await buildTestApp({ db: t.db, redis }, { gateway });
  actors = await catalogActors(app, t.db);
});
afterEach(async () => {
  await app?.close();
  await redis?.quit();
  await t?.destroy();
});

it('publishes ten stocked products to admin/storefront/cart, and concurrent reseeding preserves edits and stock', async () => {
  const original = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
  const before = (await t.db.query('SELECT * FROM products WHERE id = $1', [original.id])).rows;
  const results = await Promise.all([runDemoCatalog(t.db, 'seed', opts()), runDemoCatalog(t.db, 'seed', opts())]);
  expect(results.map((r) => r.created).sort()).toEqual([0, 10]);
  const res = await app.inject({ method: 'GET', url: '/api/v1/products' });
  expect(res.statusCode).toBe(200);
  const cards = res
    .json()
    .data.groups.flatMap(
      (g: { variants: { sku: string; title: string; images: string[]; sellableStock: number }[] }) => g.variants,
    );
  expect(cards.filter((p: { title: string }) => p.title.endsWith('(Demo)'))).toHaveLength(10);
  for (const p of cards.filter((p: { title: string }) => p.title.endsWith('(Demo)'))) {
    expect(p.sellableStock).toBe(DEMO_QUANTITY);
    expect(p.images[0]).toMatch(/\/products\/d30c.+\/demo-v1.png$/);
  }
  const admin = await as(app, actors.adminJar).get('/api/v1/admin/products');
  expect(admin.statusCode).toBe(200);
  expect(admin.json().data.products.filter((p: { sku: string }) => p.sku.startsWith('DEMO'))).toHaveLength(10);
  const quote = await app.inject({
    method: 'POST',
    url: '/api/v1/cart/quote',
    headers: fromBrowser(),
    payload: { items: [{ productId: DEMO_PRODUCTS[0]!.id, quantity: 2 }] },
  });
  expect(quote.statusCode).toBe(200);
  expect(quote.json().data.items[0]).toMatchObject({ quantity: 2, unitPricePaise: 44900, issue: null });
  await t.db.query('UPDATE products SET title = $2 WHERE id = $1', [DEMO_PRODUCTS[0]!.id, 'My admin edit']);
  expect((await runDemoCatalog(t.db, 'seed', opts())).skipped).toBe(10);
  expect((await t.db.query('SELECT title FROM products WHERE id = $1', [DEMO_PRODUCTS[0]!.id])).rows[0]!.title).toBe(
    'My admin edit',
  );
  expect((await t.db.query('SELECT * FROM products WHERE id = $1', [original.id])).rows).toEqual(before);
  expect(await findLedgerMismatches(t.db)).toEqual([]);
});

it('clear hides only owned fixtures; reinsert/reset retain IDs and immutable history without duplicating available stock', async () => {
  const original = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
  const before = (await t.db.query('SELECT * FROM products WHERE id = $1', [original.id])).rows;
  await runDemoCatalog(t.db, 'seed', opts());
  expect((await runDemoCatalog(t.db, 'clear', opts())).cleared).toBe(10);
  expect((await listProducts(t.db, { activeOnly: false })).map((p) => p.id)).toEqual([original.id]);
  expect((await listProductOptions(t.db)).map((p) => p.id)).toEqual([original.id]);
  expect((await app.inject({ method: 'GET', url: `/api/v1/products/${DEMO_PRODUCTS[0]!.slug}` })).statusCode).toBe(404);
  expect((await runDemoCatalog(t.db, 'clear', opts())).cleared).toBe(0);
  expect((await runDemoCatalog(t.db, 'seed', opts())).restored).toBe(10);
  expect((await runDemoCatalog(t.db, 'reset', opts())).restored).toBe(10);
  const stock = await t.db.query(
    'SELECT SUM(available_stock)::int AS qty, COUNT(*)::int AS batches FROM inventory_batches WHERE product_id = ANY($1::uuid[])',
    [DEMO_PRODUCTS.map((p) => p.id)],
  );
  expect(stock.rows[0]).toEqual({ qty: 320, batches: 30 });
  expect((await t.db.query('SELECT * FROM products WHERE id = $1', [original.id])).rows).toEqual(before);
  expect(await findLedgerMismatches(t.db)).toEqual([]);
  await expect(
    t.db.query(
      'DELETE FROM inventory_movements WHERE batch_id IN (SELECT id FROM inventory_batches WHERE product_id = $1)',
      [DEMO_PRODUCTS[0]!.id],
    ),
  ).rejects.toThrow();
});

it('refuses unowned SKU collisions and ambiguous kitchens without partially seeding', async () => {
  await expect(runDemoCatalog(t.db, 'seed', { nodeEnv: 'test' })).rejects.toThrow('DEMO_KITCHEN_CODE');
  expect((await t.db.query('SELECT * FROM demo_catalog_products')).rowCount).toBe(0);
  const original = await createProduct(t.db, { sku: DEMO_PRODUCTS[9]!.sku });
  await expect(runDemoCatalog(t.db, 'seed', opts())).rejects.toThrow('unowned');
  expect((await t.db.query('SELECT id FROM products')).rows).toEqual([{ id: original.id }]);
});

it('blocks clear/reset with a live checkout reservation, leaving the order, stock and fixtures intact', async () => {
  await runDemoCatalog(t.db, 'seed', opts());
  const order = await placeOrder(app, [{ productId: DEMO_PRODUCTS[0]!.id, quantity: 1 }]);
  expect(order.statusCode).toBe(201);
  const before = (await t.db.query('SELECT * FROM orders')).rows;
  for (const action of ['clear', 'reset'] as const)
    await expect(runDemoCatalog(t.db, action, opts())).rejects.toThrow('unfinished orders');
  expect((await t.db.query('SELECT * FROM orders')).rows).toEqual(before);
  expect((await t.db.query('SELECT SUM(available_stock)::int AS qty FROM inventory_batches')).rows[0]!.qty).toBe(319);
  expect((await t.db.query('SELECT * FROM demo_catalog_products WHERE cleared_at IS NOT NULL')).rowCount).toBe(0);
  expect(await findLedgerMismatches(t.db)).toEqual([]);
  const { verifyBody } = await payAtGateway(gateway, order.json().data.razorpayOrderId);
  expect((await verify(app, verifyBody)).json().data.status).toBe('CONFIRMED');
  await expect(runDemoCatalog(t.db, 'clear', opts())).rejects.toThrow('unfinished orders');
  const cancelled = await as(app, actors.adminJar).post(`/api/v1/admin/orders/${order.json().data.orderCode}/cancel`, {
    reason: 'Finish demo test order',
  });
  expect(cancelled.statusCode).toBe(200);
  const history = (await t.db.query('SELECT * FROM orders')).rows;
  expect((await runDemoCatalog(t.db, 'reset', opts())).restored).toBe(10);
  expect((await t.db.query('SELECT * FROM orders')).rows).toEqual(history);
  expect((await t.db.query('SELECT COUNT(*)::int AS n FROM order_items')).rows[0]!.n).toBe(1);
  expect(await findLedgerMismatches(t.db)).toEqual([]);
});

it('refuses production before touching data', async () => {
  await expect(runDemoCatalog(t.db, 'seed', { nodeEnv: 'production' })).rejects.toThrow('development/test');
  expect((await t.db.query('SELECT * FROM products')).rowCount).toBe(0);
});
