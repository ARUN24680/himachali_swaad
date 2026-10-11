import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { createConversionsClient, type ConversionsClient } from '../integrations/meta/conversions';
import { createStorefrontRevalidator, type StorefrontRevalidator } from '../integrations/storefront/revalidate';
import { createLocalDiskStorage } from '../integrations/storage/local-disk';
import { createR2Storage } from '../integrations/storage/r2';
import {
  createLocalPrivateStorage,
  createR2PrivateStorage,
  type PrivateStorage,
} from '../integrations/storage/private';
import { createMockGateway } from '../integrations/razorpay/mock';
import { createRazorpayGateway } from '../integrations/razorpay/razorpay';
import type { PaymentGateway } from '../integrations/razorpay/gateway';
import type { Redis } from 'ioredis';
import type { ObjectStorage } from '../integrations/storage/storage';
import type { Env } from './env';

/** Product image storage from env (D-11). env.ts guarantees the R2 vars exist when the driver is r2. */
export function storageFromEnv(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 'r2') {
    return createR2Storage({
      endpoint: env.R2_ENDPOINT!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucket: env.R2_PUBLIC_BUCKET!,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL!,
    });
  }
  return createLocalDiskStorage({
    dir: env.LOCAL_UPLOADS_DIR,
    apiBaseUrl: env.API_PUBLIC_URL,
    // Separate key from the JWT signing key, derived so dev needs no extra secret
    secret: createHash('sha256').update(`pk-local-storage:${env.JWT_SECRET}`).digest('hex'),
  });
}

export function revalidatorFromEnv(env: Env, logger: Logger): StorefrontRevalidator {
  return createStorefrontRevalidator({ url: env.STOREFRONT_REVALIDATE_URL, secret: env.REVALIDATE_SECRET, logger });
}

export function conversionsFromEnv(env: Env, logger: Logger): ConversionsClient {
  return createConversionsClient({
    pixelId: env.META_PIXEL_ID,
    accessToken: env.META_CAPI_ACCESS_TOKEN,
    testEventCode: env.META_CAPI_TEST_EVENT_CODE,
    logger,
  });
}

/** Private documents bucket (D-11). */
export function privateStorageFromEnv(env: Env): PrivateStorage {
  if (env.STORAGE_DRIVER === 'r2') {
    return createR2PrivateStorage({
      endpoint: env.R2_ENDPOINT!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucket: env.R2_PRIVATE_BUCKET!,
    });
  }
  return createLocalPrivateStorage({
    dir: env.LOCAL_PRIVATE_UPLOADS_DIR,
    apiBaseUrl: env.API_PUBLIC_URL,
    secret: createHash('sha256').update(`pk-local-private:${env.JWT_SECRET}`).digest('hex'),
  });
}

/** Razorpay, or the Redis-backed mock (dev/CI) whose secrets derive from JWT_SECRET. */
export function gatewayFromEnv(env: Env, redis: Redis): PaymentGateway {
  if (env.PAYMENT_GATEWAY === 'razorpay') {
    return createRazorpayGateway({
      keyId: env.RAZORPAY_KEY_ID!,
      keySecret: env.RAZORPAY_KEY_SECRET!,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET!,
    });
  }
  const derive = (label: string) => createHash('sha256').update(`${label}:${env.JWT_SECRET}`).digest('hex');
  return createMockGateway({ redis, keySecret: derive('pk-mock-key'), webhookSecret: derive('pk-mock-webhook') });
}
