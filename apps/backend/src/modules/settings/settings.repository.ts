import type { Queryable } from '../../config/db';

export async function findSettingValue(db: Queryable, key: string): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', [key]);
  if (rows.length === 0) return undefined;
  return rows[0]?.value;
}
