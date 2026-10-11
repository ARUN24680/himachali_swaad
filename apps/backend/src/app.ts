import cookie from '@fastify/cookie';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from './config/db';
import type { ErrorReporter } from './config/sentry';
import type { ConversionsClient } from './integrations/meta/conversions';
import { createStubServiceabilityProvider, type ServiceabilityProvider } from './integrations/shipping/serviceability';
import type { OtpProvider } from './integrations/sms/otp-provider';
import type { LocalDiskStorage } from './integrations/storage/local-disk';
import type { ObjectStorage } from './integrations/storage/storage';
import type { StorefrontRevalidator } from './integrations/storefront/revalidate';
import { createAuthGuards } from './middleware/auth';
import type { CookieConfig } from './modules/auth/auth.cookies';
import { authRoutes } from './modules/auth/auth.routes';
import { createAuthService } from './modules/auth/auth.service';
import { createTokenService } from './modules/auth/auth.tokens';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { cartRoutes } from './modules/cart/cart.routes';
import { createCartService } from './modules/cart/cart.service';
import { adminCatalogRoutes, publicCatalogRoutes } from './modules/catalog/catalog.routes';
import { createCatalogService } from './modules/catalog/catalog.service';
import { devStorageRoutes } from './modules/dev-storage/dev-storage.routes';
import { healthRoutes } from './modules/health/health.routes';
import { createHealthService } from './modules/health/health.service';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { createInventoryService } from './modules/inventory/inventory.service';
import { shippingRoutes } from './modules/shipping/shipping.routes';
import { createShippingService } from './modules/shipping/shipping.service';
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
  /** Product images (D-11). */
  storage: ObjectStorage;
  /** Purges storefront cache tags after catalog/stock writes. */
  revalidator: StorefrontRevalidator;
  /** Meta Conversions API (disabled no-op without credentials). */
  capi: ConversionsClient;
  /** Pincode serviceability; defaults to the stub until Phase 6 (Shiprocket). */
  serviceability?: ServiceabilityProvider;
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
  const inventoryService = createInventoryService({
    db: deps.db,
    settings: settingsService,
    revalidator: deps.revalidator,
  });
  const catalogService = createCatalogService({
    db: deps.db,
    settings: settingsService,
    inventory: inventoryService,
    storage: deps.storage,
    revalidator: deps.revalidator,
  });

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

  await app.register(publicCatalogRoutes, { prefix: '/api/v1/products', service: catalogService });
  await app.register(adminCatalogRoutes, { prefix: '/api/v1/admin', service: catalogService, guards });
  await app.register(cartRoutes, {
    prefix: '/api/v1/cart',
    service: createCartService({ db: deps.db, catalog: catalogService, settings: settingsService }),
  });
  await app.register(shippingRoutes, {
    prefix: '/api/v1/shipping',
    service: createShippingService({
      redis: deps.redis,
      provider: deps.serviceability ?? createStubServiceabilityProvider(),
      logger: deps.logger,
    }),
  });
  await app.register(analyticsRoutes, { prefix: '/api/v1/analytics', capi: deps.capi });
  await app.register(inventoryRoutes, { prefix: '/api/v1/batches', service: inventoryService, guards });
  if (deps.storage.kind === 'local') {
    await app.register(devStorageRoutes, { storage: deps.storage as LocalDiskStorage });
  }

  return app;
}
