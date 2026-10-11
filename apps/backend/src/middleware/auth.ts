import type { Role } from '@pk/shared';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { ACCESS_COOKIE } from '../modules/auth/auth.cookies';
import type { TokenService } from '../modules/auth/auth.tokens';
import { AppError } from '../utils/app-error';

export interface AuthContext {
  userId: string;
  role: Role;
  pickupLocationIds: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/** Route guards (Phase 2 §2.5). Client-side guards are UX only — these are the real enforcement. */
export function createAuthGuards(tokens: TokenService) {
  const requireAuth: preHandlerAsyncHookHandler = async (request: FastifyRequest) => {
    const token = request.cookies[ACCESS_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
    try {
      const claims = await tokens.verifyAccess(token);
      request.auth = { userId: claims.sub, role: claims.role, pickupLocationIds: claims.locs ?? [] };
    } catch {
      // Expired or tampered — the client refreshes once and retries
      throw new AppError('UNAUTHENTICATED', 'Your session has expired.', { reason: 'access_token_invalid' });
    }
  };

  const requireRole =
    (roles: readonly Role[]): preHandlerAsyncHookHandler =>
    async (request: FastifyRequest) => {
      if (!request.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
      if (!roles.includes(request.auth.role)) throw new AppError('FORBIDDEN', 'You do not have access to this.');
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

  return { requireAuth, requireRole, requirePickupLocationAccess };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;

/** For handlers behind requireAuth. */
export function authOf(request: FastifyRequest, _reply?: FastifyReply): AuthContext {
  if (!request.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
  return request.auth;
}
