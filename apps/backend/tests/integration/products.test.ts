import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { as, catalogActors, cookieHeader } from '../helpers/catalog';
import { createUser } from '../helpers/factories';
import { otpLogin } from '../helpers/session';
import { buildTestApp, fromBrowser, spyRevalidator, testAuthConfig } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let revalidator: ReturnType<typeof spyRevalidator>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const auth = testAuthConfig();

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  revalidator = spyRevalidator();
  app = await buildTestApp({ db: t.db, redis }, { revalidator, auth });
  actors = await catalogActors(app, t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});
beforeEach(() => revalidator.revalidate.mockClear());

let n = 0;
const draftBody = () => {
  n += 1;
  return {
    sku: `TST${n}${Date.now() % 100000}`,
    slug: `test-pickle-${n}-${Date.now()}`,
    productGroup: `test-group-${n}-${Date.now()}`,
    title: 'Himachali Chicken Pickle',
    description: 'Slow-cooked in mustard oil.',
    meatType: 'CHICKEN',
    netWeightG: 250,
    pricePaise: 44_900,
  };
};
const complianceFields = {
  gstRateBp: 500,
  shelfLifeDays: 180,
  ingredients: 'Chicken, mustard oil, garlic, spices',
  packedWeightG: 480,
  nutrition: { energyKcal: 310, proteinG: 18, fatG: 24, carbsG: 6, sugarG: 1, sodiumMg: 1450 },
};

async function uploadImage(productId: string) {
  const bytes = Buffer.from('RIFF....WEBPVP8 fake image bytes');
  const presign = await as(app, actors.adminJar).post('/api/v1/admin/uploads/product-image', {
    productId,
    contentType: 'image/webp',
    sizeBytes: bytes.length,
  });
  expect(presign.statusCode).toBe(200);
  const { key, uploadUrl, headers, publicUrl } = presign.json().data;
  const url = new URL(uploadUrl);
  const put = await app.inject({
    method: 'PUT',
    url: `${url.pathname}${url.search}`,
    headers: fromBrowser(headers),
    payload: bytes,
  });
  expect(put.statusCode).toBe(200);
  return { key: key as string, publicUrl: publicUrl as string, bytes };
}

describe('admin products — create / edit (ADMIN only)', () => {
  it('creates a draft with an audit row and purges the storefront cache tag', async () => {
    const res = await as(app, actors.adminJar).post('/api/v1/admin/products', draftBody());
    expect(res.statusCode).toBe(201);
    const product = res.json().data.product;
    expect(product).toMatchObject({ isActive: false, hsnCode: '2001', stock: { sellable: 0, onHand: 0 } });
    expect(product.missingForPublish).toEqual([
      'gstRateBp',
      'shelfLifeDays',
      'ingredients',
      'packedWeightG',
      'nutrition',
      'images',
    ]);
    expect(revalidator.revalidate).toHaveBeenCalledWith(['products']);
    const audit = await t.db.query("SELECT 1 FROM admin_audit_log WHERE action = 'PRODUCT_CREATE' AND entity_id = $1", [
      product.id,
    ]);
    expect(audit.rowCount).toBe(1);
  });

  it('returns 409 DUPLICATE naming the field for a reused SKU, slug or group+weight', async () => {
    const body = draftBody();
    const a = as(app, actors.adminJar);
    await a.post('/api/v1/admin/products', body);
    const sku = await a.post('/api/v1/admin/products', { ...draftBody(), sku: body.sku });
    expect(sku.statusCode).toBe(409);
    expect(sku.json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'sku' } });
    const slug = await a.post('/api/v1/admin/products', { ...draftBody(), slug: body.slug });
    expect(slug.json().error.details.field).toBe('slug');
    const weight = await a.post('/api/v1/admin/products', { ...draftBody(), productGroup: body.productGroup });
    expect(weight.json().error.details.field).toBe('netWeightG');
  });

  it('validates money and weights (paise integers, compare-at above price)', async () => {
    const a = as(app, actors.adminJar);
    expect((await a.post('/api/v1/admin/products', { ...draftBody(), pricePaise: 449.5 })).statusCode).toBe(400);
    expect((await a.post('/api/v1/admin/products', { ...draftBody(), comparePricePaise: 40_000 })).statusCode).toBe(
      400,
    );
    const created = (await a.post('/api/v1/admin/products', draftBody())).json().data.product;
    const patch = await a.patch(`/api/v1/admin/products/${created.id}`, { comparePricePaise: 40_000 });
    expect(patch.statusCode).toBe(422);
    expect(patch.json().error.details.field).toBe('comparePricePaise');
    // SKU is immutable (batch codes embed it): the key is ignored
    expect(
      (await a.patch(`/api/v1/admin/products/${created.id}`, { sku: 'NEWSKU', title: 'Renamed' })).statusCode,
    ).toBe(200);
    expect((await a.get(`/api/v1/admin/products/${created.id}`)).json().data.product.sku).toBe(created.sku);
  });

  it('forbids KITCHEN_PARTNER and customers (403) and anonymous (401)', async () => {
    expect((await as(app, actors.partnerJar).get('/api/v1/admin/products')).statusCode).toBe(403);
    const customer = await createUser(t.db);
    const { jar } = await otpLogin(app, customer.phone!, (p) => auth.otpProvider.lastCodeFor(p));
    expect((await as(app, jar).post('/api/v1/admin/products', draftBody())).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/products' })).statusCode).toBe(401);
  });
});

