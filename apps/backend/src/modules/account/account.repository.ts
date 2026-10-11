import { AddressRowSchema, type AddressRow } from '@pk/shared';
import type { Queryable } from '../../config/db';

/** Raw SQL for saved addresses (Phase 5 §5.3). Every query is scoped by user_id. */

const parse = (rows: unknown[]) => rows.map((r) => AddressRowSchema.parse(r));

export interface AddressFields {
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

const COLUMNS: Record<keyof AddressFields | 'isDefault', string> = {
  label: 'label',
  fullName: 'full_name',
  phone: 'phone',
  line1: 'line1',
  line2: 'line2',
  landmark: 'landmark',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  isDefault: 'is_default',
};

export async function listAddresses(q: Queryable, userId: string): Promise<AddressRow[]> {
  const { rows } = await q.query(
    'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
    [userId],
  );
  return parse(rows);
}

export async function findAddress(q: Queryable, userId: string, id: string, forUpdate = false) {
  const { rows } = await q.query(
    `SELECT * FROM addresses WHERE id = $1 AND user_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, userId],
  );
  return parse(rows)[0] ?? null;
}

/** Serialises address writes per user (count limit + single default). */
export async function lockUser(q: Queryable, userId: string): Promise<void> {
  await q.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

export async function countAddresses(q: Queryable, userId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM addresses WHERE user_id = $1', [
    userId,
  ]);
  return rows[0]!.n;
}

export async function clearDefault(q: Queryable, userId: string): Promise<void> {
  await q.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND is_default', [userId]);
}

export async function insertAddress(q: Queryable, userId: string, a: AddressFields & { isDefault: boolean }) {
  const { rows } = await q.query(
    `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [userId, a.label, a.fullName, a.phone, a.line1, a.line2, a.landmark, a.city, a.state, a.pincode, a.isDefault],
  );
  return parse(rows)[0]!;
}

/** Column names come from the fixed COLUMNS map, never from input. */
export async function updateAddress(
  q: Queryable,
  userId: string,
  id: string,
  patch: Partial<AddressFields & { isDefault: boolean }>,
) {
  const sets: string[] = [];
  const values: unknown[] = [id, userId];
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${COLUMNS[field as keyof typeof COLUMNS]} = $${values.length}`);
  }
  if (sets.length === 0) return findAddress(q, userId, id);
  const { rows } = await q.query(
    `UPDATE addresses SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
    values,
  );
  return parse(rows)[0] ?? null;
}

export async function deleteAddress(q: Queryable, userId: string, id: string): Promise<boolean> {
  const res = await q.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [id, userId]);
  return res.rowCount === 1;
}

/** After deleting the default, the newest remaining address becomes default. */
export async function promoteNewestToDefault(q: Queryable, userId: string): Promise<void> {
  await q.query(
    `UPDATE addresses SET is_default = TRUE
      WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1 AND is_default)`,
    [userId],
  );
}

/** Same street address already saved? (checkout "save address" must not pile up duplicates) */
export async function findSameAddress(q: Queryable, userId: string, a: AddressFields) {
  const { rows } = await q.query(
    `SELECT * FROM addresses
      WHERE user_id = $1 AND lower(line1) = lower($2) AND pincode = $3 AND phone = $4 AND full_name = $5
      LIMIT 1`,
    [userId, a.line1, a.pincode, a.phone, a.fullName],
  );
  return parse(rows)[0] ?? null;
}
