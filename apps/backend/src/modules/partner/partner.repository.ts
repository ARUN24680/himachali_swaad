import type { Queryable } from '../../config/db';

export async function findPickupLocation(db: Queryable, id: string) {
  const { rows } = await db.query<{
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    is_active: boolean;
  }>('SELECT id, code, name, city, state, is_active FROM pickup_locations WHERE id = $1', [id]);
  const r = rows[0];
  return r ? { id: r.id, code: r.code, name: r.name, city: r.city, state: r.state, isActive: r.is_active } : null;
}

/** `ids` null = every kitchen (ADMIN). */
export async function listPickupLocations(db: Queryable, ids: string[] | null) {
  const { rows } = await db.query<{
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    is_active: boolean;
  }>(
    `SELECT id, code, name, city, state, is_active FROM pickup_locations
      WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY code`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    city: r.city,
    state: r.state,
    isActive: r.is_active,
  }));
}
