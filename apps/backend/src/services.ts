import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from './config/db';
import type { ErrorReporter } from './config/sentry';
import type { PaymentGateway } from './integrations/razorpay/gateway';
import type { PushSender } from './integrations/push/web-push';
import type { MessagingDeps } from './config/messaging';
import type { ShiprocketApi } from './integrations/shiprocket/client';
import type { PincodeDirectory } from './integrations/shipping/pincode-directory';
import type { ObjectStorage } from './integrations/storage/storage';
import type { PrivateStorage } from './integrations/storage/private';
import type { StorefrontRevalidator } from './integrations/storefront/revalidate';
import type { JobQueue } from './jobs/queues';
import { createAccountService } from './modules/account/account.service';
import { createCartService } from './modules/cart/cart.service';
import { createCatalogService } from './modules/catalog/catalog.service';
import { createCheckoutService } from './modules/checkout/checkout.service';
import { createInventoryService } from './modules/inventory/inventory.service';
import { createLogisticsService } from './modules/logistics/logistics.service';
import { createNotificationsService } from './modules/notifications/notifications.service';
import { createMessagesService } from './modules/notifications/messages.service';
import { createPartnerService } from './modules/partner/partner.service';
import { createTrackingService } from './modules/tracking/tracking.service';
import { createAdminService } from './modules/admin/admin.service';
import { createExportsService } from './modules/admin/exports.service';
import { createOpsAlertsService } from './modules/admin/ops-alerts.service';
import { createSettlementsService } from './modules/settlements/settlements.service';
import { createUsersService } from './modules/users/users.service';
import { createInvoiceService } from './modules/orders/invoice.service';
import { createOrdersService } from './modules/orders/orders.service';
import { createPaymentsService } from './modules/payments/payments.service';
import { createSettingsService } from './modules/settings/settings.service';
import { createWebhooksService } from './modules/webhooks/webhooks.service';

export interface CommerceDeps {
  db: Db;
  redis: Redis;
  logger: Logger;
  reporter: ErrorReporter;
  storage: ObjectStorage;
  privateStorage: PrivateStorage;
  revalidator: StorefrontRevalidator;
  gateway: PaymentGateway;
  jobs: JobQueue;
  /** Non-production: invoices may be issued as DRAFT while Q-02 seller details are unset. */
  allowDraftInvoice: boolean;
  /** Real Shiprocket or the sandbox over HTTP (Phase 6). */
  shiprocket: ShiprocketApi;
  /** `x-api-key` the courier-tracking webhook must carry. */
  courierWebhookToken: string;
  /** Web Push for partner alerts (Phase 7); disabled sender without VAPID keys. */
  push: PushSender;
  /** WhatsApp / SMS / e-mail providers + message config (Phase 8). */
  messaging: Omit<MessagingDeps, 'webhook'>;
  /** Clock for logistics cut-off / pickup-missed logic (tests). */
  now?: () => Date;
}

/**
 * The commerce service graph (catalog → cart → checkout → payments → orders), built the same way
 * by the HTTP server (app.ts), the worker (worker.ts) and integration tests.
 */
export function createCommerceServices(d: CommerceDeps) {
  const settings = createSettingsService();
  const inventory = createInventoryService({ db: d.db, settings, revalidator: d.revalidator });
  const catalog = createCatalogService({
    db: d.db,
    settings,
    inventory,
    storage: d.storage,
    revalidator: d.revalidator,
  });
  const cart = createCartService({ db: d.db, catalog, settings });
  const account = createAccountService({ db: d.db });
  const orders = createOrdersService({
    db: d.db,
    inventory,
    gateway: d.gateway,
    jobs: d.jobs,
    privateStorage: d.privateStorage,
    logger: d.logger,
  });
  const checkout = createCheckoutService({
    db: d.db,
    redis: d.redis,
    cart,
    inventory,
    orders,
    account,
    settings,
    gateway: d.gateway,
    logger: d.logger,
  });
  const payments = createPaymentsService({
    db: d.db,
    gateway: d.gateway,
    inventory,
    jobs: d.jobs,
    logger: d.logger,
    reporter: d.reporter,
  });
  const logistics = createLogisticsService({
    db: d.db,
    settings,
    shiprocket: d.shiprocket,
    privateStorage: d.privateStorage,
    jobs: d.jobs,
    logger: d.logger,
    reporter: d.reporter,
    now: d.now,
  });
  const webhooks = createWebhooksService({
    db: d.db,
    gateway: d.gateway,
    payments,
    logistics,
    jobs: d.jobs,
    courierWebhookToken: d.courierWebhookToken,
    logger: d.logger,
    reporter: d.reporter,
    now: d.now,
  });
  const invoices = createInvoiceService({
    db: d.db,
    settings,
    privateStorage: d.privateStorage,
    allowDraft: d.allowDraftInvoice,
    logger: d.logger,
  });
  const notifications = createNotificationsService({ db: d.db, push: d.push, jobs: d.jobs, logger: d.logger });
  const partner = createPartnerService({
    db: d.db,
    settings,
    jobs: d.jobs,
    privateStorage: d.privateStorage,
    logger: d.logger,
    now: d.now,
  });
  const messages = createMessagesService({
    db: d.db,
    redis: d.redis,
    whatsapp: d.messaging.whatsapp,
    sms: d.messaging.sms,
    email: d.messaging.email,
    jobs: d.jobs,
    logger: d.logger,
    config: d.messaging.config,
    now: d.now,
  });
  const tracking = createTrackingService({ db: d.db, redis: d.redis, orders, logger: d.logger });
  const admin = createAdminService({ db: d.db, redis: d.redis, jobs: d.jobs, settings, webhooks, logger: d.logger });
  const exportsService = createExportsService({ db: d.db });
  const settlements = createSettlementsService({
    db: d.db,
    settings,
    gateway: d.gateway,
    privateStorage: d.privateStorage,
    jobs: d.jobs,
    logger: d.logger,
  });
  const users = createUsersService({ db: d.db, redis: d.redis });
  const opsAlerts = createOpsAlertsService({ db: d.db, redis: d.redis, jobs: d.jobs, logger: d.logger, now: d.now });
  return {
    settings,
    inventory,
    catalog,
    cart,
    account,
    orders,
    checkout,
    payments,
    webhooks,
    invoices,
    logistics,
    notifications,
    partner,
    tracking,
    messages,
    admin,
    exportsService,
    settlements,
    users,
    opsAlerts,
  };
}

export type CommerceServices = ReturnType<typeof createCommerceServices>;
export type { PincodeDirectory };
