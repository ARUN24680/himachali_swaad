import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { createConversionsClient, type ConversionsClient } from '../integrations/meta/conversions';
import { createStorefrontRevalidator, type StorefrontRevalidator } from '../integrations/storefront/revalidate';
import { createLocalDiskStorage } from '../integrations/storage/local-disk';
import { createR2Storage } from '../integrations/storage/r2';
import {
  awsS3PublicBaseUrl,
  awsS3Target,
  createS3PrivateStorage,
  createS3PublicStorage,
} from '../integrations/storage/s3';
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

/** AWS S3 single bucket (D-58): images at `products/…` (public-read policy), documents under this prefix. */
export const S3_PRIVATE_PREFIX = 'private/';

function awsS3(env: Env) {
  return awsS3Target({
    region: env.AWS_REGION!,
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    bucket: env.AWS_S3_BUCKET_NAME!,
  });
}

/** Public base URL product images are served from (also what the storefront allowlists for next/image). */
export const s3PublicBaseUrl = (env: Env) =>
  env.AWS_S3_PUBLIC_BASE_URL ?? awsS3PublicBaseUrl({ bucket: env.AWS_S3_BUCKET_NAME!, region: env.AWS_REGION! });

/** Product image storage from env (D-11). env.ts guarantees the driver's vars exist. */
export function storageFromEnv(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 's3') return createS3PublicStorage('s3', awsS3(env), s3PublicBaseUrl(env));
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

/** Private documents bucket / prefix (D-11). */
export function privateStorageFromEnv(env: Env): PrivateStorage {
  if (env.STORAGE_DRIVER === 's3') return createS3PrivateStorage('s3', awsS3(env), S3_PRIVATE_PREFIX);
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
  if (env.PAYMENT_GATEWAY === 'direct_upi') {
    return createRazorpayGateway({
      keyId: env.DIRECT_UPI_KEY_ID!,
      keySecret: env.DIRECT_UPI_KEY_SECRET!,
      webhookSecret: env.DIRECT_UPI_WEBHOOK_SECRET!,
      directUpi: { apiUrl: env.DIRECT_UPI_API_URL!, publicUrl: env.DIRECT_UPI_PUBLIC_URL! },
    });
  }
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
