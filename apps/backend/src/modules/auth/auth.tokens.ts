import { createHash, randomBytes } from 'node:crypto';
import { RoleEnum, type Role } from '@pk/shared';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

/** Access-token claims — ids and role only, never phone/email (Phase 2 §2.4). */
const AccessClaimsSchema = z.object({
  sub: z.uuid(),
  role: RoleEnum,
  locs: z.array(z.uuid()).optional(),
  /** Second factor enrolled (ADMIN TOTP, D-19) — gates the admin console in production (Phase 10). */
  mfa: z.boolean().optional(),
  /**
   * Dev-only customer session for a KITCHEN_PARTNER phone in OTP_DEV_STAFF_BYPASS_PHONES (D-57 i).
   * Only minted by the OTP bypass; the guards honour it only while that bypass is configured.
   */
  dc: z.literal(true).optional(),
});
export type AccessClaims = z.infer<typeof AccessClaimsSchema>;

const ISSUER = 'pk-api';
const AUDIENCE = 'pk';

export function createTokenService(opts: { secret: string; accessTtlSec: number }) {
  const key = new TextEncoder().encode(opts.secret);

  return {
    accessTtlSec: opts.accessTtlSec,

    signAccess(claims: {
      userId: string;
      role: Role;
      pickupLocationIds?: string[];
      mfa?: boolean;
      devCustomer?: boolean;
    }): Promise<string> {
      const payload: Record<string, unknown> = { role: claims.role };
      if (claims.pickupLocationIds?.length) payload.locs = claims.pickupLocationIds;
      if (claims.mfa) payload.mfa = true;
      if (claims.devCustomer) payload.dc = true;
      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(claims.userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${opts.accessTtlSec}s`)
        .sign(key);
    },

    /** Throws on bad signature, wrong issuer/audience, expiry or unexpected claims. */
    async verifyAccess(token: string): Promise<AccessClaims> {
      const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      return AccessClaimsSchema.parse(payload);
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

/** Opaque refresh token: 32 random bytes. Only its SHA-256 is stored (refresh_tokens.token_hash). */
export const newRefreshToken = () => randomBytes(32).toString('base64url');

/**
 * Refresh tokens of a dev-customer session (D-57 i) carry this prefix so rotation keeps the session
 * type. base64url never contains '.', and the stored SHA-256 covers the prefix — it cannot be added
 * to or stripped from an existing token without the lookup failing.
 */
export const DEV_CUSTOMER_REFRESH_PREFIX = 'dc.';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
