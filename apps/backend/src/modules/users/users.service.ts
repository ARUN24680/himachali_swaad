import type {
  KitchenCreateRequestSchema,
  KitchenRow,
  KitchenUpdateRequest,
  StaffCreateRequest,
  StaffRow,
  StaffUpdateRequest,
} from '@pk/shared';
import type { Redis } from 'ioredis';
import type { z } from 'zod';
import bcrypt from 'bcryptjs';
import type { Db } from '../../config/db';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import { BCRYPT_COST, clearLoginLock, revokeAllSessions } from '../auth/auth.service';
import type { Actor } from '../settlements/settlements.service';
import * as repo from './users.repository';

const toRow = (s: repo.StaffDbRow): StaffRow => ({
  id: s.id,
  email: s.email,
  fullName: s.full_name,
  phone: s.phone,
  role: s.role,
  isActive: s.is_active,
  pickupLocationIds: s.pickup_location_ids,
  totpEnabled: s.totp_enabled,
  lastLoginAt: s.last_login_at?.toISOString() ?? null,
});

const toKitchen = (k: repo.KitchenDbRow): KitchenRow => ({
  id: k.id,
  code: k.code,
  name: k.name,
  contactName: k.contact_name,
  contactPhone: k.contact_phone,
  addressLine1: k.address_line1,
  addressLine2: k.address_line2,
  city: k.city,
  state: k.state,
  pincode: k.pincode,
  shiprocketPickupName: k.shiprocket_pickup_name,
  fssaiLicenseNo: k.fssai_license_no,
  isActive: k.is_active,
  partnerCount: k.partner_count,
});

/**
 * Staff management (Phase 9 §9.7, D-17, D-19): create partner/admin, kitchens, deactivate, force
 * logout, password reset. Kitchens (pickup_locations) are edited here too — before this they were
 * SQL-only (workflow/01).
 */
export function createUsersService(deps: { db: Db; redis?: Redis }) {
  const { db } = deps;

  async function assertLocations(ids: string[]) {
    if (ids.length && (await repo.countPickupLocations(db, ids)) !== new Set(ids).size) {
      throw new AppError('VALIDATION_ERROR', 'Unknown kitchen.', { field: 'pickupLocationIds' });
    }
  }

  return {
    list: async () => ({ staff: (await repo.listStaff(db)).map(toRow) }),

    async create(body: Required<Omit<StaffCreateRequest, 'phone'>> & { phone?: string }, by: Actor): Promise<StaffRow> {
      await assertLocations(body.pickupLocationIds);
      const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
      const id = await db.transaction(async (client) => {
        const uid = await repo.insertStaff(client, {
          email: body.email.toLowerCase(),
          fullName: body.fullName,
          phone: body.phone ?? null,
          role: body.role,
          passwordHash,
        });
        if (!uid) throw new AppError('DUPLICATE', 'A user with this e-mail or phone already exists.');
        await repo.replacePickupLocations(client, uid, body.pickupLocationIds);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'STAFF_CREATE',
          entityType: 'user',
          entityId: uid,
          after: { email: body.email, role: body.role, pickupLocationIds: body.pickupLocationIds },
          ip: by.ip,
        });
        return uid;
      });
      return toRow((await repo.findStaff(db, id))!);
    },

    async update(id: string, body: StaffUpdateRequest, by: Actor): Promise<StaffRow> {
      if (body.pickupLocationIds) await assertLocations(body.pickupLocationIds);
      if (id === by.auth.userId && (body.isActive === false || body.forceLogout)) {
        throw new AppError('VALIDATION_ERROR', 'You cannot deactivate or sign out your own account here.');
      }
      await db.transaction(async (client) => {
        const before = await repo.findStaff(client, id, true);
        if (!before) throw new AppError('NOT_FOUND', 'Staff member not found.');
        await repo.updateStaff(client, id, body);
        if (body.pickupLocationIds) await repo.replacePickupLocations(client, id, body.pickupLocationIds);
        // Deactivation also ends every session (refresh tokens); access tokens die within 15 min (D-20)
        const revoked = body.forceLogout || body.isActive === false ? await revokeAllSessions(client, id) : 0;
        await audit(client, {
          actorId: by.auth.userId,
          action: 'STAFF_UPDATE',
          entityType: 'user',
          entityId: id,
          before: {
            fullName: before.full_name,
            isActive: before.is_active,
            pickupLocationIds: before.pickup_location_ids,
          },
          after: { ...body, revokedSessions: revoked },
          ip: by.ip,
        });
      });
      return toRow((await repo.findStaff(db, id))!);
    },

    /** Admin sets a temporary password (forgotten password / locked out). Signs the person out everywhere. */
    async resetPassword(id: string, password: string, by: Actor): Promise<{ revokedSessions: number }> {
      if (id === by.auth.userId) {
        throw new AppError('VALIDATION_ERROR', 'Change your own password from the Account page.');
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      const { revoked, email } = await db.transaction(async (client) => {
        const staff = await repo.findStaff(client, id, true);
        if (!staff) throw new AppError('NOT_FOUND', 'Staff member not found.');
        await repo.setPasswordHash(client, id, passwordHash);
        const n = await revokeAllSessions(client, id);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'STAFF_PASSWORD_RESET',
          entityType: 'user',
          entityId: id,
          after: { revokedSessions: n },
          ip: by.ip,
        });
        return { revoked: n, email: staff.email };
      });
      if (deps.redis) await clearLoginLock(deps.redis, email);
      return { revokedSessions: revoked };
    },

    listKitchens: async () => ({ kitchens: (await repo.listKitchens(db)).map(toKitchen) }),

    async createKitchen(body: z.output<typeof KitchenCreateRequestSchema>, by: Actor): Promise<KitchenRow> {
      const id = await db.transaction(async (client) => {
        const kid = await repo.insertKitchen(client, body);
        if (!kid) throw new AppError('DUPLICATE', 'A kitchen with this code or Shiprocket pickup name already exists.');
        await audit(client, {
          actorId: by.auth.userId,
          action: 'KITCHEN_CREATE',
          entityType: 'pickup_location',
          entityId: kid,
          after: body,
          ip: by.ip,
        });
        return kid;
      });
      return toKitchen((await repo.findKitchen(db, id))!);
    },

    async updateKitchen(id: string, body: KitchenUpdateRequest, by: Actor): Promise<KitchenRow> {
      await db.transaction(async (client) => {
        const before = await repo.findKitchen(client, id, true);
        if (!before) throw new AppError('NOT_FOUND', 'Kitchen not found.');
        const cur = toKitchen(before);
        const next = { ...cur, ...body };
        if (!(await repo.updateKitchen(client, id, next))) {
          throw new AppError('DUPLICATE', 'Another kitchen already uses this Shiprocket pickup name.');
        }
        await audit(client, {
          actorId: by.auth.userId,
          action: 'KITCHEN_UPDATE',
          entityType: 'pickup_location',
          entityId: id,
          before: Object.fromEntries(Object.keys(body).map((k) => [k, cur[k as keyof KitchenRow]])),
          after: body,
          ip: by.ip,
        });
      });
      return toKitchen((await repo.findKitchen(db, id))!);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
