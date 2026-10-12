import cookie from '@fastify/cookie';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from './config/db';
import type { ErrorReporter } from './config/sentry';
import type { ConversionsClient } from './integrations/meta/conversions';
import {
  createShiprocketServiceabilityProvider,
  type ServiceabilityProvider,
} from './integrations/shipping/serviceability';
import type { PushSender } from './integrations/push/web-push';
import type { MessagingDeps } from './config/messaging';
import type { ShiprocketApi } from './integrations/shiprocket/client';
import type { ShiprocketSandbox } from './integrations/shiprocket/sandbox';
import type { FastifyPluginAsync } from 'fastify';
import { createIndiaPostDirectory, type PincodeDirectory } from './integrations/shipping/pincode-directory';
import type { PaymentGateway } from './integrations/razorpay/gateway';
import type { MockPaymentGateway } from './integrations/razorpay/mock';
import type { LocalPrivateStorage, PrivateStorage } from './integrations/storage/private';
import type { BullJobQueue, JobQueue } from './jobs/queues';
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
import { adminCatalogRoutes, publicCatalogRoutes } from './modules/catalog/catalog.routes';
import { devStorageRoutes } from './modules/dev-storage/dev-storage.routes';
import { healthRoutes } from './modules/health/health.routes';
import { createHealthService } from './modules/health/health.service';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { shippingRoutes } from './modules/shipping/shipping.routes';
import { createShippingService } from './modules/shipping/shipping.service';
import { partnerRoutes } from './modules/partner/partner.routes';
import { adminSettingsRoutes } from './modules/settings/settings.routes';
import { accountRoutes } from './modules/account/account.routes';
import { checkoutRoutes } from './modules/checkout/checkout.routes';
import { devPaymentRoutes } from './modules/dev-payments/dev-payments.routes';
import { devShippingRoutes } from './modules/dev-shipping/dev-shipping.routes';
import { labelRoutes } from './modules/logistics/logistics.routes';
import { myOrdersRoutes, trackRoutes } from './modules/tracking/tracking.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { adminSettlementRoutes, partnerSettlementRoutes } from './modules/settlements/settlements.routes';
import { staffRoutes } from './modules/users/users.routes';
import { whatsappWebhookRoutes } from './modules/notifications/whatsapp-webhook.routes';
import { devMessageRoutes } from './modules/dev-messages/dev-messages.routes';
import type { MockMessageProvider } from './integrations/messaging/mock';
import { adminOrderRoutes, orderRoutes } from './modules/orders/orders.routes';
import { paymentsRoutes } from './modules/payments/payments.routes';
import { webhookRoutes } from './modules/webhooks/webhooks.routes';
import { registerQueueDashboard } from './plugins/queue-dashboard';
import { registerOriginCheck } from './plugins/csrf';
import { createCommerceServices } from './services';
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
  /** Pincode serviceability; defaults to Shiprocket (origin = default kitchen). */
  serviceability?: ServiceabilityProvider;
  /** Shiprocket client (real API or the sandbox over HTTP) — Phase 6. */
  shiprocket: ShiprocketApi;
  /** Courier-tracking webhook token (`x-api-key`). */
  courierWebhookToken: string;
  /** Dev/CI: mount the Shiprocket sandbox at /api/v1/dev/shiprocket + the shipping simulator. */
  shiprocketSandbox?: { state: ShiprocketSandbox; plugin: FastifyPluginAsync };
  /** Web Push sender (Phase 7). */
  push: PushSender;
  /** WhatsApp / SMS / e-mail + webhook secrets (Phase 8). */
  messaging: MessagingDeps;
  /** Clock override for logistics (tests). */
  now?: () => Date;
  /** PIN → city/state auto-fill; defaults to India Post. */
  pincodeDirectory?: PincodeDirectory;
  /** Invoices + labels (D-11). */
  privateStorage: PrivateStorage;
  /** Razorpay or the dev/CI mock (Phase 5). */
  gateway: PaymentGateway;
  /** BullMQ producer (worker consumes). */
  jobs: JobQueue;
  /** bull-board at /admin/queues (ADMIN) when the real BullMQ queues are passed (D-09). */
  queueDashboard?: BullJobQueue;
  /** Mock gateway: delay before the simulated webhook arrives (0 = synchronous, tests). */
  mockWebhookDelayMs?: number;
  /** Non-production may issue DRAFT invoices while seller details (Q-02) are unset. */
  allowDraftInvoice?: boolean;
  trustProxy?: boolean;
  rateLimit?: { max: number; windowMs: number };
  /** create-order per IP per 10 min (default 10; CI e2e raises it). */
  checkoutIpLimit?: number;
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
  const svc = createCommerceServices({
    db: deps.db,
    redis: deps.redis,
    logger: deps.logger,
    reporter: deps.reporter,
    storage: deps.storage,
    privateStorage: deps.privateStorage,
    revalidator: deps.revalidator,
    gateway: deps.gateway,
    jobs: deps.jobs,
    allowDraftInvoice: deps.allowDraftInvoice ?? false,
    shiprocket: deps.shiprocket,
    courierWebhookToken: deps.courierWebhookToken,
    push: deps.push,
    messaging: deps.messaging,
    now: deps.now,
  });
  const settingsService = svc.settings;
  const inventoryService = svc.inventory;
  const catalogService = svc.catalog;

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
    service: svc.partner,
    notifications: svc.notifications,
    guards,
  });

  await app.register(publicCatalogRoutes, { prefix: '/api/v1/products', service: catalogService });
  await app.register(adminCatalogRoutes, { prefix: '/api/v1/admin', service: catalogService, guards });
  await app.register(cartRoutes, { prefix: '/api/v1/cart', service: svc.cart });
  await app.register(shippingRoutes, {
    prefix: '/api/v1/shipping',
    service: createShippingService({
      redis: deps.redis,
      provider:
        deps.serviceability ??
        createShiprocketServiceabilityProvider({
          shiprocket: deps.shiprocket,
          originPincode: () => svc.logistics.originPincode(),
        }),
      directory: deps.pincodeDirectory ?? createIndiaPostDirectory(),
      logger: deps.logger,
    }),
  });
  await app.register(analyticsRoutes, {
    prefix: '/api/v1/analytics',
    capi: deps.capi,
    purchaseFacts: (code) => svc.orders.purchaseFacts(code),
  });
  await app.register(inventoryRoutes, { prefix: '/api/v1/batches', service: inventoryService, guards });

  // ── Phase 5: checkout, payments, orders ─────────────────────────────────
  await app.register(checkoutRoutes, {
    prefix: '/api/v1/checkout',
    service: svc.checkout,
    guards,
    ipLimit: deps.checkoutIpLimit ?? 10,
  });
  await app.register(paymentsRoutes, { prefix: '/api/v1/payments', service: svc.payments });
  await app.register(orderRoutes, { prefix: '/api/v1/orders', service: svc.orders, guards });
  await app.register(adminOrderRoutes, { prefix: '/api/v1/admin/orders', service: svc.orders, guards });
  await app.register(accountRoutes, { prefix: '/api/v1/me', service: svc.account, guards });
  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks', service: svc.webhooks });

  // ── Phase 9: admin console ──────────────────────────────────────────────
  await app.register(adminRoutes, {
    prefix: '/api/v1/admin',
    service: svc.admin,
    exportsService: svc.exportsService,
    guards,
  });
  await app.register(adminSettlementRoutes, { prefix: '/api/v1/admin', service: svc.settlements, guards });
  await app.register(partnerSettlementRoutes, { prefix: '/api/v1/partner', service: svc.settlements, guards });
  await app.register(staffRoutes, { prefix: '/api/v1/admin/staff', service: svc.users, guards });

  // ── Phase 8: tracking ───────────────────────────────────────────────────
  await app.register(trackRoutes, { prefix: '/api/v1', service: svc.tracking });
  await app.register(myOrdersRoutes, { prefix: '/api/v1/me', service: svc.tracking, guards });
  await app.register(whatsappWebhookRoutes, {
    prefix: '/api/v1/webhooks',
    messages: svc.messages,
    appSecret: deps.messaging.webhook.appSecret,
    verifyToken: deps.messaging.webhook.verifyToken,
  });
  if (deps.messaging.whatsapp.name === 'mock-whatsapp' && deps.messaging.sms.name === 'mock-sms') {
    await app.register(devMessageRoutes, {
      prefix: '/api/v1/dev/messages',
      whatsapp: deps.messaging.whatsapp as MockMessageProvider,
      sms: deps.messaging.sms as MockMessageProvider,
      appSecret: deps.messaging.webhook.appSecret,
    });
  }

  // ── Phase 6: logistics ──────────────────────────────────────────────────
  await app.register(labelRoutes, { prefix: '/api/v1', service: svc.logistics, guards });
  if (deps.shiprocketSandbox) {
    await app.register(deps.shiprocketSandbox.plugin, { prefix: '/api/v1/dev/shiprocket' });
    await app.register(devShippingRoutes, {
      prefix: '/api/v1/dev/shipping',
      sandbox: deps.shiprocketSandbox.state,
      logistics: svc.logistics,
      orders: svc.orders,
      webhookToken: deps.courierWebhookToken,
    });
  }
  if (deps.gateway.kind === 'mock') {
    await app.register(devPaymentRoutes, {
      prefix: '/api/v1/dev/payments',
      gateway: deps.gateway as MockPaymentGateway,
      webhookDelayMs: deps.mockWebhookDelayMs ?? 2000,
    });
  }
  if (deps.queueDashboard) await registerQueueDashboard(app, deps.queueDashboard, guards);

  if (deps.storage.kind === 'local') {
    await app.register(devStorageRoutes, {
      storage: deps.storage as LocalDiskStorage,
      privateStorage: deps.privateStorage.kind === 'local' ? (deps.privateStorage as LocalPrivateStorage) : null,
    });
  }

  return app;
}
