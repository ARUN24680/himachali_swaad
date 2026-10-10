import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, type Db, type DbConfig } from '../../src/config/db';
import { silentLogger } from './test-logger';

export interface TestDb {
  db: Db;
  url: string;
  /** Drops the cloned database. Call in afterAll. */
  destroy: () => Promise<void>;
}

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: inject('pgAdminUrl') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Clones the migrated template into a fresh database for one test file (real PostgreSQL 17). */
export async function createTestDb(overrides: Partial<DbConfig> = {}): Promise<TestDb> {
  const name = `pk_test_${randomBytes(6).toString('hex')}`;
  const template = inject('pgTemplateDb');
  // Identifiers are generated above (hex) / fixed constants — never user input
  await admin((c) => c.query(`CREATE DATABASE ${name} TEMPLATE ${template}`));

  const url = new URL(inject('pgAdminUrl'));
  url.pathname = `/${name}`;

  const db = createDb(
    {
      connectionString: url.toString(),
      max: 5,
      slowQueryMs: 10_000,
      applicationName: 'pk-test',
      ssl: false,
      ...overrides,
    },
    silentLogger(),
  );

  return {
    db,
    url: url.toString(),
    destroy: async () => {
      await db.close();
      await admin((c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}
