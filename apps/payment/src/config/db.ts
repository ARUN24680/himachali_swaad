import pg from 'pg';
import type { Logger } from 'pino';

// BIGINT (paise) → number, refusing values a JS number can't hold exactly (D-26)
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`BIGINT ${value} exceeds Number.MAX_SAFE_INTEGER`);
  return n;
});

/** Anything that can run a parameterized query: the Db wrapper or a transaction client. */
export interface Queryable {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<pg.QueryResult<T>>;
}

export interface Db extends Queryable {
  pool: pg.Pool;
  /** BEGIN/COMMIT/ROLLBACK wrapper. A client whose ROLLBACK fails is destroyed, not returned to the pool. */
  transaction: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

/** Pure raw SQL, parameterized only (D-01) — same shape as the store backend's client. */
export function createDb(
  config: { connectionString: string; max: number; ssl: boolean; applicationName: string },
  logger: Logger,
): Db {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: config.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
    application_name: config.applicationName,
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
  });
  pool.on('error', (err) => logger.error({ err }, 'Unexpected error on idle PostgreSQL client'));

  return {
    pool,
    query: (text, params) => pool.query(text, params),
    transaction: async (fn) => {
      const client = await pool.connect();
      let broken: Error | undefined;
      const onClientError = (err: Error) => {
        broken = err;
        logger.error({ err }, 'PostgreSQL connection lost during transaction');
      };
      client.on('error', onClientError);
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          broken = rollbackErr as Error;
        }
        throw err;
      } finally {
        client.off('error', onClientError);
        client.release(broken);
      }
    },
    close: () => pool.end(),
  };
}
