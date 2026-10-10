import type { Redis } from 'ioredis';
import type { Db } from '../../config/db';
import { withTimeout } from '../../utils/with-timeout';
import { pingDatabase } from './health.repository';

export type DependencyStatus = 'up' | 'down';

export interface Readiness {
  ready: boolean;
  database: DependencyStatus;
  redis: DependencyStatus;
}

const CHECK_TIMEOUT_MS = 2_000;

export function createHealthService(deps: { db: Db; redis: Redis }) {
  const check = async (fn: () => Promise<unknown>, label: string): Promise<DependencyStatus> => {
    try {
      await withTimeout(fn(), CHECK_TIMEOUT_MS, label);
      return 'up';
    } catch {
      return 'down';
    }
  };

  return {
    async readiness(): Promise<Readiness> {
      const [database, redis] = await Promise.all([
        check(() => pingDatabase(deps.db), 'database'),
        check(() => deps.redis.ping(), 'redis'),
      ]);
      return { ready: database === 'up' && redis === 'up', database, redis };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
