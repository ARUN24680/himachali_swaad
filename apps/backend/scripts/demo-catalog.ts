import { readFile } from 'node:fs/promises';
import { createDb } from '../src/config/db';
import { parseEnv } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { storageFromEnv } from '../src/config/storage';
import type { LocalDiskStorage } from '../src/integrations/storage/local-disk';
import { createStorefrontRevalidator } from '../src/integrations/storefront/revalidate';
import { DEMO_PRODUCTS } from './demo-catalog/fixtures';
import { demoStatus } from './demo-catalog/repository';
import { runDemoCatalog, type DemoAction } from './demo-catalog/service';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const action = args[0] ?? 'seed';
  if (args.length > 1 || !['seed', 'clear', 'reset', 'status'].includes(action)) {
    throw new Error('Usage: pnpm db:demo [seed|clear|reset|status]');
  }
  const env = parseEnv(process.env);
  if (!['development', 'test'].includes(env.NODE_ENV) || env.STORAGE_DRIVER !== 'local') {
    throw new Error('Demo commands require development/test and STORAGE_DRIVER=local.');
  }
  const logger = createLogger({ level: 'warn', name: 'pk-demo-catalog' });
  const db = createDb(
    {
      connectionString: env.DATABASE_URL,
      max: 2,
      slowQueryMs: 10000,
      applicationName: 'pk-demo-catalog',
      ssl: false,
      statementTimeoutMs: 15000,
    },
    logger,
  );
  try {
    if (action === 'seed' || action === 'reset') {
      const storage = storageFromEnv(env) as LocalDiskStorage;
      // Read every asset first: a missing image must fail before any database changes.
      const assets = await Promise.all(
        DEMO_PRODUCTS.map(async (p) => ({
          p,
          bytes: await readFile(
            new URL(`../../../packages/database/seeds/demo-catalog/images/${p.imageFile}`, import.meta.url),
          ),
        })),
      );
      for (const { p, bytes } of assets) await storage.write(p.imageKey, bytes);
    }
    if (action !== 'status') {
      const result = await runDemoCatalog(db, action as DemoAction, {
        nodeEnv: env.NODE_ENV,
        ...(process.env.DEMO_KITCHEN_CODE ? { kitchenCode: process.env.DEMO_KITCHEN_CODE } : {}),
      });
      console.log(result);
      // Revalidate all configured local storefronts after COMMIT; never inside the transaction.
      const urls = new Set(
        [
          env.STOREFRONT_REVALIDATE_URL,
          process.env.DOCKER_STOREFRONT_URL
            ? `${process.env.DOCKER_STOREFRONT_URL.replace(/\/$/, '')}/api/revalidate`
            : undefined,
        ].filter((v): v is string => Boolean(v)),
      );
      for (const url of urls)
        await createStorefrontRevalidator({ url, secret: env.REVALIDATE_SECRET, logger }).revalidate(['products']);
    }
    const status = await demoStatus(db);
    console.table(status.products);
    console.log('Active kitchens (set DEMO_KITCHEN_CODE if more than one):');
    console.table(status.kitchens);
    console.log('Demo compliance values and AI photos are samples. Existing products/orders are preserved.');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(`Demo catalog failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
