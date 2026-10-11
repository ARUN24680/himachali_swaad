import type { Db } from '../../config/db';
import { AppError } from '../../utils/app-error';
import { findPickupLocation } from './partner.repository';

export function createPartnerService(deps: { db: Db }) {
  return {
    async pickupLocation(id: string) {
      const location = await findPickupLocation(deps.db, id);
      if (!location) throw new AppError('NOT_FOUND', 'Kitchen not found.');
      return location;
    },
  };
}

export type PartnerService = ReturnType<typeof createPartnerService>;
