import type { PincodeCheckResponse, PincodeLocalityResponse } from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PincodeDirectory } from '../../integrations/shipping/pincode-directory';
import type { ServiceabilityProvider } from '../../integrations/shipping/serviceability';

export const PINCODE_CACHE_TTL_SEC = 24 * 3600;
const cacheKey = (pincode: string) => `pk:pincode:${pincode}`;
export const LOCALITY_CACHE_TTL_SEC = 30 * 24 * 3600;
const localityKey = (pincode: string) => `pk:pincode-locality:${pincode}`;

/** Pincode → serviceable + delivery estimate, cached 24 h per pincode in Redis (Phase 4 §4.6). */
export function createShippingService(deps: {
  redis: Redis;
  provider: ServiceabilityProvider;
  directory: PincodeDirectory;
  logger: Logger;
}) {
  const { redis, provider, directory, logger } = deps;
  return {
    async checkPincode(pincode: string): Promise<PincodeCheckResponse> {
      const cached = await redis.get(cacheKey(pincode)).catch((err: unknown) => {
        logger.warn({ err }, 'pincode cache read failed');
        return null;
      });
      if (cached) return JSON.parse(cached) as PincodeCheckResponse;

      const result: PincodeCheckResponse = { pincode, ...(await provider.check(pincode)) };
      await redis
        .set(cacheKey(pincode), JSON.stringify(result), 'EX', PINCODE_CACHE_TTL_SEC)
        .catch((err: unknown) => logger.warn({ err }, 'pincode cache write failed'));
      return result;
    },

    /** City/state auto-fill; found answers cached 30 days, misses are not cached. */
    async locality(pincode: string): Promise<PincodeLocalityResponse> {
      const cached = await redis.get(localityKey(pincode)).catch(() => null);
      if (cached) return JSON.parse(cached) as PincodeLocalityResponse;
      const found = await directory.lookup(pincode);
      const result: PincodeLocalityResponse = { pincode, ...found };
      if (found.city && found.state) {
        await redis
          .set(localityKey(pincode), JSON.stringify(result), 'EX', LOCALITY_CACHE_TTL_SEC)
          .catch((err: unknown) => logger.warn({ err }, 'pincode locality cache write failed'));
      }
      return result;
    },
  };
}

export type ShippingService = ReturnType<typeof createShippingService>;
