import pg from 'pg';
import type { Logger } from 'pino';

/**
 * Pure raw SQL client (D-01, architecture/01 §Database Client). Created via factory so the
 * HTTP server, the worker and tests each own their pool.
 *
 * Pool sizing: (pool max × API + worker processes) must stay well below PostgreSQL max_connections.
 */
export interface DbConfig {
  connectionString: string;
  max: number;
  slowQueryMs: number;
  applicationName: string;
  ssl: boolean;
  connectionTimeoutMillis?: number;
  statementTimeoutMs?: number;
}

export type Isolation = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

/** Anything that can run a parameterized query: the Db wrapper or a transaction client. */
export interface Queryable {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<pg.QueryResult<T>>;
}

export interface Db {
  pool: pg.Pool;
  /** Parameterized raw SQL query. Never interpolate user input into `text`. */
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<pg.QueryResult<T>>;
  /** BEGIN/COMMIT/ROLLBACK wrapper. A client whose ROLLBACK fails is destroyed, not returned to the pool. */
  transaction: <T>(fn: (client: pg.PoolClient) => Promise<T>, opts?: { isolation?: Isolation }) => Promise<T>;
  close: () => Promise<void>;
}

export function createDb(config: DbConfig, logger: Logger): Db {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: config.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 3_000,
    statement_timeout: config.statementTimeoutMs ?? 5_000, // runaway query protection
    application_name: config.applicationName, // 'pk-api' | 'pk-worker' → visible in pg_stat_activity
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
  });

  pool.on('error', (err) => logger.error({ err }, 'Unexpected error on idle PostgreSQL client'));

  return {
    pool,

    query: async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => {
      const start = performance.now();
      const res = await pool.query<T>(text, params);
      const ms = Math.round(performance.now() - start);
      if (ms > config.slowQueryMs) logger.warn({ sql: text, ms, rows: res.rowCount }, 'slow query'); // params never logged (PII)
      return res;
    },

    transaction: async <T>(fn: (client: pg.PoolClient) => Promise<T>, opts?: { isolation?: Isolation }) => {
      const client = await pool.connect();
      let broken: Error | undefined;
      // pg only listens for errors on IDLE clients. A checked-out client whose connection drops
      // (DB restart, failover, pg_terminate_backend) emits 'error' with no listener → process crash.
      const onClientError = (err: Error) => {
        broken = err;
        logger.error({ err }, 'PostgreSQL connection lost during transaction');
      };
      client.on('error', onClientError);
      try {
        // `isolation` is a closed union type, never user input
        await client.query(opts?.isolation ? `BEGIN ISOLATION LEVEL ${opts.isolation}` : 'BEGIN');
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
