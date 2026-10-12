import { buildApp } from './app';
import { authConfigFromEnv } from './config/auth';
import { createDb } from './config/db';
import { loadEnvOrExit } from './config/env';
import { createLogger } from './config/logger';
import { createRedis } from './config/redis';
import {
  conversionsFromEnv,
  gatewayFromEnv,
  privateStorageFromEnv,
  revalidatorFromEnv,
  storageFromEnv,
} from './config/storage';
import { SANDBOX_PATH, shippingFromEnv } from './config/shipping';
import { createShiprocketSandbox } from './integrations/shiprocket/sandbox';
import { joinUrl } from './integrations/storage/storage';
import { createBullJobQueue } from './jobs/queues';
import { flushSentry, initSentry } from './config/sentry';

const env = loadEnvOrExit();
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
  },
  logger,
);
const redis = createRedis(env.REDIS_URL, env.PROCESS_NAME);
const jobs = createBullJobQueue(redis);
const shipping = shippingFromEnv(env, redis, logger, reporter);

const app = await buildApp({
  logger,
  db,
  redis,
  reporter,
  origins: env.APP_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  checkoutIpLimit: env.CHECKOUT_IP_LIMIT,
  auth: authConfigFromEnv(env),
  storage: storageFromEnv(env),
  revalidator: revalidatorFromEnv(env, logger),
  capi: conversionsFromEnv(env, logger),
  privateStorage: privateStorageFromEnv(env),
  gateway: gatewayFromEnv(env, redis),
  jobs,
  queueDashboard: jobs,
  allowDraftInvoice: env.NODE_ENV !== 'production',
  shiprocket: shipping.shiprocket,
  courierWebhookToken: shipping.webhookToken,
  // env.ts refuses the sandbox in production
  ...(shipping.sandbox
    ? { shiprocketSandbox: createShiprocketSandbox({ baseUrl: () => joinUrl(env.API_PUBLIC_URL, SANDBOX_PATH) }) }
    : {}),
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down: stop accepting, drain in-flight requests');
  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out');
    process.exit(1);
  }, 15_000);
  forceExit.unref();
  try {
    await app.close();
    await jobs.close();
    await db.close();
    await redis.quit();
    await flushSentry();
    logger.info('shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: env.HOST });
