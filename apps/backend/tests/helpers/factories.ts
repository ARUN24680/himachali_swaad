import { randomBytes } from 'node:crypto';
import type { Role } from '@pk/shared';
import type { Queryable } from '../../src/config/db';

const uniqueDigits = (n: number) => Array.from(randomBytes(n), (b) => String(b % 10)).join('');

export interface UserRow {
  id: string;
  phone: string | null;
  email: string | null;
  role: Role;
}

export async function createUser(
  db: Queryable,
  overrides: Partial<{
    phone: string | null;
    email: string | null;
    role: Role;
    passwordHash: string | null;
    fullName: string;
  }> = {},
): Promise<UserRow> {
  const role = overrides.role ?? 'CUSTOMER';
  const isStaff = role !== 'CUSTOMER';
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (phone, email, role, password_hash, full_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, phone, email, role`,
    [
      overrides.phone === undefined ? `+919${uniqueDigits(9)}` : overrides.phone,
      overrides.email === undefined ? (isStaff ? `staff-${uniqueDigits(8)}@pahadikhatki.test` : null) : overrides.email,
      role,
      overrides.passwordHash === undefined
        ? isStaff
          ? '$2b$12$placeholderhashforfactoryonly000000000000000000000'
          : null
        : overrides.passwordHash,
      overrides.fullName ?? 'Test User',
    ],
  );
  return rows[0]!;
}

export async function createPickupLocation(db: Queryable, overrides: Partial<{ code: string; city: string }> = {}) {
  const { rows } = await db.query<{ id: string; code: string }>(
    `INSERT INTO pickup_locations (code, name, contact_name, contact_phone, address_line1, city, state, pincode)
     VALUES ($1, 'Kullu Kitchen', 'Kitchen Partner', '+919876543210', 'Village Road', $2, 'Himachal Pradesh', '175101')
     RETURNING id, code`,
    [overrides.code ?? `HP-KULLU-${uniqueDigits(4)}`, overrides.city ?? 'Kullu'],
  );
  return rows[0]!;
}
