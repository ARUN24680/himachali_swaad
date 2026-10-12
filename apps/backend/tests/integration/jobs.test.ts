import { createWebPushSender } from '../../src/integrations/push/web-push';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import { createProcessors } from '../../src/jobs/processors';
import { createBullJobQueue, jobOptions } from '../../src/jobs/queues';
import { createSweepers } from '../../src/jobs/sweepers';
import { QUEUE_DASHBOARD_PATH } from '../../src/plugins/queue-dashboard';
import { createCommerceServices } from '../../src/services';
import { as, catalogActors } from '../helpers/catalog';
import { liveProduct, orderRow, payAtGateway, placeOrder, verify } from '../helpers/checkout';
import {
  buildTestApp,
  fakeReporter,
  recordingJobs,
  spyRevalidator,
  testGateway,
  testPrivateStorage,
  testStorage,
  testMessaging,
} from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { TEST_COURIER_TOKEN, unreachableShiprocket } from '../helpers/shiprocket';
import { createTestDb, type TestDb } from '../helpers/test-db';

/** Worker side (Phase 5 §5.9): reconcile sweepers, ledger check, token cleanup, BullMQ config, bull-board. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
const jobs = recordingJobs();
const reporter = fakeReporter();
const bull = { current: null as ReturnType<typeof createBullJobQueue> | null };
let actors: Awaited<ReturnType<typeof catalogActors>>;

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  gateway = testGateway(redis);
  bull.current = createBullJobQueue(new Redis(inject('redisUrl'), { maxRetriesPerRequest: null }));
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, queueDashboard: bull.current });
  actors = await catalogActors(app, t.db);
});
afterAll(async () => {
  await app.close();
  await bull.current?.close();
  await redis.quit();
  await t.destroy();
});

const deps = () => {
  const svc = createCommerceServices({
    db: t.db,
    redis,
    logger: silentLogger(),
    reporter,
    storage: testStorage(),
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
  return { svc, sweepers, processors: createProcessors({ db: t.db, svc, sweepers, logger: silentLogger() }) };
};

async function confirmedOrder() {
  const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 3 });
  const co = (await placeOrder(app, [{ productId: p.id, quantity: 1 }])).json().data;
  const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
  await verify(app, verifyBody);
  return orderRow(t.db, co.orderCode);
}

describe('RECONCILE_CONFIRMED / RECONCILE_REFUNDS', () => {
  it('re-enqueues invoice + shipment for orders confirmed > 5 min ago, with the same job ids', async () => {
    const { processors } = deps();
    const order = await confirmedOrder();
    jobs.clear();
    await processors.RECONCILE_CONFIRMED({} as never, {} as never);
    expect(jobs.ids()).not.toContain(`inv-${order.id}`); // too fresh
    await t.db.query("UPDATE orders SET confirmed_at = NOW() - INTERVAL '10 minutes' WHERE id = $1", [order.id]);
    await processors.RECONCILE_CONFIRMED({} as never, {} as never);
    expect(jobs.ids()).toEqual(expect.arrayContaining([`inv-${order.id}`, `ship-${order.id}`]));
  });

  it('re-enqueues refund intents the gateway never accepted after 30 min', async () => {
    const { processors } = deps();
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 3 });
    const co = (await placeOrder(app, [{ productId: p.id, quantity: 1 }])).json().data;
    const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId, { amountPaise: 7 }); // mismatch → refund intent
    await verify(app, verifyBody);
    const { rows } = await t.db.query(
      'SELECT r.id FROM refunds r JOIN orders o ON o.id = r.order_id WHERE o.order_code = $1',
      [co.orderCode],
    );
    await t.db.query("UPDATE refunds SET created_at = NOW() - INTERVAL '31 minutes' WHERE id = $1", [rows[0]!.id]);
    jobs.clear();
    await processors.RECONCILE_REFUNDS({} as never, {} as never);
    expect(jobs.ids()).toContain(`refund-${rows[0]!.id}`);
  });
});

describe('LEDGER_CHECK and token cleanup', () => {
  it('reports a ledger drift to Sentry, never fixes it', async () => {
    const { processors } = deps();
    const p = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
    reporter.capture.mockClear();
    await processors.LEDGER_CHECK({} as never, {} as never);
    expect(reporter.capture).not.toHaveBeenCalled();
    await t.db.query('UPDATE inventory_batches SET available_stock = 4 WHERE id = $1', [p.batchId]);
    await processors.LEDGER_CHECK({} as never, {} as never);
    expect(reporter.capture).toHaveBeenCalledWith(expect.any(Error), { batchIds: p.batchId });
    await t.db.query('UPDATE inventory_batches SET available_stock = 5 WHERE id = $1', [p.batchId]);
  });

  it('drops refresh-token families expired over a week ago, keeps live ones', async () => {
    const { processors } = deps();
    const u = await t.db.query("INSERT INTO users (phone, role) VALUES ('+919833333333', 'CUSTOMER') RETURNING id");
    const ins = (days: number) =>
      t.db.query(
        `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
         VALUES ($1, gen_random_uuid(), md5(random()::text) || md5(random()::text), NOW() + make_interval(days => $2))`,
        [u.rows[0]!.id, days],
      );
    await ins(-10);
    await ins(5);
    const r = (await processors.CLEANUP_REFRESH_TOKENS({} as never, {} as never)) as { deleted: number };
    expect(r.deleted).toBe(1);
    const left = await t.db.query('SELECT 1 FROM refresh_tokens WHERE user_id = $1', [u.rows[0]!.id]);
    expect(left.rowCount).toBe(1);
  });
});

describe('BullMQ', () => {
  it('retry/backoff/retention policy per job', () => {
    expect(jobOptions('INITIATE_REFUND', 'refund-x')).toMatchObject({
      jobId: 'refund-x',
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });
    expect(jobOptions('GENERATE_INVOICE').attempts).toBe(3);
  });

  it('the same job id is enqueued once (verify + webhook + sweeper collapse)', async () => {
    const q = bull.current!;
    await q.add('GENERATE_INVOICE', { orderId: 'o1' }, 'inv-o1');
    await q.add('GENERATE_INVOICE', { orderId: 'o1' }, 'inv-o1');
    expect(await q.queues.get('documents')!.getJobCounts('waiting')).toEqual({ waiting: 1 });
  });

  it('bull-board is ADMIN only', async () => {
    expect((await app.inject({ method: 'GET', url: `${QUEUE_DASHBOARD_PATH}/` })).statusCode).toBe(401);
    expect((await as(app, actors.partnerJar).get(`${QUEUE_DASHBOARD_PATH}/`)).statusCode).toBe(403);
    const ok = await as(app, actors.adminJar).get(`${QUEUE_DASHBOARD_PATH}/api/queues`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().queues.map((q: { name: string }) => q.name)).toEqual(
      expect.arrayContaining(['orders', 'documents', 'payments', 'notify', 'cron']),
    );
  });
});
