import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import {
  createOpsAlertsService,
  OPS_THRESHOLDS,
  SERVER_ERRORS_KEY,
  WORKER_HEARTBEAT_KEY,
} from '../../src/modules/admin/ops-alerts.service';
import { as, catalogActors } from '../helpers/catalog';
import { createSweepers } from '../../src/jobs/sweepers';
import { confirmedOrder, workerServices } from '../helpers/logistics';
import { createProduct } from '../helpers/factories';
import { buildTestApp, fakeReporter, recordingJobs, testGateway, testPrivateStorage } from '../helpers/test-app';
import { unreachableShiprocket } from '../helpers/shiprocket';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { silentLogger } from '../helpers/test-logger';

/** Phase 10 §10.3: worker heartbeat health check, OPS_ALERTS thresholds, test alert, ops metrics. */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const jobs = recordingJobs();

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs });
  actors = await catalogActors(app, t.db);
});
afterAll(async () => {
  await app.close();
  await redis.quit();
  await t.destroy();
});

const alerts = () => createOpsAlertsService({ db: t.db, redis, jobs, logger: silentLogger() });
const alertKinds = () =>
  jobs.jobs.filter((j) => j.name === 'ADMIN_ALERT').map((j) => (j.data as { kind: string }).kind);

describe('GET /healthz/worker', () => {
  it('503 without a heartbeat, 200 with a fresh one, 503 once it is stale', async () => {
    await redis.del(WORKER_HEARTBEAT_KEY);
    expect((await app.inject({ method: 'GET', url: '/healthz/worker' })).statusCode).toBe(503);

    await redis.set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 120);
    const fresh = await app.inject({ method: 'GET', url: '/healthz/worker' });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().data.alive).toBe(true);

    await redis.set(WORKER_HEARTBEAT_KEY, String(Date.now() - 5 * 60_000), 'EX', 120);
    expect((await app.inject({ method: 'GET', url: '/healthz/worker' })).statusCode).toBe(503);
  });
});

describe('OPS_ALERTS', () => {
  it('quiet system → no alerts', async () => {
    jobs.clear();
    expect(await alerts().run(async () => ({ failed: 0, waiting: 0, oldestWaitingAt: null }))).toEqual([]);
    expect(alertKinds()).toEqual([]);
  });

  it('5xx spike, newly failed jobs and a queue backlog each raise one ADMIN_ALERT', async () => {
    jobs.clear();
    const minute = Math.floor(Date.now() / 60_000);
    await redis.set(`${SERVER_ERRORS_KEY}:${minute}`, String(OPS_THRESHOLDS.serverErrorsPer10Min + 5), 'EX', 3600);
    const svc = alerts();
    await svc.run(async () => ({ failed: 3, waiting: 0, oldestWaitingAt: null })); // baseline failed=3
    jobs.clear();
    const fired = await svc.run(async () => ({ failed: 5, waiting: 250, oldestWaitingAt: Date.now() - 20 * 60_000 }));
    expect(fired).toEqual(expect.arrayContaining(['SERVER_ERRORS_SPIKE', 'JOBS_FAILED', 'QUEUE_BACKLOG']));
    expect(alertKinds()).toEqual(expect.arrayContaining(['SERVER_ERRORS_SPIKE', 'JOBS_FAILED', 'QUEUE_BACKLOG']));
    await redis.del(`${SERVER_ERRORS_KEY}:${minute}`);
  });

  it('ops issue open > 1h and a failed webhook → alerts', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    // set_updated_at() would overwrite the back-dated timestamp, so update with user triggers off
    await t.db.query(`ALTER TABLE orders DISABLE TRIGGER USER`);
    await t.db.query(`UPDATE orders SET ops_issue = 'TEST', updated_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [
      o.orderId,
    ]);
    await t.db.query(`ALTER TABLE orders ENABLE TRIGGER USER`);
    await t.db.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload, last_error)
       VALUES ('RAZORPAY', 'evt_ops_test', 'payment.captured', '{}', 'boom')`,
    );
    jobs.clear();
    const fired = await alerts().run();
    expect(fired).toEqual(expect.arrayContaining(['OPS_ISSUES_OPEN', 'WEBHOOK_FAILURES']));
  });
});

describe('LEDGER_CHECK alert', () => {
  it('a batch changed without a movement → Sentry + LEDGER_MISMATCH admin alert', async () => {
    const product = await createProduct(t.db);
    const res = await as(app, actors.adminJar).post('/api/v1/batches', {
      productId: product.id,
      quantity: 10,
      totalCostPaise: 0,
      pickupLocationId: actors.kitchenA.id,
    });
    const id = res.json().data.batch.id as string;
    await t.db.query('UPDATE inventory_batches SET available_stock = 7 WHERE id = $1', [id]);
    const reporter = fakeReporter();
    const svc = workerServices({
      db: t.db,
      redis,
      gateway,
      jobs,
      shiprocket: unreachableShiprocket(),
      privateStorage: testPrivateStorage(),
    });
    const sweepers = createSweepers({ db: t.db, svc, gateway, jobs, logger: silentLogger(), reporter });
    jobs.clear();
    expect(await sweepers.ledgerCheck()).toBeGreaterThanOrEqual(1);
    expect(reporter.capture).toHaveBeenCalled();
    expect(alertKinds()).toEqual(['LEDGER_MISMATCH']);
    await t.db.query('UPDATE inventory_batches SET available_stock = 10 WHERE id = $1', [id]);
  });
});

describe('admin ops endpoints', () => {
  it('POST /admin/ops/test-alert queues a TEST_ALERT and is audited; partner refused', async () => {
    jobs.clear();
    const res = await as(app, actors.adminJar).post('/api/v1/admin/ops/test-alert');
    expect(res.statusCode).toBe(200);
    expect(alertKinds()).toEqual(['TEST_ALERT']);
    const { rows } = await t.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'ALERT_TEST'`,
    );
    expect(rows[0]!.n).toBe(1);
    expect((await as(app, actors.partnerJar).post('/api/v1/admin/ops/test-alert')).statusCode).toBe(403);
  });

  it('GET /admin/ops/metrics: 24 hourly buckets + 30-day rates', async () => {
    const res = await as(app, actors.adminJar).get('/api/v1/admin/ops/metrics');
    expect(res.statusCode).toBe(200);
    const m = res.json().data;
    expect(m.ordersByHour).toHaveLength(24);
    expect(m.ordersByHour.reduce((s: number, h: { orders: number }) => s + h.orders, 0)).toBeGreaterThanOrEqual(1);
    expect(m).toMatchObject({ refunds30d: { count: expect.any(Number) }, ndrRatePercent30d: 0, rtoRatePercent30d: 0 });
  });
});
