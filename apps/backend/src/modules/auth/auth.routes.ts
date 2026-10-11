import {
  ChangePasswordRequestSchema,
  OtpSendRequestSchema,
  OtpVerifyRequestSchema,
  StaffLoginRequestSchema,
  TotpVerifyRequestSchema,
} from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuthGuards } from '../../middleware/auth';
import type { CookieConfig } from './auth.cookies';
import { createAuthController } from './auth.controller';
import type { AuthService } from './auth.service';

const TEN_MIN = 10 * 60_000;

/** /api/v1/auth — rate limits from architecture/02 §9 (per-phone OTP limits live in the service). */
export const authRoutes: FastifyPluginAsyncZod<{
  service: AuthService;
  guards: AuthGuards;
  cookies: CookieConfig;
}> = async (app, { service, guards, cookies }) => {
  const c = createAuthController(service, cookies);
  const { requireAuth, requireRole } = guards;

  app.post(
    '/otp/send',
    { schema: { body: OtpSendRequestSchema }, config: { rateLimit: { max: 10, timeWindow: TEN_MIN } } },
    c.sendOtp,
  );
  app.post(
    '/otp/verify',
    { schema: { body: OtpVerifyRequestSchema }, config: { rateLimit: { max: 20, timeWindow: TEN_MIN } } },
    c.verifyOtp,
  );
  app.post(
    '/staff/login',
    {
      schema: { body: StaffLoginRequestSchema },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 15 * 60_000,
          hook: 'preHandler', // body is parsed by then → key on email + IP
          keyGenerator: (req) =>
            `${req.ip}|${String((req.body as { email?: string } | undefined)?.email ?? '').toLowerCase()}`,
        },
      },
    },
    c.staffLogin,
  );
  app.post('/refresh', c.refresh);
  app.post('/logout', c.logout);
  app.post('/logout-all', { preHandler: [requireAuth] }, c.logoutAll);
  app.get('/me', { preHandler: [requireAuth] }, c.me);
  app.post(
    '/staff/change-password',
    {
      schema: { body: ChangePasswordRequestSchema },
      preHandler: [requireAuth, requireRole(['ADMIN', 'KITCHEN_PARTNER'])],
    },
    c.changePassword,
  );
  app.post('/staff/2fa/setup', { preHandler: [requireAuth, requireRole(['ADMIN'])] }, c.totpSetup);
  app.post(
    '/staff/2fa/verify',
    { schema: { body: TotpVerifyRequestSchema }, preHandler: [requireAuth, requireRole(['ADMIN'])] },
    c.totpVerify,
  );
};