describe('publish / unpublish', () => {
  it('refuses to publish without GST, shelf life or an image (422 VALIDATION_FAILED)', async () => {
    const a = as(app, actors.adminJar);
    const product = (await a.post('/api/v1/admin/products', draftBody())).json().data.product;
    const bare = await a.post(`/api/v1/admin/products/${product.id}/publish`);
    expect(bare.statusCode).toBe(422);
    expect(bare.json().error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(bare.json().error.details.missing).toEqual(expect.arrayContaining(['gstRateBp', 'shelfLifeDays', 'images']));

    await a.patch(`/api/v1/admin/products/${product.id}`, complianceFields);
    const noImage = await a.post(`/api/v1/admin/products/${product.id}/publish`);
    expect(noImage.statusCode).toBe(422);
    expect(noImage.json().error.details.missing).toEqual(['images']);

    const { rows } = await t.db.query('SELECT is_active FROM products WHERE id = $1', [product.id]);
    expect(rows[0]).toEqual({ is_active: false });
  });

  it('publishes a complete product, shows it on the storefront, and revalidates on every change', async () => {
    const a = as(app, actors.adminJar);
    const product = (await a.post('/api/v1/admin/products', draftBody())).json().data.product;
    await a.patch(`/api/v1/admin/products/${product.id}`, complianceFields);
    const { key } = await uploadImage(product.id);
    await a.patch(`/api/v1/admin/products/${product.id}`, { images: [key] });
    revalidator.revalidate.mockClear();

    const published = await a.post(`/api/v1/admin/products/${product.id}/publish`);
    expect(published.statusCode).toBe(200);
    expect(published.json().data.product).toMatchObject({ isActive: true, missingForPublish: [] });
    expect(revalidator.revalidate).toHaveBeenCalledWith(['products']);
    expect((await app.inject({ method: 'GET', url: `/api/v1/products/${product.slug}` })).statusCode).toBe(200);

    // A live product can't lose a publish requirement
    const strip = await a.patch(`/api/v1/admin/products/${product.id}`, { images: [] });
    expect(strip.statusCode).toBe(422);
    expect(strip.json().error.details.missing).toEqual(['images']);

    revalidator.revalidate.mockClear();
    await a.patch(`/api/v1/admin/products/${product.id}`, { pricePaise: 47_900 });
    expect(revalidator.revalidate).toHaveBeenCalledWith(['products']);
    const pub = (await app.inject({ method: 'GET', url: `/api/v1/products/${product.slug}` })).json().data.product;
    expect(pub.pricePaise).toBe(47_900);

    const unpub = await a.post(`/api/v1/admin/products/${product.id}/unpublish`);
    expect(unpub.json().data.product.isActive).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/api/v1/products/${product.slug}` })).statusCode).toBe(404);
    const audits = await t.db.query<{ action: string }>(
      "SELECT action FROM admin_audit_log WHERE entity_id = $1 AND action LIKE 'PRODUCT_%' ORDER BY id",
      [product.id],
    );
    expect(audits.rows.map((r) => r.action)).toEqual([
      'PRODUCT_CREATE',
      'PRODUCT_UPDATE',
      'PRODUCT_UPDATE',
      'PRODUCT_PUBLISH',
      'PRODUCT_UPDATE',
      'PRODUCT_UNPUBLISH',
    ]);
  });
});

describe('product images (D-11)', () => {
  it('presigns an upload, stores the file and serves it from the public URL', async () => {
    const product = (await as(app, actors.adminJar).post('/api/v1/admin/products', draftBody())).json().data.product;
    const { key, publicUrl, bytes } = await uploadImage(product.id);
    expect(key).toMatch(new RegExp(`^products/${product.id}/[0-9a-f-]{36}\\.webp$`));
    const asset = await app.inject({ method: 'GET', url: new URL(publicUrl).pathname });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toBe('image/webp');
    expect(asset.rawPayload.equals(bytes)).toBe(true);
  });

  it('rejects disallowed types, oversize files, tampered tokens and foreign keys', async () => {
    const a = as(app, actors.adminJar);
    const product = (await a.post('/api/v1/admin/products', draftBody())).json().data.product;
    const presign = (body: object) => a.post('/api/v1/admin/uploads/product-image', { productId: product.id, ...body });
    expect((await presign({ contentType: 'image/gif', sizeBytes: 10 })).statusCode).toBe(400);
    expect((await presign({ contentType: 'image/png', sizeBytes: 6 * 1024 * 1024 })).statusCode).toBe(400);

    const { uploadUrl } = (await presign({ contentType: 'image/png', sizeBytes: 4 })).json().data;
    const url = new URL(uploadUrl);
    const wrongSize = await app.inject({
      method: 'PUT',
      url: `${url.pathname}${url.search}`,
      headers: fromBrowser({ 'content-type': 'image/png' }),
      payload: Buffer.from('12345'),
    });
    expect(wrongSize.statusCode).toBe(403);
    const tampered = await app.inject({
      method: 'PUT',
      url: `${url.pathname}?token=${url.searchParams.get('token')}x`,
      headers: fromBrowser({ 'content-type': 'image/png' }),
      payload: Buffer.from('1234'),
    });
    expect(tampered.statusCode).toBe(403);

    const other = (await a.post('/api/v1/admin/products', draftBody())).json().data.product;
    const foreign = await a.patch(`/api/v1/admin/products/${product.id}`, {
      images: [`products/${other.id}/00000000-0000-4000-8000-000000000000.webp`],
    });
    expect(foreign.statusCode).toBe(422);
  });

  it('partners cannot request upload URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/uploads/product-image',
      headers: fromBrowser({ cookie: cookieHeader(actors.partnerJar) }),
      payload: { productId: '00000000-0000-4000-8000-000000000000', contentType: 'image/webp', sizeBytes: 10 },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /batches/product-options and /partner/pickup-locations', () => {
  it('lists products for batch logging and scopes kitchens per role', async () => {
    const options = (await as(app, actors.partnerJar).get('/api/v1/batches/product-options')).json().data.products;
    expect(Array.isArray(options)).toBe(true);
    const partnerKitchens = (await as(app, actors.partnerJar).get('/api/v1/partner/pickup-locations')).json().data
      .locations;
    expect(partnerKitchens.map((l: { id: string }) => l.id)).toEqual([actors.kitchenA.id]);
    const adminKitchens = (await as(app, actors.adminJar).get('/api/v1/partner/pickup-locations')).json().data
      .locations;
    expect(adminKitchens.map((l: { id: string }) => l.id)).toEqual(
      expect.arrayContaining([actors.kitchenA.id, actors.kitchenB.id]),
    );
  });
});
