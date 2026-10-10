import type { Worker } from 'bullmq';
import { createDb } from './config/db';
import { loadEnvOrExit } from './config/env';
import { createLogger } from './config/logger';
import { createRedis } from './config/redis';
import { flushSentry, initSentry } from './config/sentry';

/**
 * Worker entrypoint (D-06): BullMQ processors + repeat jobs, separate process from the HTTP server.
 * No jobs yet — processors are registered from Phase 5 (src/jobs/processors/).
 */
const env = loadEnvOrExit({ ...process.env, PROCESS_NAME: process.env.PROCESS_NAME ?? 'pk-worker' });
const logger = createLogger({ level: env.LOG_LEVEL, name: env.PROCESS_NAME, pretty: env.NODE_ENV === 'development' });
initSentry({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV, release: env.RELEASE });

const db = createDb(
  {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    slowQueryMs: env.SLOW_QUERY_MS,
    applicationName: env.PROCESS_NAME,
    ssl: env.NODE_ENV === 'production',
  },
  logger,
);
const connection = createRedis(env.REDIS_URL, env.PROCESS_NAME);

const workers: Worker[] = [];

await connection.ping();
logger.info({ workers: workers.length }, 'worker started');

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'worker shutting down: finish active jobs');
  const forceExit = setTimeout(() => process.exit(1), 30_000);
  forceExit.unref();
  try {
    await Promise.all(workers.map((w) => w.close()));
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
