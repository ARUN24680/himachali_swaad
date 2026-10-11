import type { Queryable } from '../../config/db';

export async function findSettingValue(db: Queryable, key: string): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', [key]);
  if (rows.length === 0) return undefined;
  return rows[0]?.value;
}

export async function listSettings(db: Queryable) {
  const { rows } = await db.query<{ key: string; value: unknown; description: string | null; updated_at: Date }>(
    'SELECT key, value, description, updated_at FROM settings ORDER BY key',
  );
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    description: r.description,
    updatedAt: r.updated_at.toISOString(),
  }));
}
