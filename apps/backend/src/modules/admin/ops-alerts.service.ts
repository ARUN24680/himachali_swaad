import type { AdminOpsMetricsResponse } from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import { jobIds, type JobQueue } from '../../jobs/queues';
import { audit } from '../audit/audit.service';
import type { AdminActor } from './admin.service';
import * as repo from './admin.repository';

/** Redis key the API bumps per minute on every 5xx (app.ts → error handler). */
export const SERVER_ERRORS_KEY = 'pk:5xx';
/** Worker heartbeat (epoch ms), refreshed every 30 s — `/healthz/worker` and the uptime monitor read it. */
export const WORKER_HEARTBEAT_KEY = 'pk:worker:heartbeat';

/** Alert thresholds (Phase 10 §10.3). */
export const OPS_THRESHOLDS = {
  serverErrorsPer10Min: 20,
  queueWaiting: 200,
  queueOldestWaitingSec: 600,
};
const LAST_FAILED_KEY = 'pk:ops:last-failed-jobs';

export interface QueueHealth {
  failed: number;
  waiting: number;
  oldestWaitingAt: number | null;
}

/**
 * OPS_ALERTS (cron, every 10 min, Phase 10 §10.3): turns system symptoms into ADMIN_ALERTs, which
 * Phase 8 batches per kind and sends on WhatsApp / e-mail. Existing alerts stay where they are
 * (ledger mismatch → LEDGER_CHECK, Shiprocket wallet → CHECK_WALLET_BALANCE, NDR/RTO → logistics).
 */
export function createOpsAlertsService(deps: {
  db: Db;
  redis: Redis;
  jobs: JobQueue;
  logger: Logger;
  now?: () => Date;
}) {
  const { db, redis, jobs, logger } = deps;
  const now = deps.now ?? (() => new Date());

  async function alert(kind: string, message: string) {
    const window = String(Math.floor(now().getTime() / 600_000));
    logger.warn({ kind }, `ops alert: ${message}`);
    await jobs.add('ADMIN_ALERT', { kind, orderId: null, message }, jobIds.alert(kind, window));
  }

  return {
    async run(queueHealth?: () => Promise<QueueHealth>): Promise<string[]> {
      const fired: string[] = [];
      const minute = Math.floor(now().getTime() / 60_000);
      const keys = Array.from({ length: 10 }, (_, i) => `${SERVER_ERRORS_KEY}:${minute - i}`);
      const errors = (await redis.mget(...keys)).reduce((s, v) => s + Number(v ?? 0), 0);
      if (errors > OPS_THRESHOLDS.serverErrorsPer10Min) {
        fired.push('SERVER_ERRORS_SPIKE');
        await alert('SERVER_ERRORS_SPIKE', `${errors} server errors (5xx) in the last 10 minutes — check Sentry`);
      }

      if (queueHealth) {
        const q = await queueHealth();
        const lastFailed = Number((await redis.get(LAST_FAILED_KEY)) ?? q.failed);
        await redis.set(LAST_FAILED_KEY, String(q.failed));
        if (q.failed > lastFailed) {
          fired.push('JOBS_FAILED');
          await alert(
            'JOBS_FAILED',
            `${q.failed - lastFailed} background job(s) failed for good — open Queues & webhooks → Job queues`,
          );
        }
        const oldestSec = q.oldestWaitingAt ? Math.round((now().getTime() - q.oldestWaitingAt) / 1000) : 0;
        if (q.waiting > OPS_THRESHOLDS.queueWaiting || oldestSec > OPS_THRESHOLDS.queueOldestWaitingSec) {
          fired.push('QUEUE_BACKLOG');
          await alert(
            'QUEUE_BACKLOG',
            `${q.waiting} jobs waiting, oldest ${Math.round(oldestSec / 60)} min — is the worker running?`,
          );
        }
      }

      const c = await repo.opsAlertCounts(db);
      if (c.ops_issues_over_1h > 0) {
        fired.push('OPS_ISSUES_OPEN');
        await alert(
          'OPS_ISSUES_OPEN',
          `${c.ops_issues_over_1h} order(s) need attention for over an hour — Orders → Needs attention`,
        );
      }
      if (c.webhook_failures_1h > 0) {
        fired.push('WEBHOOK_FAILURES');
        await alert(
          'WEBHOOK_FAILURES',
          `${c.webhook_failures_1h} webhook(s) failed in the last hour — Queues & webhooks`,
        );
      }
      if (c.payments_stuck > 0) {
        fired.push('PAYMENTS_STUCK');
        await alert(
          'PAYMENTS_STUCK',
          `${c.payments_stuck} order(s) still PENDING_PAYMENT 10 min after expiry — expiry sweeper not running?`,
        );
      }
      return fired;
    },

    /** POST /admin/ops/test-alert — proves the alert path end to end (Phase 10 verification). */
    async testAlert(by: AdminActor) {
      await audit(db, {
        actorId: by.auth.userId,
        action: 'ALERT_TEST',
        entityType: 'ops',
        entityId: 'alert',
        ip: by.ip,
      });
      await jobs.add(
        'ADMIN_ALERT',
        { kind: 'TEST_ALERT', orderId: null, message: 'Test alert from the admin console — alerts reach you.' },
        jobIds.alert('TEST_ALERT', String(Date.now())),
      );
      return { ok: true as const, message: 'Test alert queued.' };
    },

    async metrics(): Promise<AdminOpsMetricsResponse> {
      const { hours, rates } = await repo.opsMetrics(db);
      const pct = (n: number) => (rates.shipped ? Math.round((n / rates.shipped) * 1000) / 10 : 0);
      return {
        ordersByHour: hours.map((h) => ({ hour: h.hour, orders: h.orders })),
        refunds30d: { count: rates.refunds, processedPaise: Number(rates.refunded_paise) },
        shipped30d: rates.shipped,
        ndrRatePercent30d: pct(rates.ndr),
        rtoRatePercent30d: pct(rates.rto),
      };
    },
  };
}

export type OpsAlertsService = ReturnType<typeof createOpsAlertsService>;
