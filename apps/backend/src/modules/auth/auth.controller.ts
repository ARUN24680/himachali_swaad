import type { ChangePasswordRequest, OtpSendRequest, OtpVerifyRequest, StaffLoginRequest } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { ok } from '../../utils/response';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies, type CookieConfig } from './auth.cookies';
import type { AuthService, IssuedSession, RequestContext } from './auth.service';

const ctxOf = (request: FastifyRequest): RequestContext => ({
  ip: request.ip ?? null,
  userAgent: request.headers['user-agent'] ?? null,
});

export function createAuthController(service: AuthService, cookies: CookieConfig) {
  const startSession = (request: FastifyRequest, reply: FastifyReply, session: IssuedSession) => {
    setSessionCookies(reply, cookies, { access: session.accessToken, refresh: session.refreshToken });
    return ok(request, { user: session.user });
  };

  return {
    sendOtp: async (request: FastifyRequest<{ Body: OtpSendRequest }>) =>
      ok(request, await service.sendOtp(request.body.phone)),

    verifyOtp: async (request: FastifyRequest<{ Body: OtpVerifyRequest }>, reply: FastifyReply) =>
      startSession(request, reply, await service.verifyOtp(request.body.phone, request.body.otp, ctxOf(request))),

    staffLogin: async (request: FastifyRequest<{ Body: StaffLoginRequest }>, reply: FastifyReply) =>
      startSession(request, reply, await service.staffLogin(request.body, ctxOf(request))),

    refresh: async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = request.cookies[REFRESH_COOKIE];
      if (!raw) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
      try {
        return startSession(request, reply, await service.refresh(raw, ctxOf(request)));
      } catch (err) {
        // A dead refresh token is useless to the browser — clear it so the client goes to sign-in.
        // Exception: a concurrent-refresh race, where the other request already set fresh cookies.
        if (err instanceof AppError && err.details?.reason !== 'race') clearSessionCookies(reply, cookies);
        throw err;
      }
    },

    logout: async (request: FastifyRequest, reply: FastifyReply) => {
      await service.logout(request.cookies[REFRESH_COOKIE]);
      clearSessionCookies(reply, cookies);
      return ok(request, { loggedOut: true as const });
    },

    logoutAll: async (request: FastifyRequest, reply: FastifyReply) => {
      await service.logoutAll(authOf(request).userId, ctxOf(request));
      clearSessionCookies(reply, cookies);
      return ok(request, { loggedOut: true as const });
    },

    me: async (request: FastifyRequest) => ok(request, await service.me(authOf(request).userId)),

    changePassword: async (request: FastifyRequest<{ Body: ChangePasswordRequest }>, reply: FastifyReply) =>
      startSession(request, reply, await service.changePassword(authOf(request).userId, request.body, ctxOf(request))),

    totpSetup: async (request: FastifyRequest) => ok(request, await service.totpSetup(authOf(request).userId)),

    totpVerify: async (request: FastifyRequest<{ Body: { code: string } }>) =>
      ok(request, await service.totpVerify(authOf(request).userId, request.body.code, ctxOf(request))),
  };
}
