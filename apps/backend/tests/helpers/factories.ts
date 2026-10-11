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

/** Staff with a real (fast, cost 4) bcrypt hash so login tests exercise the actual compare. */
export async function createStaff(
  db: Queryable,
  opts: { role: 'ADMIN' | 'KITCHEN_PARTNER'; password?: string; email?: string; isActive?: boolean },
) {
  const { default: bcrypt } = await import('bcryptjs');
  const password = opts.password ?? 'correct horse battery staple';
  const email = opts.email ?? `staff-${uniqueDigits(10)}@pahadikhatki.test`;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, role, password_hash, full_name, is_active)
     VALUES ($1, $2, $3, 'Staff Member', $4) RETURNING id`,
    [email, opts.role, bcrypt.hashSync(password, 4), opts.isActive ?? true],
  );
  return { id: rows[0]!.id, email, password };
}

export async function assignPickupLocation(db: Queryable, userId: string, pickupLocationId: string) {
  await db.query('INSERT INTO user_pickup_locations (user_id, pickup_location_id) VALUES ($1, $2)', [
    userId,
    pickupLocationId,
  ]);
}

let productSeq = 0;

/** Draft product by default; `complete: true` fills every publish requirement except images. */
export async function createProduct(
  db: Queryable,
  overrides: Partial<{
    sku: string;
    group: string;
    netWeightG: number;
    pricePaise: number;
    shelfLifeDays: number | null;
    complete: boolean;
    isActive: boolean;
    images: string[];
  }> = {},
) {
  productSeq += 1;
  const n = `${uniqueDigits(5)}${productSeq}`;
  const complete = overrides.complete ?? true;
  const { rows } = await db.query<{ id: string; sku: string; slug: string; product_group: string }>(
    `INSERT INTO products (sku, slug, product_group, title, description, meat_type, net_weight_g, price_paise,
                           gst_rate_bp, shelf_life_days, ingredients, packed_weight_g, nutrition, images, is_active)
     VALUES ($1, $2, $3, 'Test Pickle', 'A test pickle', 'CHICKEN', $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, sku, slug, product_group`,
    [
      overrides.sku ?? `T${n}`.slice(0, 20),
      `test-pickle-${n}`,
      overrides.group ?? `test-group-${n}`,
      overrides.netWeightG ?? 250,
      overrides.pricePaise ?? 44_900,
      complete ? 500 : null,
      overrides.shelfLifeDays !== undefined ? overrides.shelfLifeDays : complete ? 180 : null,
      complete ? 'Chicken, mustard oil, spices' : null,
      complete ? (overrides.netWeightG ?? 250) + 230 : null,
      complete ? { energy_kcal: 300, protein_g: 18, fat_g: 24, carbs_g: 6, sugar_g: 1, sodium_mg: 1400 } : null,
      overrides.images ?? [],
      overrides.isActive ?? false,
    ],
  );
  return rows[0]!;
}

/**
 * Inserts a batch + its PRODUCTION movement directly (ledger stays consistent). For dates the API
 * refuses on purpose, e.g. already-expired batches. `expiresInDays` is relative to today (IST).
 */
export async function insertBatchDirect(
  db: Queryable,
  b: { productId: string; locationId: string; quantity: number; expiresInDays: number; code?: string },
) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO inventory_batches (product_id, pickup_location_id, batch_code, manufactured_at, expiry_date,
                                    initial_quantity, available_stock, total_cost_paise)
     VALUES ($1, $2, $3, ist_today() + $4::int - 365, ist_today() + $4::int, $5, $5, 0)
     RETURNING id`,
    [b.productId, b.locationId, b.code ?? `PK-0001-TEST-${uniqueDigits(6)}`, b.expiresInDays, b.quantity],
  );
  const id = rows[0]!.id;
  await db.query(
    `INSERT INTO inventory_movements (batch_id, movement_type, quantity_delta) VALUES ($1, 'PRODUCTION', $2)`,
    [id, b.quantity],
  );
  return id;
}
