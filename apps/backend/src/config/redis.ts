import { Redis } from 'ioredis';

/**
 * Shared Redis connection (rate limits, BullMQ). `maxRetriesPerRequest: null` is required by BullMQ
 * workers; API callers that must fail fast (readiness) wrap calls with their own timeout.
 */
export function createRedis(url: string, connectionName: string): Redis {
  return new Redis(url, {
    connectionName,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
