/**
 * pnpm db:clear:data [--yes] [--with-catalog] [--skip-payment] [--skip-redis] [--dry-run]
 *
 * Local dev/test only. Clears orders, customers and everything hanging off them; keeps staff
 * (password hashes, TOTP secrets, sessions), kitchens, kitchen links, settings and (by default) the
 * catalog. See README "Clear local website data".
 */
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import { createDb, type Db } from '../src/config/db';
import { parseEnv } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { createRedis } from '../src/config/redis';
import { createStorefrontRevalidator } from '../src/integrations/storefront/revalidate';
import {
  assertLocalEnv,
  clearDatabase,
  clearPaymentDatabase,
  clearRedisKeys,
  previewClear,
  previewPaymentClear,
} from './clear-data/service';

const FLAGS = ['--yes', '--with-catalog', '--skip-payment', '--skip-redis', '--dry-run'] as const;
const USAGE = `Usage: pnpm db:clear:data [${FLAGS.join('] [')}]`;

const describeDb = (url: string) => {
  const u = new URL(url);
  return { host: `${u.hostname}:${u.port || '5432'}`, name: decodeURIComponent(u.pathname.replace(/^\//, '')) };
};

const openDb = (url: string, name: string) =>
  createDb(
    {
      connectionString: url,
      max: 2,
      slowQueryMs: 10_000,
      applicationName: name,
      ssl: false,
      statementTimeoutMs: 60_000,
    },
    createLogger({ level: 'warn', name }),
  );

const table = (counts: Record<string, number>) =>
  console.table(Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, { rows: n }])));

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const unknown = args.filter((a) => !(FLAGS as readonly string[]).includes(a));
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(' ')}\n${USAGE}`);
  const flag = (f: (typeof FLAGS)[number]) => args.includes(f);
  const withCatalog = flag('--with-catalog');
  const dryRun = flag('--dry-run');

  // Check the RAW variable first: the env schema defaults NODE_ENV to development when unset.
  const nodeEnv = process.env.NODE_ENV;
  assertLocalEnv(nodeEnv);
  const env = parseEnv(process.env);

  const target = describeDb(env.DATABASE_URL);
  const paymentUrl = flag('--skip-payment')
    ? undefined
    : z
        .preprocess((v) => (v === '' ? undefined : v), z.url({ protocol: /^postgres(ql)?$/ }).optional())
        .parse(process.env.PAYMENT_DATABASE_URL);
  const payment = paymentUrl ? describeDb(paymentUrl) : null;
  const redisTarget = new URL(env.REDIS_URL);

  const db = openDb(env.DATABASE_URL, 'pk-clear-data');
  let paymentDb: Db | undefined;
  const redis = flag('--skip-redis') ? undefined : createRedis(env.REDIS_URL, 'pk-clear-data');
  try {
    console.log(`\nPahadi Khatki — clear local website data (NODE_ENV=${nodeEnv})`);
    console.log(`  Database:         ${target.name} @ ${target.host}`);
    console.log(
      `  Payment database: ${payment ? `${payment.name} @ ${payment.host}` : flag('--skip-payment') ? 'skipped (--skip-payment)' : 'not configured (PAYMENT_DATABASE_URL unset)'}`,
    );
    console.log(
      `  Redis:            ${redis ? `${redisTarget.hostname}:${redisTarget.port || '6379'}${redisTarget.pathname || ''} (pk:* keys)` : 'skipped (--skip-redis)'}`,
    );
    console.log(`  Catalog:          ${withCatalog ? 'CLEARED (--with-catalog)' : 'kept'}\n`);

    const preview = await previewClear(db, withCatalog);
    console.log('Rows that will be deleted:');
    table(preview.toDelete);
    console.log('Kept (staff, sessions, kitchens, links and settings are never written):');
    table(preview.kept);

    if (payment && paymentUrl) {
      paymentDb = openDb(paymentUrl, 'pk-clear-data-payment');
      console.log('Payment database rows that will be deleted (observer devices are kept):');
      table(await previewPaymentClear(paymentDb));
    }
    if (redis) {
      const r = await clearRedisKeys(redis, nodeEnv, { dryRun: true });
      console.log('Redis keys that will be deleted (BullMQ queues, Shiprocket token, TOTP enrolments kept):');
      table(r.groups);
    }

    if (dryRun) {
      console.log('Dry run: nothing changed.');
      return;
    }
    if (!flag('--yes')) {
      if (!process.stdin.isTTY) throw new Error('Not a terminal: pass --yes to confirm non-interactively.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const typed = (await rl.question(`Type the database name (${target.name}) to confirm: `)).trim();
      rl.close();
      if (typed !== target.name) throw new Error('Confirmation did not match. Nothing changed.');
    }

    const result = await clearDatabase(db, { nodeEnv, withCatalog });
    console.log(`\n✔ Database ${target.name} cleared (one transaction).`);
    if (result.stock) {
      console.log(
        `  Stock: ${result.stock.movements} order movements removed, ${result.stock.batchesAdjusted} batches reset to their ledger, ${result.stock.jarsReturned} jars returned.`,
      );
    }
    if (paymentDb) {
      await clearPaymentDatabase(paymentDb, nodeEnv);
      console.log(`✔ Payment database ${payment!.name} cleared.`);
    }
    if (redis) {
      const r = await clearRedisKeys(redis, nodeEnv);
      console.log(`✔ Redis: ${r.deleted} pk:* keys deleted.`);
    }
    // Stock/catalog changed: refresh storefront cache after COMMIT (no-op if not configured).
    await createStorefrontRevalidator({
      url: env.STOREFRONT_REVALIDATE_URL,
      secret: env.REVALIDATE_SECRET,
      logger: createLogger({ level: 'warn', name: 'pk-clear-data' }),
    }).revalidate(['products']);

    const orphaned = Object.entries(result.privateDocs).filter(([, n]) => n > 0);
    if (orphaned.length) {
      console.log(
        `\nNote: private files were NOT deleted and are now orphaned in storage: ${orphaned.map(([k, n]) => `${n} ${k}`).join(', ')}.`,
      );
    }
    console.log(
      'Note: BullMQ queues were not touched; jobs for cleared orders will no-op or fail. Shiprocket/Razorpay sandbox data was not touched.',
    );
    if (withCatalog) {
      console.log('\nCatalog cleared. Reseed with: pnpm db:demo:seed   (or: pnpm db:seed:catalog -- --demo --publish)');
    }
  } finally {
    await db.close();
    await paymentDb?.close();
    redis?.disconnect();
  }
}

main().catch((err) => {
  console.error(`Clear data failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
