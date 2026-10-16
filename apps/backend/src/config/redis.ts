import { Redis } from 'ioredis';

/**
 * HTTP requests must fail promptly during a Redis outage. Only BullMQ workers retry forever;
 * their blocking commands must not inherit the HTTP command timeout.
 */
export function createRedis(url: string, connectionName: string, mode: 'api' | 'worker' = 'api'): Redis {
  return new Redis(url, {
    connectionName,
    maxRetriesPerRequest: mode === 'worker' ? null : 1,
    ...(mode === 'api' ? { commandTimeout: 3_000 } : {}),
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
