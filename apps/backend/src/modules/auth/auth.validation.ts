import { RoleEnum } from '@pk/shared';
import { z } from 'zod';

/** Row schemas — every query result is parsed (D-07). */
export const UserRowSchema = z.object({
  id: z.uuid(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
  role: RoleEnum,
  password_hash: z.string().nullable(),
  totp_secret_enc: z.string().nullable(),
  is_active: z.boolean(),
});
export type UserRow = z.infer<typeof UserRowSchema>;

export const RefreshTokenRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  family_id: z.uuid(),
  expires_at: z.date(),
  revoked_at: z.date().nullable(),
  replaced_by_id: z.uuid().nullable(),
});
export type RefreshTokenRow = z.infer<typeof RefreshTokenRowSchema>;
