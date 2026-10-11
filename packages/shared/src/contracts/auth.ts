import { z } from 'zod';
import { RoleEnum } from '../auth/roles';
import { PhoneSchema } from '../schemas/common';

/** Request/response contracts for /api/v1/auth (architecture/02 §1). */

export const OtpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const TotpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

export const OtpSendRequestSchema = z.object({ phone: PhoneSchema });
export const OtpSendResponseSchema = z.object({ sent: z.literal(true), resendAfterSec: z.number().int().positive() });

export const OtpVerifyRequestSchema = z.object({ phone: PhoneSchema, otp: OtpCodeSchema });

export const StaffLoginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  totp: TotpCodeSchema.optional(),
});

/** D-19: staff passwords — length over complexity rules. */
export const NewPasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'Use at most 200 characters');

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: NewPasswordSchema,
});

export const TotpSetupResponseSchema = z.object({ otpauthUrl: z.string().startsWith('otpauth://') });
export const TotpVerifyRequestSchema = z.object({ code: TotpCodeSchema });
export const TotpVerifyResponseSchema = z.object({ enabled: z.literal(true) });

/** Phone is masked in every auth response (+91******3210). Never the raw number. */
export const SessionUserSchema = z.object({
  id: z.uuid(),
  role: RoleEnum,
  fullName: z.string().nullable(),
  phoneMasked: z.string().nullable(),
  email: z.string().nullable(),
  totpEnabled: z.boolean(),
});

export const AuthUserResponseSchema = z.object({ user: SessionUserSchema });
export const MeResponseSchema = z.object({
  user: SessionUserSchema,
  pickupLocationIds: z.array(z.uuid()),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type OtpSendRequest = z.infer<typeof OtpSendRequestSchema>;
export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequestSchema>;
export type StaffLoginRequest = z.infer<typeof StaffLoginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/** +919876543210 → +91******3210 */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}
