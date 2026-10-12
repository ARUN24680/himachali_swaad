import type { PincodeCheckResponse, PincodeLocalityResponse } from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PincodeDirectory } from '../../integrations/shipping/pincode-directory';
import type { ServiceabilityProvider } from '../../integrations/shipping/serviceability';

export const PINCODE_CACHE_TTL_SEC = 24 * 3600;
/** "Not serviceable" is re-checked sooner — couriers add pincodes (Phase 6 §6.3). */
export const NOT_SERVICEABLE_TTL_SEC = 6 * 3600;
const cacheKey = (scope: string, pincode: string) => `pk:svc:${scope}:${pincode}`;
export const LOCALITY_CACHE_TTL_SEC = 30 * 24 * 3600;
const localityKey = (pincode: string) => `pk:pincode-locality:${pincode}`;

/**
 * Pincode → serviceable + delivery estimate, cached per (origin, pincode) in Redis: 24 h when
 * serviceable, 6 h when not, never when the courier API was down (serviceable null).
 */
export function createShippingService(deps: {
  redis: Redis;
  provider: ServiceabilityProvider;
  directory: PincodeDirectory;
  logger: Logger;
}) {
  const { redis, provider, directory, logger } = deps;
  return {
    async checkPincode(pincode: string): Promise<PincodeCheckResponse> {
      const scope = await provider.scope();
      const cached = await redis.get(cacheKey(scope, pincode)).catch((err: unknown) => {
        logger.warn({ err }, 'pincode cache read failed');
        return null;
      });
      if (cached) return JSON.parse(cached) as PincodeCheckResponse;

      const result: PincodeCheckResponse = { pincode, ...(await provider.check(pincode)) };
      if (result.serviceable === null) return result;
      await redis
        .set(
          cacheKey(scope, pincode),
          JSON.stringify(result),
          'EX',
          result.serviceable ? PINCODE_CACHE_TTL_SEC : NOT_SERVICEABLE_TTL_SEC,
        )
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
