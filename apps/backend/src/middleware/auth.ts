import type { Role } from '@pk/shared';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { ACCESS_COOKIE } from '../modules/auth/auth.cookies';
import type { TokenService } from '../modules/auth/auth.tokens';
import { AppError } from '../utils/app-error';

export interface AuthContext {
  userId: string;
  role: Role;
  pickupLocationIds: string[];
  /** ADMIN has TOTP enrolled (D-19). */
  mfa: boolean;
  /**
   * Dev-only (D-57 i): a KITCHEN_PARTNER signed in through the OTP bypass, acting as a CUSTOMER on
   * the storefront. `role` is then 'CUSTOMER' and the staff routes refuse the session.
   */
  devCustomer?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/** Route guards (Phase 2 §2.5). Client-side guards are UX only — these are the real enforcement. */
export function createAuthGuards(
  tokens: TokenService,
  opts: {
    adminTotpRequired?: boolean;
    /** Dev-only staff OTP bypass configured (never in production) — honour `dc` sessions (D-57 i). */
    devCustomerSessions?: boolean;
  } = {},
) {
  /** Claims → request.auth. A `dc` token is a CUSTOMER session, and is invalid when the bypass is off. */
  const authFrom = async (token: string): Promise<AuthContext> => {
    const claims = await tokens.verifyAccess(token);
    if (claims.dc) {
      if (!opts.devCustomerSessions || claims.role !== 'KITCHEN_PARTNER') throw new Error('dev customer session off');
      return { userId: claims.sub, role: 'CUSTOMER', pickupLocationIds: [], mfa: false, devCustomer: true };
    }
    return { userId: claims.sub, role: claims.role, pickupLocationIds: claims.locs ?? [], mfa: claims.mfa === true };
  };

  const requireAuth: preHandlerAsyncHookHandler = async (request: FastifyRequest) => {
    const token = request.cookies[ACCESS_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
    try {
      request.auth = await authFrom(token);
    } catch {
      // Expired or tampered — the client refreshes once and retries
      throw new AppError('UNAUTHENTICATED', 'Your session has expired.', { reason: 'access_token_invalid' });
    }
  };

  /** Public routes that behave better for a signed-in user (checkout, order status): never rejects. */
  const optionalAuth: preHandlerAsyncHookHandler = async (request: FastifyRequest) => {
    const token = request.cookies[ACCESS_COOKIE];
    if (!token) return;
    try {
      request.auth = await authFrom(token);
    } catch {
      // expired/invalid → treat as a guest
    }
  };

  /**
   * Role gate. In production (adminTotpRequired) an ADMIN without TOTP enrolled is refused
   * everywhere except the 2FA enrolment routes (`allowWithoutMfa`) — D-19, Phase 10 §10.1.
   */
  const requireRole =
    (roles: readonly Role[], o: { allowWithoutMfa?: boolean } = {}): preHandlerAsyncHookHandler =>
    async (request: FastifyRequest) => {
      if (!request.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
      if (!roles.includes(request.auth.role)) throw new AppError('FORBIDDEN', 'You do not have access to this.');
      if (opts.adminTotpRequired && request.auth.role === 'ADMIN' && !request.auth.mfa && !o.allowWithoutMfa) {
        throw new AppError('FORBIDDEN', 'Turn on two-factor authentication to use the admin console.', {
          reason: 'TOTP_ENROLLMENT_REQUIRED',
        });
      }
    };

  /** ADMIN: any location. KITCHEN_PARTNER: only locations mapped in user_pickup_locations. */
  const requirePickupLocationAccess =
    (locationIdFrom: (request: FastifyRequest) => string | undefined): preHandlerAsyncHookHandler =>
    async (request: FastifyRequest) => {
      const auth = request.auth;
      if (!auth) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
      if (auth.role === 'ADMIN') return;
      const locationId = locationIdFrom(request);
      if (auth.role !== 'KITCHEN_PARTNER' || !locationId || !auth.pickupLocationIds.includes(locationId)) {
        throw new AppError('FORBIDDEN', 'You do not have access to this kitchen.');
      }
    };

  return { requireAuth, optionalAuth, requireRole, requirePickupLocationAccess };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;

/** For handlers behind requireAuth. */
export function authOf(request: FastifyRequest, _reply?: FastifyReply): AuthContext {
  if (!request.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
  return request.auth;
}
