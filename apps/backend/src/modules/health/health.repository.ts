import type { Queryable } from '../../config/db';

export async function pingDatabase(db: Queryable): Promise<void> {
  await db.query('SELECT 1');
}
