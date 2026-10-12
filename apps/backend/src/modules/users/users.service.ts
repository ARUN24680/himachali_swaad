import type { StaffCreateRequest, StaffRow, StaffUpdateRequest } from '@pk/shared';
import bcrypt from 'bcryptjs';
import type { Db } from '../../config/db';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import { BCRYPT_COST, revokeAllSessions } from '../auth/auth.service';
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

/** Staff management (Phase 9 §9.7, D-17, D-19): create partner/admin, kitchens, deactivate, force logout. */
export function createUsersService(deps: { db: Db }) {
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
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
