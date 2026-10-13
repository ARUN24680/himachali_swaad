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

// ── Kitchens / pickup locations ──────────────────────────────────────────────────────────────────

export interface KitchenDbRow {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  shiprocket_pickup_name: string | null;
  fssai_license_no: string | null;
  is_active: boolean;
  partner_count: number;
}

const KITCHEN_SELECT = `SELECT p.id, p.code, p.name, p.contact_name, p.contact_phone, p.address_line1, p.address_line2,
    p.city, p.state, p.pincode, p.shiprocket_pickup_name, p.fssai_license_no, p.is_active,
    (SELECT count(*)::int FROM user_pickup_locations upl JOIN users u ON u.id = upl.user_id
      WHERE upl.pickup_location_id = p.id AND u.role = 'KITCHEN_PARTNER' AND u.is_active) AS partner_count
  FROM pickup_locations p`;

export async function listKitchens(q: Queryable): Promise<KitchenDbRow[]> {
  const { rows } = await q.query<KitchenDbRow>(`${KITCHEN_SELECT} ORDER BY p.is_active DESC, p.code`);
  return rows;
}

export async function findKitchen(q: Queryable, id: string, lock = false): Promise<KitchenDbRow | null> {
  if (lock) await q.query('SELECT 1 FROM pickup_locations WHERE id = $1 FOR UPDATE', [id]);
  const { rows } = await q.query<KitchenDbRow>(`${KITCHEN_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface KitchenWrite {
  name: string;
  contactName: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  shiprocketPickupName: string | null;
  fssaiLicenseNo: string | null;
}

/** Returns null when the code or the Shiprocket pickup name is already taken. */
export async function insertKitchen(q: Queryable, k: KitchenWrite & { code: string }): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO pickup_locations (code, name, contact_name, contact_phone, address_line1, address_line2,
                                   city, state, pincode, shiprocket_pickup_name, fssai_license_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      k.code,
      k.name,
      k.contactName,
      k.contactPhone,
      k.addressLine1,
      k.addressLine2,
      k.city,
      k.state,
      k.pincode,
      k.shiprocketPickupName,
      k.fssaiLicenseNo,
    ],
  );
  return rows[0]?.id ?? null;
}

/** Full-row update (the service merges the patch onto the locked row). False = pickup name taken. */
export async function updateKitchen(
  q: Queryable,
  id: string,
  k: KitchenWrite & { isActive: boolean },
): Promise<boolean> {
  const { rowCount } = await q.query(
    `UPDATE pickup_locations SET name = $2, contact_name = $3, contact_phone = $4, address_line1 = $5,
            address_line2 = $6, city = $7, state = $8, pincode = $9, shiprocket_pickup_name = $10,
            fssai_license_no = $11, is_active = $12
      WHERE id = $1
        AND NOT EXISTS (SELECT 1 FROM pickup_locations o WHERE o.id <> $1 AND o.shiprocket_pickup_name = $10)`,
    [
      id,
      k.name,
      k.contactName,
      k.contactPhone,
      k.addressLine1,
      k.addressLine2,
      k.city,
      k.state,
      k.pincode,
      k.shiprocketPickupName,
      k.fssaiLicenseNo,
      k.isActive,
    ],
  );
  return rowCount === 1;
}

export async function setPasswordHash(q: Queryable, userId: string, passwordHash: string): Promise<void> {
  await q.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
}
