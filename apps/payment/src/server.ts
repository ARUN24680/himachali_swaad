import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { startBackground } from './background';
import { loadEnvOrExit } from './config/env';
import { createLogger } from './config/logger';
import { createServices } from './services';

const env = loadEnvOrExit();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const svc = createServices(env, logger);

// dist/server.js → dist/web ; src/server.ts (dev) → dist/web
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, here.endsWith('dist') ? 'web' : '../dist/web');

const app = await buildApp({
  db: svc.db,
  logger,
  gateway: svc.gateway,
  checkout: svc.checkout,
  alerts: svc.alerts,
  email: svc.email,
  observer: svc.observer,
  apiKeyId: env.PAYMENT_API_KEY_ID,
  apiKeySecret: env.PAYMENT_API_KEY_SECRET,
  webRoot,
  trustProxy: env.PAYMENT_TRUST_PROXY,
  devTools: env.PAYMENT_DEV_TOOLS,
});
const stopBackground = startBackground(svc, logger);

logger.info(
  { email: Boolean(svc.email), android: Boolean(svc.observer), devTools: env.PAYMENT_DEV_TOOLS },
  'direct UPI alert channels',
);
await app.listen({ port: env.PAYMENT_PORT, host: env.PAYMENT_HOST });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    stopBackground();
    void app
      .close()
      .then(() => svc.db.close())
      .finally(() => process.exit(0));
  });
}
