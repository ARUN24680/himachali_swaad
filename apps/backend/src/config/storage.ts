import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { createConversionsClient, type ConversionsClient } from '../integrations/meta/conversions';
import { createStorefrontRevalidator, type StorefrontRevalidator } from '../integrations/storefront/revalidate';
import { createLocalDiskStorage } from '../integrations/storage/local-disk';
import { createR2Storage } from '../integrations/storage/r2';
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
