import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ max: 5 });
  await t.db.query('CREATE TABLE tx_probe (id SERIAL PRIMARY KEY, label TEXT NOT NULL)');
});
afterAll(() => t.destroy());

describe('db.transaction', () => {
  it('commits when the callback succeeds', async () => {
    await t.db.transaction(async (c) => {
      await c.query('INSERT INTO tx_probe (label) VALUES ($1)', ['committed']);
    });
    const { rows } = await t.db.query('SELECT 1 FROM tx_probe WHERE label = $1', ['committed']);
    expect(rows).toHaveLength(1);
  });

  it('rolls back every write when the callback throws', async () => {
    await expect(
      t.db.transaction(async (c) => {
        await c.query('INSERT INTO tx_probe (label) VALUES ($1)', ['rolled-back']);
        await c.query('INSERT INTO tx_probe (label) VALUES ($1)', ['rolled-back']);
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');

    const { rows } = await t.db.query('SELECT 1 FROM tx_probe WHERE label = $1', ['rolled-back']);
    expect(rows).toHaveLength(0);
  });

  it('applies the requested isolation level', async () => {
    const level = await t.db.transaction(
      async (c) =>
        (await c.query<{ transaction_isolation: string }>('SHOW transaction_isolation')).rows[0]?.transaction_isolation,
      { isolation: 'SERIALIZABLE' },
    );
    expect(level).toBe('serializable');
  });

  it('destroys a client whose ROLLBACK fails instead of returning it to the pool', async () => {
    let brokenPid: number | undefined;
    await expect(
      t.db.transaction(async (c) => {
        brokenPid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
        // Kill our own backend: the callback query fails AND the following ROLLBACK fails
        await c.query('SELECT pg_terminate_backend(pg_backend_pid())');
      }),
    ).rejects.toThrow();

    // The pool must hand out a healthy, different connection afterwards
    const { rows } = await t.db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    expect(rows[0]?.pid).toBeTypeOf('number');
    expect(rows[0]?.pid).not.toBe(brokenPid);
  });

  it('does not leak connections over 100 failing transactions', async () => {
    for (let i = 0; i < 100; i++) {
      await t.db
        .transaction(async (c) => {
          await c.query('INSERT INTO tx_probe (label) VALUES ($1)', [`leak-${i}`]);
          throw new Error(`fail ${i}`);
        })
        .catch(() => undefined);
    }
    expect(t.db.pool.totalCount).toBeLessThanOrEqual(5);
    expect(t.db.pool.waitingCount).toBe(0);
    const { rows } = await t.db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM tx_probe WHERE label LIKE 'leak-%'",
    );
    expect(rows[0]?.n).toBe('0');
  });
});
