import type { Queryable } from '../../config/db';

/** Staff accounts (ADMIN / KITCHEN_PARTNER) for the admin console (Phase 9 §9.7). */
export interface StaffDbRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'ADMIN' | 'KITCHEN_PARTNER';
  is_active: boolean;
  totp_enabled: boolean;
  last_login_at: Date | null;
  pickup_location_ids: string[];
}

const SELECT = `SELECT u.id, u.email::text AS email, u.full_name, u.phone, u.role, u.is_active,
    (u.totp_secret_enc IS NOT NULL) AS totp_enabled, u.last_login_at,
    COALESCE(array_agg(upl.pickup_location_id ORDER BY upl.pickup_location_id) FILTER (WHERE upl.pickup_location_id IS NOT NULL), '{}') AS pickup_location_ids
  FROM users u LEFT JOIN user_pickup_locations upl ON upl.user_id = u.id`;

export async function listStaff(q: Queryable): Promise<StaffDbRow[]> {
  const { rows } = await q.query<StaffDbRow>(
    `${SELECT} WHERE u.role IN ('ADMIN', 'KITCHEN_PARTNER') GROUP BY u.id ORDER BY u.role, u.email`,
  );
  return rows;
}

export async function findStaff(q: Queryable, id: string, lock = false): Promise<StaffDbRow | null> {
  if (lock) await q.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [id]);
  const { rows } = await q.query<StaffDbRow>(
    `${SELECT} WHERE u.id = $1 AND u.role IN ('ADMIN', 'KITCHEN_PARTNER') GROUP BY u.id`,
    [id],
  );
  return rows[0] ?? null;
}

/** Returns null when the e-mail or phone is already taken. */
export async function insertStaff(
  q: Queryable,
  s: { email: string; fullName: string; phone: string | null; role: string; passwordHash: string },
): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO users (email, full_name, phone, role, password_hash)
     VALUES ($1, $2, $3, $4::user_role, $5)
     ON CONFLICT DO NOTHING RETURNING id`,
    [s.email, s.fullName, s.phone, s.role, s.passwordHash],
  );
  return rows[0]?.id ?? null;
}

export async function updateStaff(
  q: Queryable,
  id: string,
  p: { fullName?: string; phone?: string | null; isActive?: boolean },
): Promise<void> {
  await q.query(
    `UPDATE users SET full_name = COALESCE($2, full_name),
                      phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
                      is_active = COALESCE($5, is_active)
      WHERE id = $1`,
    [id, p.fullName ?? null, p.phone !== undefined, p.phone ?? null, p.isActive ?? null],
  );
}

export async function replacePickupLocations(q: Queryable, userId: string, ids: string[]): Promise<void> {
  await q.query('DELETE FROM user_pickup_locations WHERE user_id = $1', [userId]);
  if (ids.length) {
    await q.query(
      'INSERT INTO user_pickup_locations (user_id, pickup_location_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING',
      [userId, ids],
    );
  }
}

export async function countPickupLocations(q: Queryable, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { rows } = await q.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM pickup_locations WHERE id = ANY($1::uuid[])',
    [ids],
  );
  return rows[0]!.n;
}
