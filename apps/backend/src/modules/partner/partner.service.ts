import type { Db } from '../../config/db';
import { AppError } from '../../utils/app-error';
import type { AuthContext } from '../../middleware/auth';
import { findPickupLocation, listPickupLocations } from './partner.repository';

export function createPartnerService(deps: { db: Db }) {
  return {
    async pickupLocation(id: string) {
      const location = await findPickupLocation(deps.db, id);
      if (!location) throw new AppError('NOT_FOUND', 'Kitchen not found.');
      return location;
    },

    /** ADMIN: every kitchen. KITCHEN_PARTNER: only their own. */
    pickupLocations: (auth: AuthContext) =>
      listPickupLocations(deps.db, auth.role === 'ADMIN' ? null : auth.pickupLocationIds),
  };
}

export type PartnerService = ReturnType<typeof createPartnerService>;
