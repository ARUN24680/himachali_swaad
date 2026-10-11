import type { PincodeCheckResponse } from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { ServiceabilityProvider } from '../../integrations/shipping/serviceability';

export const PINCODE_CACHE_TTL_SEC = 24 * 3600;
const cacheKey = (pincode: string) => `pk:pincode:${pincode}`;

/** Pincode → serviceable + delivery estimate, cached 24 h per pincode in Redis (Phase 4 §4.6). */
export function createShippingService(deps: { redis: Redis; provider: ServiceabilityProvider; logger: Logger }) {
  const { redis, provider, logger } = deps;
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
  };
}

export type ShippingService = ReturnType<typeof createShippingService>;
