import { z } from 'zod';

/** E.164 Indian mobile: +91 followed by 10 digits starting 6–9 (matches users_phone_format CHECK). */
export const PhoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number');

/** 6-digit Indian PIN code, cannot start with 0 (matches pickup_locations CHECK). */
export const PincodeSchema = z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode');

/** Non-negative integer paise (D-26). */
export const PaiseSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const AddressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: PhoneSchema,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: PincodeSchema,
});

export type Address = z.infer<typeof AddressSchema>;
