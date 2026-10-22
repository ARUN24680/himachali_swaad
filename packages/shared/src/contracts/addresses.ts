import { z } from 'zod';
import { PhoneSchema } from '../schemas/common';
import { CheckoutAddressSchema } from './checkout';

/** /api/v1/me/addresses — logged-in CUSTOMER saved addresses (Phase 5 §5.3). */
export const MAX_SAVED_ADDRESSES = 10;

export const AddressCreateRequestSchema = CheckoutAddressSchema.extend({
  label: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  fullName: z.string().trim().min(2).max(120),
  phone: PhoneSchema,
  isDefault: z.boolean().default(false),
});
export type AddressCreateRequest = z.input<typeof AddressCreateRequestSchema>;

// isDefault re-declared without its create-time default: zod 4 applies defaults inside .partial(), so
// every PATCH would otherwise send isDefault=false and editing the default address would be refused.
export const AddressUpdateRequestSchema = AddressCreateRequestSchema.extend({ isDefault: z.boolean().optional() })
  .partial()
  .refine((a) => Object.values(a).some((v) => v !== undefined), { message: 'Nothing to update' });
export type AddressUpdateRequest = z.input<typeof AddressUpdateRequestSchema>;

export const SavedAddressSchema = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  fullName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  landmark: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type SavedAddress = z.infer<typeof SavedAddressSchema>;

export const AddressListResponseSchema = z.object({ addresses: z.array(SavedAddressSchema) });
export const AddressResponseSchema = z.object({ address: SavedAddressSchema });
export const AddressIdParamsSchema = z.object({ id: z.uuid() });
