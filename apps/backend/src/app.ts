import cookie from '@fastify/cookie';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from './config/db';
import type { ErrorReporter } from './config/sentry';
import type { OtpProvider } from './integrations/sms/otp-provider';
import { createAuthGuards } from './middleware/auth';
import type { CookieConfig } from './modules/auth/auth.cookies';
import { authRoutes } from './modules/auth/auth.routes';
import { createAuthService } from './modules/auth/auth.service';
import { createTokenService } from './modules/auth/auth.tokens';
import { healthRoutes } from './modules/health/health.routes';
import { createHealthService } from './modules/health/health.service';
import { partnerRoutes } from './modules/partner/partner.routes';
import { createPartnerService } from './modules/partner/partner.service';
import { adminSettingsRoutes } from './modules/settings/settings.routes';
import { createSettingsService } from './modules/settings/settings.service';
import { registerOriginCheck } from './plugins/csrf';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSecurity } from './plugins/security';
import { genRequestId } from './utils/request-id';

export interface AuthConfig {
  jwtSecret: string;
  /** 32-byte AES key for TOTP secrets at rest. */
  totpKey: Buffer;
  otpProvider: OtpProvider;
  cookies: CookieConfig;
}

export interface AppDeps {
  logger: Logger;
  db: Db;
  redis: Redis;
  reporter: ErrorReporter;
  origins: string[];
  auth: AuthConfig;
  trustProxy?: boolean;
  rateLimit?: { max: number; windowMs: number };
}

/** Builds the Fastify app without listening — used by server.ts and by integration tests (`app.inject`). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // pino's Logger is a superset of FastifyBaseLogger; the cast keeps FastifyInstance's default logger generic
    loggerInstance: deps.logger as FastifyBaseLogger,
    genReqId: genRequestId,
    logController: new LogController({
      requestIdLogLabel: 'requestId',
      // Load-balancer probes would drown the request log
      disableRequestLogging: (req) => req.url === '/healthz' || req.url === '/readyz',
    }),
    bodyLimit: 1_048_576, // 1 MB; image uploads go direct to R2 (Phase 3)
    trustProxy: deps.trustProxy ?? false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandler(app, deps.reporter);
  await registerSecurity(app, {
    origins: deps.origins,
    redis: deps.redis,
    rateLimitMax: deps.rateLimit?.max ?? 300,
    rateLimitWindowMs: deps.rateLimit?.windowMs ?? 60_000,
  });
  registerOriginCheck(app, deps.origins);
  await app.register(cookie);

  // ── Services (one instance per app) ──────────────────────────────────────
  const tokens = createTokenService({ secret: deps.auth.jwtSecret, accessTtlSec: deps.auth.cookies.accessTtlSec });
  const guards = createAuthGuards(tokens);
  const authService = createAuthService({
    db: deps.db,
    redis: deps.redis,
    logger: deps.logger,
    tokens,
    otpProvider: deps.auth.otpProvider,
    otpPepper: deps.auth.jwtSecret,
    totpKey: deps.auth.totpKey,
    refreshTtlSec: deps.auth.cookies.refreshTtlSec,
  });
  const settingsService = createSettingsService();

  // ── Routes ───────────────────────────────────────────────────────────────
  await app.register(healthRoutes, { service: createHealthService({ db: deps.db, redis: deps.redis }) });
  await app.register(authRoutes, { prefix: '/api/v1/auth', service: authService, guards, cookies: deps.auth.cookies });
  await app.register(adminSettingsRoutes, {
    prefix: '/api/v1/admin/settings',
    service: settingsService,
    db: deps.db,
    guards,
  });
  await app.register(partnerRoutes, {
    prefix: '/api/v1/partner',
    service: createPartnerService({ db: deps.db }),
    guards,
  });

  return app;
}
