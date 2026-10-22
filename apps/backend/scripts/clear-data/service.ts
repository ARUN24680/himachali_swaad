import type { Redis } from 'ioredis';
import type { Db } from '../../src/config/db';
import * as repo from './repository';

export interface ClearOptions {
  /** Raw NODE_ENV from the process (not the schema default). Only development/test are allowed. */
  nodeEnv: string | undefined;
  withCatalog: boolean;
}

export function assertLocalEnv(nodeEnv: string | undefined) {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`Refusing to clear data: NODE_ENV must be development or test (got ${nodeEnv ?? 'unset'}).`);
  }
}

export async function previewClear(db: Db, withCatalog: boolean) {
  const [toDelete, kept, privateDocs] = await Promise.all([
    repo.countTargets(db, withCatalog),
    repo.countKept(db),
    repo.countPrivateDocs(db),
  ]);
  return { toDelete, kept, privateDocs };
}

/**
 * Clears orders, customers and everything hanging off them in ONE transaction. Staff users
 * (password hashes, TOTP secrets), staff sessions, kitchens, kitchen links and settings are
 * never written. Catalog is kept unless `withCatalog`.
 */
export async function clearDatabase(db: Db, opts: ClearOptions) {
  assertLocalEnv(opts.nodeEnv);
  try {
    return await db.transaction(async (c) => {
      await repo.lockForClear(c);
      const deleted = await repo.countTargets(c, opts.withCatalog);
      const privateDocs = await repo.countPrivateDocs(c);
      // Audit first: rows whose actor is a customer must go before the customers (FK).
      await repo.deleteAudit(c, opts.withCatalog);
      await repo.truncateOrderData(c, opts.withCatalog);
      const stock = opts.withCatalog ? null : await repo.deleteOrdersKeepingStock(c);
      await repo.deleteCustomers(c);
      return { deleted, privateDocs, stock };
    });
  } catch (err) {
    const pgErr = err as { code?: string; table?: string; constraint?: string; message?: string };
    if (pgErr.code === '23503') {
      // A KEPT row (e.g. settings.updated_by, batch creator) points at a customer/order. Nothing was changed.
      throw new Error(
        `Clear rolled back: a kept row still references deleted data (${pgErr.table ?? '?'} / ${pgErr.constraint ?? '?'}). ` +
          'Fix that row by hand, then rerun.',
        { cause: err },
      );
    }
    throw err;
  }
}

export async function previewPaymentClear(db: Db) {
  return repo.countPaymentTargets(db);
}

/** apps/payment database (Direct UPI). Observer devices (encrypted HMAC secrets) and nonces are kept. */
export async function clearPaymentDatabase(db: Db, nodeEnv: string | undefined) {
  assertLocalEnv(nodeEnv);
  return db.transaction(async (c) => {
    const deleted = await repo.countPaymentTargets(c);
    await repo.clearPaymentTables(c);
    return deleted;
  });
}

/**
 * `pk:` keys that are KEPT: BullMQ queues (deleting keys under a live worker corrupts its
 * structures and drops repeatable cron schedules), the cached Shiprocket token, half-finished
 * staff TOTP enrolments (credential material) and the worker heartbeat.
 */
export const REDIS_KEEP_PREFIXES = ['pk:bull:', 'pk:shiprocket:', 'pk:totp:pending:', 'pk:worker:heartbeat'] as const;

const redisGroup = (key: string) => key.split(':').slice(0, 2).join(':');

/** Deletes every other `pk:*` key (OTP codes/cooldowns, rate limits, login locks, caches, mock inbox/gateway). */
export async function clearRedisKeys(redis: Redis, nodeEnv: string | undefined, opts: { dryRun?: boolean } = {}) {
  assertLocalEnv(nodeEnv);
  // SCAN may return a key twice; collect into a Set first.
  const doomed = new Set<string>();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'pk:*', 'COUNT', 500);
    cursor = next;
    for (const k of keys) if (!REDIS_KEEP_PREFIXES.some((p) => k.startsWith(p))) doomed.add(k);
  } while (cursor !== '0');
  const groups: Record<string, number> = {};
  for (const k of doomed) groups[redisGroup(k)] = (groups[redisGroup(k)] ?? 0) + 1;
  let deleted = 0;
  if (!opts.dryRun) {
    const all = [...doomed];
    for (let i = 0; i < all.length; i += 500) deleted += await redis.unlink(...all.slice(i, i + 500));
  }
  return { deleted, groups };
}
