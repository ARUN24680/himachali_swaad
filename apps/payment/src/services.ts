import type { Logger } from 'pino';
import type { Env } from './config/env';
import { createDb, type Db } from './config/db';
import { createAlertsService } from './modules/alerts/alerts.service';
import { createEmailChannel } from './modules/alerts/email';
import { createObserverChannel } from './modules/alerts/observer';
import { createCertLoader } from './modules/alerts/sns';
import { createCheckoutService } from './modules/checkout/checkout.service';
import { createGatewayService } from './modules/gateway/gateway.service';
import { createDispatcher } from './modules/outbox/outbox.service';

/** Wires every service from validated env. Shared by the server and the admin CLI. */
export function createServices(env: Env, logger: Logger, opts: { db?: Db } = {}) {
  const db =
    opts.db ??
    createDb(
      {
        connectionString: env.PAYMENT_DATABASE_URL,
        max: env.PAYMENT_DB_POOL_MAX,
        ssl: env.PAYMENT_DB_SSL,
        applicationName: 'pk-payment',
      },
      logger,
    );
  const gateway = createGatewayService({
    db,
    lateGraceMinutes: env.UPI_LATE_GRACE_MINUTES,
    defaultHoldMinutes: env.UPI_DEFAULT_HOLD_MINUTES,
  });
  const alerts = createAlertsService({ db, logger });
  const checkout = createCheckoutService({
    gateway,
    vpa: env.UPI_VPA,
    payeeName: env.UPI_PAYEE_NAME,
    storefrontUrl: env.PAYMENT_STOREFRONT_URL,
  });
  const email =
    env.UPI_ALERT_SNS_TOPIC_ARN && env.UPI_ALERT_EMAIL_RECIPIENT
      ? createEmailChannel({
          alerts,
          topicArn: env.UPI_ALERT_SNS_TOPIC_ARN,
          recipient: env.UPI_ALERT_EMAIL_RECIPIENT,
          bankDomains: env.UPI_BANK_EMAIL_DOMAINS,
          loadCert: createCertLoader(),
          logger,
        })
      : null;
  const observer = env.UPI_DEVICE_KEK
    ? createObserverChannel({
        db,
        alerts,
        kek: Buffer.from(env.UPI_DEVICE_KEK, 'base64'),
        bankSenders: env.UPI_BANK_SMS_SENDERS,
        logger,
      })
    : null;
  const dispatcher = createDispatcher({
    db,
    url: env.PAYMENT_WEBHOOK_URL,
    secret: env.PAYMENT_WEBHOOK_SECRET,
    logger,
  });
  return { db, gateway, alerts, checkout, email, observer, dispatcher };
}

export type Services = ReturnType<typeof createServices>;
