import type { Queryable } from '../../config/db';
import { RefreshTokenRowSchema, UserRowSchema, type RefreshTokenRow, type UserRow } from './auth.validation';

const USER_COLUMNS = 'id, phone, email, full_name, role, password_hash, totp_secret_enc, is_active';

const one = <T>(rows: unknown[], parse: (r: unknown) => T): T | null => (rows[0] ? parse(rows[0]) : null);

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRow | null> {
  const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  return one(rows, (r) => UserRowSchema.parse(r));
}

export async function findUserById(db: Queryable, id: string): Promise<UserRow | null> {
  const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return one(rows, (r) => UserRowSchema.parse(r));
}

/**
 * Customer OTP login (D-18). Inserts a new CUSTOMER or touches an existing active CUSTOMER.
 * Returns null when the phone belongs to staff or a deactivated user — OTP must never log in staff.
 */
export async function upsertCustomerByPhone(db: Queryable, phone: string): Promise<UserRow | null> {
  const { rows } = await db.query(
    `INSERT INTO users (phone, role, last_login_at) VALUES ($1, 'CUSTOMER', NOW())
     ON CONFLICT (phone) DO UPDATE SET last_login_at = NOW()
       WHERE users.role = 'CUSTOMER' AND users.is_active
     RETURNING ${USER_COLUMNS}`,
    [phone],
  );
  return one(rows, (r) => UserRowSchema.parse(r));
}

export async function touchLastLogin(db: Queryable, userId: string): Promise<void> {
  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
}

export async function updatePasswordHash(db: Queryable, userId: string, hash: string): Promise<void> {
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, hash]);
}

export async function setTotpSecret(db: Queryable, userId: string, encrypted: string): Promise<void> {
  await db.query('UPDATE users SET totp_secret_enc = $2 WHERE id = $1', [userId, encrypted]);
}

export async function listPickupLocationIds(db: Queryable, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ pickup_location_id: string }>(
    `SELECT upl.pickup_location_id
       FROM user_pickup_locations upl
       JOIN pickup_locations pl ON pl.id = upl.pickup_location_id AND pl.is_active
      WHERE upl.user_id = $1
      ORDER BY upl.pickup_location_id`,
    [userId],
  );
  return rows.map((r) => r.pickup_location_id);
}

export async function insertRefreshToken(
  db: Queryable,
  t: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [t.userId, t.familyId, t.tokenHash, t.expiresAt, t.userAgent, t.ip],
  );
  return rows[0]!.id;
}

/** Locks the token row so two concurrent refreshes cannot both rotate it. */
export async function findRefreshTokenForUpdate(db: Queryable, tokenHash: string): Promise<RefreshTokenRow | null> {
  const { rows } = await db.query(
    `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by_id
       FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash],
  );
  return one(rows, (r) => RefreshTokenRowSchema.parse(r));
}

export async function findRefreshToken(db: Queryable, tokenHash: string): Promise<RefreshTokenRow | null> {
  const { rows } = await db.query(
    'SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by_id FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  return one(rows, (r) => RefreshTokenRowSchema.parse(r));
}

export async function markRotated(db: Queryable, id: string, replacedById: string): Promise<void> {
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_id = $2 WHERE id = $1', [id, replacedById]);
}

export async function revokeFamily(db: Queryable, familyId: string): Promise<number> {
  const { rowCount } = await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL',
    [familyId],
  );
  return rowCount ?? 0;
}

export async function revokeAllForUser(db: Queryable, userId: string): Promise<number> {
  const { rowCount } = await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
  return rowCount ?? 0;
}
