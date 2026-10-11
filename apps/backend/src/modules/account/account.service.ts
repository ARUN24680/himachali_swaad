import {
  MAX_SAVED_ADDRESSES,
  type AddressCreateRequest,
  type AddressRow,
  type AddressUpdateRequest,
  type SavedAddress,
} from '@pk/shared';
import type { Db, Queryable } from '../../config/db';
import { AppError } from '../../utils/app-error';
import * as repo from './account.repository';

const toSaved = (r: AddressRow): SavedAddress => ({
  id: r.id,
  label: r.label,
  fullName: r.full_name,
  phone: r.phone,
  line1: r.line1,
  line2: r.line2,
  landmark: r.landmark,
  city: r.city,
  state: r.state,
  pincode: r.pincode,
  isDefault: r.is_default,
  createdAt: r.created_at.toISOString(),
});

type ParsedCreate = Omit<AddressCreateRequest, 'isDefault'> & { isDefault: boolean };

const fields = (a: Omit<ParsedCreate, 'isDefault'>): repo.AddressFields => ({
  label: a.label ?? null,
  fullName: a.fullName,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2 ?? null,
  landmark: a.landmark ?? null,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
});

/**
 * Logged-in customer's saved addresses (Phase 5 §5.3): max 10, exactly one default (partial unique
 * index). Writes lock the user row so the count limit and default flip can't race.
 */
export function createAccountService(deps: { db: Db }) {
  const { db } = deps;

  async function insertLocked(client: Queryable, userId: string, a: ParsedCreate): Promise<AddressRow> {
    const count = await repo.countAddresses(client, userId);
    if (count >= MAX_SAVED_ADDRESSES) {
      throw new AppError('VALIDATION_FAILED', `You can save up to ${MAX_SAVED_ADDRESSES} addresses.`, {
        field: 'addresses',
      });
    }
    const isDefault = a.isDefault || count === 0;
    if (isDefault) await repo.clearDefault(client, userId);
    return repo.insertAddress(client, userId, { ...fields(a), isDefault });
  }

  return {
    list: async (userId: string) => (await repo.listAddresses(db, userId)).map(toSaved),

    create: (userId: string, a: ParsedCreate) =>
      db.transaction(async (client) => {
        await repo.lockUser(client, userId);
        return toSaved(await insertLocked(client, userId, a));
      }),

    update: (userId: string, id: string, patch: AddressUpdateRequest) =>
      db.transaction(async (client) => {
        await repo.lockUser(client, userId);
        const current = await repo.findAddress(client, userId, id, true);
        if (!current) throw new AppError('NOT_FOUND', 'Address not found.');
        if (patch.isDefault === false && current.is_default) {
          throw new AppError('VALIDATION_FAILED', 'Choose another address as default instead.', { field: 'isDefault' });
        }
        if (patch.isDefault) await repo.clearDefault(client, userId);
        const { label, ...rest } = patch;
        const updated = await repo.updateAddress(client, userId, id, {
          ...rest,
          ...(label !== undefined ? { label: label ?? null } : {}),
        });
        return toSaved(updated!);
      }),

    remove: (userId: string, id: string) =>
      db.transaction(async (client) => {
        await repo.lockUser(client, userId);
        if (!(await repo.deleteAddress(client, userId, id))) throw new AppError('NOT_FOUND', 'Address not found.');
        await repo.promoteNewestToDefault(client, userId);
      }),

    /**
     * Checkout "save this address" (inside the checkout transaction). Skips silently when it's
     * already saved or the 10-address limit is reached — saving must never block a payment.
     */
    async saveCheckoutAddress(client: Queryable, userId: string, a: Omit<ParsedCreate, 'isDefault' | 'label'>) {
      await repo.lockUser(client, userId);
      const f = fields(a);
      if (await repo.findSameAddress(client, userId, f)) return;
      if ((await repo.countAddresses(client, userId)) >= MAX_SAVED_ADDRESSES) return;
      await insertLocked(client, userId, { ...a, isDefault: false });
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
