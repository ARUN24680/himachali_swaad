import type { Logger } from 'pino';
import * as alertsRepo from './modules/alerts/alerts.repository';
import { SKEW_MS } from './modules/alerts/observer';
import type { Services } from './services';

const SILENT_DEVICE_SEC = 15 * 60;

/**
 * In-process loops (small service — no queue needed). Each is safe with several instances:
 * outbox leases rows with SKIP LOCKED, expiry uses SKIP LOCKED, the rest are idempotent.
 */
export function startBackground(svc: Services, logger: Logger): () => void {
  const timers: NodeJS.Timeout[] = [];

  function every(ms: number, name: string, fn: () => Promise<unknown>) {
    let running = false;
    const t = setInterval(() => {
      if (running) return;
      running = true;
      fn()
        .catch((err: unknown) => logger.error({ err, loop: name }, 'background loop failed'))
        .finally(() => {
          running = false;
        });
    }, ms);
    t.unref();
    timers.push(t);
  }

  every(2_000, 'outbox', async () => {
    // Drain while there is work, a batch at a time
    while ((await svc.dispatcher.tick()) === 20);
  });
  every(60_000, 'expire-orders', () => svc.gateway.expireOverdue());
  every(10 * 60_000, 'nonces', () => alertsRepo.sweepNonces(svc.db, Math.ceil((2 * SKEW_MS) / 1000)));
  if (svc.observer) {
    every(5 * 60_000, 'device-watchdog', async () => {
      for (const d of await alertsRepo.silentDevices(svc.db, SILENT_DEVICE_SEC)) {
        // CloudWatch metric filter on this message → alarm (docs/ops/direct-upi.md)
        logger.error({ deviceId: d.id, label: d.label }, 'UPI observer device silent');
      }
    });
  }
  every(15 * 60_000, 'review-backlog', async () => {
    const pending = await svc.alerts.listForReview(1);
    const refunds = await svc.gateway.listPendingRefunds();
    if (pending.some((a) => a.status === 'UNMATCHED')) logger.warn('UPI alerts waiting for admin review');
    if (refunds.length) logger.warn({ count: refunds.length }, 'UPI refunds waiting for an admin payout');
  });

  return () => timers.forEach(clearInterval);
}
