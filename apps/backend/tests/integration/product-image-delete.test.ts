import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createWebPushSender } from '../../src/integrations/push/web-push';
import type { ObjectStorage } from '../../src/integrations/storage/storage';
import { createProcessors } from '../../src/jobs/processors';
import { createSweepers } from '../../src/jobs/sweepers';
import { createCommerceServices } from '../../src/services';
import { as, catalogActors } from '../helpers/catalog';
import { TEST_COURIER_TOKEN, unreachableShiprocket } from '../helpers/shiprocket';
import {
  buildTestApp,
  fakeReporter,
  fromBrowser,
  recordingJobs,
  spyRevalidator,
  testGateway,
  testMessaging,
  testPrivateStorage,
  testStorage,
} from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Product image removal (D-11 public images): PATCH images that drops a key → after COMMIT one
 * DELETE_PRODUCT_IMAGE job per dropped key → the worker processor deletes the object unless a
 * product still lists the key. Jobs are recorded, then run through the real processors.
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const jobs = recordingJobs();
const storage = testStorage();
let processors: ReturnType<typeof createProcessors>;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  app = await buildTestApp({ db: t.db, redis }, { jobs, storage });
  actors = await catalogActors(app, t.db);
  const reporter = fakeReporter();
  const gateway = testGateway(redis);
  const svc = createCommerceServices({
    db: t.db,
    redis,
    logger: silentLogger(),
    reporter,
    storage,
    privateStorage: testPrivateStorage(),
    revalidator: spyRevalidator(),
    gateway,
    jobs,
    allowDraftInvoice: true,
    shiprocket: unreachableShiprocket(),
    courierWebhookToken: TEST_COURIER_TOKEN,
    push: createWebPushSender({}),
    messaging: testMessaging(redis),
  });
  const sweepers = createSweepers({ db: t.db, svc, gateway, jobs, logger: silentLogger(), reporter });
  processors = createProcessors({ db: t.db, svc, sweepers, logger: silentLogger() });
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});
beforeEach(() => jobs.clear());

