import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { createWebPushSender, type PushSender } from '../integrations/push/web-push';
import { createShiprocketClient, type ShiprocketApi } from '../integrations/shiprocket/client';
import { joinUrl } from '../integrations/storage/storage';
import type { ErrorReporter } from './sentry';
import type { Env } from './env';

/** Where the sandbox is mounted inside the API (dev/CI only). */
export const SANDBOX_PATH = '/api/v1/dev/shiprocket/';

export interface ShippingConfig {
  shiprocket: ShiprocketApi;
  webhookToken: string;
  sandbox: boolean;
}

/**
 * Shiprocket client from env. With SHIPPING_PROVIDER=sandbox the SAME client talks to the API's
 * sandbox over HTTP (the worker reaches it via API_PUBLIC_URL); its webhook token derives from
 * JWT_SECRET so dev needs no extra secret. env.ts guarantees the real credentials otherwise.
 */
export function shippingFromEnv(env: Env, redis: Redis, logger: Logger, reporter: ErrorReporter): ShippingConfig {
  const sandbox = env.SHIPPING_PROVIDER === 'sandbox';
  const shiprocket = createShiprocketClient({
    baseUrl: sandbox ? joinUrl(env.API_PUBLIC_URL, SANDBOX_PATH) : env.SHIPROCKET_API_URL,
    email: env.SHIPROCKET_EMAIL ?? 'sandbox@pahadikhatki.test',
    password: env.SHIPROCKET_PASSWORD ?? 'sandbox',
    redis,
    logger,
    reporter,
  });
  const webhookToken =
    env.SHIPROCKET_WEBHOOK_TOKEN ?? createHash('sha256').update(`pk-courier-webhook:${env.JWT_SECRET}`).digest('hex');
  return { shiprocket, webhookToken, sandbox };
}

/** Web Push sender (Phase 7). Disabled (WhatsApp fallback only) until VAPID keys are set. */
export function pushFromEnv(env: Env): PushSender {
  return createWebPushSender({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  });
}
