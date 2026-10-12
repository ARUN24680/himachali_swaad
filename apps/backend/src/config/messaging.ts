import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { createLogEmailSender, createMockMessageProvider } from '../integrations/messaging/mock';
import { createMsg91SmsProvider } from '../integrations/messaging/msg91-sms';
import type { EmailSender, MessageProvider } from '../integrations/messaging/provider';
import { createWhatsAppCloudProvider } from '../integrations/messaging/whatsapp-cloud';
import type { MessagingConfig } from '../modules/notifications/messages.service';
import type { Env } from './env';

export interface MessagingDeps {
  whatsapp: MessageProvider;
  sms: MessageProvider;
  email: EmailSender;
  config: MessagingConfig;
  /** WhatsApp webhook: signature secret + GET challenge token (mock: derived from JWT_SECRET). */
  webhook: { appSecret: string; verifyToken: string };
}

/** Message providers from env (Phase 8). env.ts guarantees credentials for the real ones. */
export function messagingFromEnv(env: Env, redis: Redis, logger: Logger): MessagingDeps {
  const derive = (label: string) => createHash('sha256').update(`${label}:${env.JWT_SECRET}`).digest('hex');
  return {
    whatsapp:
      env.WHATSAPP_PROVIDER === 'cloud'
        ? createWhatsAppCloudProvider({
            phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
            accessToken: env.WHATSAPP_ACCESS_TOKEN!,
            apiVersion: env.WHATSAPP_API_VERSION,
          })
        : createMockMessageProvider({ channel: 'WHATSAPP', redis, logger }),
    sms:
      env.SMS_PROVIDER === 'msg91'
        ? createMsg91SmsProvider({ authKey: env.MSG91_AUTH_KEY!, templates: env.MSG91_SMS_TEMPLATES! })
        : createMockMessageProvider({ channel: 'SMS', redis, logger }),
    email: createLogEmailSender(logger),
    config: {
      storefrontUrl: env.STOREFRONT_PUBLIC_URL,
      adminPhones: env.ADMIN_ALERT_PHONES,
      adminEmail: env.ADMIN_ALERT_EMAIL ?? null,
      customerLanguage: env.CUSTOMER_MESSAGE_LANGUAGE,
    },
    webhook: {
      appSecret: env.WHATSAPP_APP_SECRET ?? derive('pk-mock-whatsapp-app'),
      verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? derive('pk-mock-whatsapp-verify'),
    },
  };
}
