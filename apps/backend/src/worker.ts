import { createDb } from './config/db';
import { loadEnvOrExit } from './config/env';
import { createLogger } from './config/logger';
import { createRedis } from './config/redis';
import { flushSentry, initSentry } from './config/sentry';
import { gatewayFromEnv, privateStorageFromEnv, revalidatorFromEnv, storageFromEnv } from './config/storage';
import { createProcessors, SCHEDULES } from './jobs/processors';
import { createBullJobQueue } from './jobs/queues';
import { startWorkers } from './jobs/runner';
import { shippingFromEnv } from './config/shipping';
import { createSweepers } from './jobs/sweepers';
import { createCommerceServices } from './services';

/**
 * Worker entrypoint (D-06): BullMQ processors + repeat jobs, separate process from the HTTP server.
 * Same service graph as the API (services.ts); jobs come from src/jobs/processors.
 */
const env = loadEnvOrExit({ ...process.env, PROCESS_NAME: process.env.PROCESS_NAME ?? 'pk-worker' });
const logger = createLogger({ level: env.LOG_LEVEL, name: env.PROCESS_NAME, pretty: env.NODE_ENV === 'development' });
const reporter = initSentry({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
  release: env.RELEASE,
});

const db = createDb(
  {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    slowQueryMs: env.SLOW_QUERY_MS,
    applicationName: env.PROCESS_NAME,
    ssl: env.NODE_ENV === 'production',
    // Jobs (invoice numbering, sweeps) may run longer than an HTTP request
    statementTimeoutMs: 30_000,
  },
  logger,
);
const connection = createRedis(env.REDIS_URL, env.PROCESS_NAME);
await connection.ping();

const jobs = createBullJobQueue(connection);
const gateway = gatewayFromEnv(env, connection);
// Sandbox mode: the same client calls the API's /api/v1/dev/shiprocket (API must be running)
const shipping = shippingFromEnv(env, connection, logger, reporter);
const svc = createCommerceServices({
  db,
  redis: connection,
  logger,
  reporter,
  storage: storageFromEnv(env),
  privateStorage: privateStorageFromEnv(env),
  revalidator: revalidatorFromEnv(env, logger),
  gateway,
  jobs,
  allowDraftInvoice: env.NODE_ENV !== 'production',
  shiprocket: shipping.shiprocket,
  courierWebhookToken: shipping.webhookToken,
});
const sweepers = createSweepers({ db, svc, gateway, jobs, logger, reporter });
const processors = createProcessors({ db, svc, sweepers, logger });

const workers = startWorkers({
  connection,
  processors,
  svc,
  logger,
  reporter,
  concurrency: env.WORKER_CONCURRENCY,
});

const cron = jobs.queues.get('cron')!;
for (const s of SCHEDULES) {
  await cron.upsertJobScheduler(s.name, s.every ? { every: s.every } : { pattern: s.pattern!, tz: 'Asia/Kolkata' }, {
    name: s.name,
    data: {},
    opts: { removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } },
  });
}
logger.info({ workers: workers.length, schedules: SCHEDULES.map((s) => s.name) }, 'worker started');

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'worker shutting down: finish active jobs');
  const forceExit = setTimeout(() => process.exit(1), 30_000);
  forceExit.unref();
  try {
    await Promise.all(workers.map((w) => w.close()));
    await jobs.close();
    await db.close();
    await connection.quit();
    await flushSentry();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during worker shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