let n = 0;
async function draftProduct(): Promise<string> {
  n += 1;
  const stamp = `${n}${Date.now() % 100000}`;
  const res = await as(app, actors.adminJar).post('/api/v1/admin/products', {
    sku: `IMG${stamp}`,
    slug: `img-pickle-${stamp}`,
    productGroup: `img-group-${stamp}`,
    title: 'Himachali Mutton Pickle',
    description: 'Slow-cooked in mustard oil.',
    meatType: 'MUTTON',
    netWeightG: 250,
    pricePaise: 54_900,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.product.id as string;
}

async function uploadImage(productId: string): Promise<string> {
  const bytes = Buffer.from('RIFF....WEBPVP8 fake image bytes');
  const presign = await as(app, actors.adminJar).post('/api/v1/admin/uploads/product-image', {
    productId,
    contentType: 'image/webp',
    sizeBytes: bytes.length,
  });
  expect(presign.statusCode).toBe(200);
  const { key, uploadUrl, headers } = presign.json().data;
  const url = new URL(uploadUrl);
  const put = await app.inject({
    method: 'PUT',
    url: `${url.pathname}${url.search}`,
    headers: fromBrowser(headers),
    payload: bytes,
  });
  expect(put.statusCode).toBe(200);
  return key as string;
}

const setImages = (productId: string, images: string[]) =>
  as(app, actors.adminJar).patch(`/api/v1/admin/products/${productId}`, { images });

const deleteJobs = () => jobs.jobs.filter((j) => j.name === 'DELETE_PRODUCT_IMAGE');
const runDeleteJobs = () =>
  Promise.all(deleteJobs().map((j) => processors.DELETE_PRODUCT_IMAGE(j.data as { key: string }, undefined as never)));
const exists = async (key: string) => (await storage.read(key)) !== null;

describe('PATCH images → DELETE_PRODUCT_IMAGE', () => {
  it('enqueues one delete per removed key after commit, and the processor removes the object', async () => {
    const id = await draftProduct();
    const [a, b, c] = [await uploadImage(id), await uploadImage(id), await uploadImage(id)];
    expect((await setImages(id, [a, b, c])).statusCode).toBe(200);
    expect(deleteJobs()).toHaveLength(0); // adding images deletes nothing

    // Reorder only → nothing removed → no job
    expect((await setImages(id, [c, a, b])).statusCode).toBe(200);
    expect(deleteJobs()).toHaveLength(0);

    const res = await setImages(id, [c]);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.product.images.map((i: { key: string }) => i.key)).toEqual([c]);
    expect(deleteJobs().map((j) => j.data)).toEqual([{ key: a }, { key: b }]);

    const outcomes = await runDeleteJobs();
    expect(outcomes).toEqual([{ deleted: true }, { deleted: true }]);
    expect(await exists(a)).toBe(false);
    expect(await exists(b)).toBe(false);
    expect(await exists(c)).toBe(true);

    // Idempotent: a retry / duplicate job after the object is gone still succeeds
    expect(await runDeleteJobs()).toEqual([{ deleted: true }, { deleted: true }]);
  });

  it('a key re-added before the job runs is NOT deleted (guard query)', async () => {
    const id = await draftProduct();
    const [a, b] = [await uploadImage(id), await uploadImage(id)];
    expect((await setImages(id, [a, b])).statusCode).toBe(200);
    expect((await setImages(id, [b])).statusCode).toBe(200);
    expect(deleteJobs().map((j) => j.data)).toEqual([{ key: a }]);

    // Admin puts it back before the worker gets to the job
    expect((await setImages(id, [b, a])).statusCode).toBe(200);
    expect(await runDeleteJobs()).toEqual([{ deleted: false, reason: 'STILL_REFERENCED' }]);
    expect(await exists(a)).toBe(true);
  });

  it('a failed PATCH (validation) enqueues nothing and deletes nothing', async () => {
    const id = await draftProduct();
    const a = await uploadImage(id);
    expect((await setImages(id, [a])).statusCode).toBe(200);
    jobs.clear();
    const res = await as(app, actors.adminJar).patch(`/api/v1/admin/products/${id}`, {
      images: [],
      comparePricePaise: 100, // below price → 422, transaction rolled back
    });
    expect(res.statusCode).toBe(422);
    expect(deleteJobs()).toHaveLength(0);
    expect(await exists(a)).toBe(true);
  });

  it('a partner cannot drop images (ADMIN only) — no job', async () => {
    const id = await draftProduct();
    const a = await uploadImage(id);
    expect((await setImages(id, [a])).statusCode).toBe(200);
    jobs.clear();
    const res = await as(app, actors.partnerJar).patch(`/api/v1/admin/products/${id}`, { images: [] });
    expect(res.statusCode).toBe(403);
    expect(deleteJobs()).toHaveLength(0);
  });

  it('the processor refuses keys outside products/ as a permanent failure (no retries)', async () => {
    await expect(
      processors.DELETE_PRODUCT_IMAGE({ key: 'private/invoices/PK-1.pdf' }, undefined as never),
    ).rejects.toMatchObject({ name: 'PermanentJobError' });
    await expect(
      processors.DELETE_PRODUCT_IMAGE({ key: 'products/../private/x.pdf' }, undefined as never),
    ).rejects.toMatchObject({ name: 'PermanentJobError' });
  });

  it('a storage failure propagates so BullMQ retries with backoff', async () => {
    const failing: ObjectStorage = {
      ...storage,
      delete: async () => {
        throw new Error('S3 DELETE failed with 503');
      },
    };
    const svc = createCommerceServices({
      db: t.db,
      redis,
      logger: silentLogger(),
      reporter: fakeReporter(),
      storage: failing,
      privateStorage: testPrivateStorage(),
      revalidator: spyRevalidator(),
      gateway: testGateway(redis),
      jobs,
      allowDraftInvoice: true,
      shiprocket: unreachableShiprocket(),
      courierWebhookToken: TEST_COURIER_TOKEN,
      push: createWebPushSender({}),
      messaging: testMessaging(redis),
    });
    await expect(svc.catalog.purgeImage('products/00000000-0000-0000-0000-000000000000/x.webp')).rejects.toThrow(/503/);
  });
});
