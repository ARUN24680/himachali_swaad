import type { AuthConfig } from '../app';
import { MockOtpProvider, Msg91OtpProvider, type OtpProvider } from '../integrations/sms/otp-provider';
import type { Env } from './env';

/** Translates validated env into the auth dependencies (D-20 cookies, D-21 OTP provider). */
export function authConfigFromEnv(env: Env): AuthConfig {
  const otpProvider: OtpProvider =
    env.OTP_PROVIDER === 'msg91'
      ? new Msg91OtpProvider({ authKey: env.MSG91_AUTH_KEY!, templateId: env.MSG91_OTP_TEMPLATE_ID! })
      : new MockOtpProvider({ echoToConsole: env.NODE_ENV === 'development' });

  return {
    jwtSecret: env.JWT_SECRET,
    totpKey: Buffer.from(env.TOTP_ENC_KEY, 'base64'),
    adminTotpRequired: env.NODE_ENV === 'production' || env.ADMIN_TOTP_REQUIRED === 'true',
    otpProvider,
    // Belt and braces: env validation already refuses a non-empty list in production
    otpDevStaffBypassPhones: env.NODE_ENV === 'production' ? [] : env.OTP_DEV_STAFF_BYPASS_PHONES,
    cookies: {
      // Host-only cookie on localhost; `.pahadikhatki.in` in staging/prod so admin + storefront share the API session
      domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
      secure: env.NODE_ENV === 'production',
      accessTtlSec: env.ACCESS_TOKEN_TTL_SEC,
      refreshTtlSec: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    },
  };
}
