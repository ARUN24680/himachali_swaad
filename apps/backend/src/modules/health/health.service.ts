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

/** The worker writes its heartbeat every 30 s; older than this = down (uptime monitor, Phase 10 §10.3). */
export const WORKER_STALE_SEC = 90;

export function createHealthService(deps: { db: Db; redis: Redis; workerHeartbeatKey?: string }) {
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

    async worker(): Promise<{ alive: boolean; lastBeatAt: string | null; ageSec: number | null }> {
      const raw = deps.workerHeartbeatKey ? await deps.redis.get(deps.workerHeartbeatKey).catch(() => null) : null;
      if (!raw) return { alive: false, lastBeatAt: null, ageSec: null };
      const ageSec = Math.round((Date.now() - Number(raw)) / 1000);
      return { alive: ageSec <= WORKER_STALE_SEC, lastBeatAt: new Date(Number(raw)).toISOString(), ageSec };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
