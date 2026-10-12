import { DelayedError, type Job } from 'bullmq';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import { cleanupRefreshTokens } from '../../modules/auth/auth.service';
import type { CommerceServices } from '../../services';
import type { JobName, JobPayloads } from '../queues';
import type { Sweepers } from '../sweepers';
import type { QueueHealth } from '../../modules/admin/ops-alerts.service';

type Handler<N extends JobName> = (data: JobPayloads[N], job: Job, token?: string) => Promise<unknown>;

/** This attempt is the job's last — retryable send errors then count as failures (SMS fallback runs). */
const finalAttempt = (job: Job | undefined) => !job?.opts || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

/** Quiet hours (Phase 8 §8.4): park the job until the release time instead of sending. */
async function deferIfNeeded(outcome: unknown, job: Job | undefined, token: string | undefined) {
  const o = outcome as { kind?: string; until?: Date };
  if (o?.kind === 'deferred' && o.until && job && token) {
    await job.moveToDelayed(o.until.getTime(), token);
    throw new DelayedError();
  }
  return outcome;
}
export type Processors = { [N in JobName]: Handler<N> };

/**
 * One handler per job (architecture/02 §8). Each calls a module service; consumers owned by later
 * phases are logged no-ops so the deterministic job ids are already in place.
 */
export function createProcessors(deps: {
  db: Db;
  svc: CommerceServices;
  sweepers: Sweepers;
  /** Worker only: BullMQ queue counts for the backlog / failed-jobs alerts. */
  queueHealth?: () => Promise<QueueHealth>;
  logger: Logger;
}): Processors {
  const { db, svc, sweepers } = deps;
  return {
    SHIPROCKET_CREATE_ORDER: (d) => svc.logistics.bookShipment(d.orderId),
    FETCH_AND_STORE_LABEL: (d) => svc.logistics.fetchAndStoreLabel(d.orderId),
    SHIPROCKET_SCHEDULE_PICKUP: (d) => svc.logistics.schedulePickup(d.orderId),
    SHIPROCKET_CANCEL_SHIPMENT: (d) => svc.logistics.cancelShipment(d.orderId),
    PICKUP_BATCH: () => svc.logistics.pickupBatch(),
    POLL_TRACKING: () => svc.logistics.pollTracking(),
    CHECK_WALLET_BALANCE: () => svc.logistics.checkWallet(),
    ORDER_CONFIRMED: (d, job) =>
      svc.messages.notifyCustomer(d.orderId, 'order_confirmed', { finalAttempt: finalAttempt(job) }),
    ORDER_STATUS_NOTIFY: (d, job) =>
      svc.messages.notifyCustomer(d.orderId, d.template, { finalAttempt: finalAttempt(job) }),
    ORDER_CANCELLED: async (d, job) => {
      const customer = await svc.messages.notifyCustomer(d.orderId, 'order_cancelled', {
        finalAttempt: finalAttempt(job),
      });
      const partner = (await svc.messages.partnerShouldKnowCancel(d.orderId))
        ? await svc.notifications.partnerCancelAlert(d.orderId)
        : null;
      return { customer, partner };
    },
    NOTIFY_RESEND: (d, job) =>
      svc.messages.notifyCustomer(d.orderId, d.template as Parameters<typeof svc.messages.notifyCustomer>[1], {
        finalAttempt: finalAttempt(job),
        force: true,
      }),
    REFUND_PROCESSED: (d, job) => svc.messages.notifyRefund(d.refundId, { finalAttempt: finalAttempt(job) }),
    WHATSAPP_SEND: async (d, job, token) =>
      deferIfNeeded(
        await svc.messages.notifyStaff(
          { ...d, template: d.template as Parameters<typeof svc.messages.notifyStaff>[0]['template'] },
          { finalAttempt: finalAttempt(job) },
        ),
        job,
        token,
      ),
    ADMIN_ALERT: (d, job) => svc.messages.adminAlert(d, { finalAttempt: finalAttempt(job) }),
    ADMIN_ALERT_SUMMARY: (d, job) => svc.messages.adminAlertSummary(d, { finalAttempt: finalAttempt(job) }),
    PARTNER_NEW_ORDER_ALERT: (d) => svc.notifications.partnerNewOrderAlert(d.orderId),
    PARTNER_DAILY_DIGEST: () => svc.notifications.partnerDailyDigest(),
    OPS_ALERTS: () => svc.opsAlerts.run(deps.queueHealth),
    GENERATE_INVOICE: (d) => svc.invoices.generate(d.orderId),
    INITIATE_REFUND: (d) => svc.payments.initiateRefund(d.refundId),
    EXPIRE_RESERVATIONS: () => sweepers.expireReservations(),
    RECONCILE_CONFIRMED: () => sweepers.reconcileConfirmed(),
    RECONCILE_REFUNDS: () => sweepers.reconcileRefunds(),
    LEDGER_CHECK: () => sweepers.ledgerCheck(),
    CLEANUP_REFRESH_TOKENS: async () => ({ deleted: await cleanupRefreshTokens(db) }),
  };
}

/** Repeat jobs (07 §4.4). Times are IST via `tz`. */
export const SCHEDULES: { name: JobName; pattern?: string; every?: number }[] = [
  { name: 'EXPIRE_RESERVATIONS', every: 60_000 },
  { name: 'RECONCILE_CONFIRMED', every: 5 * 60_000 },
  { name: 'RECONCILE_REFUNDS', every: 30 * 60_000 },
  { name: 'LEDGER_CHECK', pattern: '30 3 * * *' }, // 03:30 IST daily
  { name: 'CLEANUP_REFRESH_TOKENS', pattern: '45 3 * * *' },
  // Books once today's cut-off (pickup_cutoff_hour_ist) has passed; re-runs pick up stragglers/failures
  { name: 'PICKUP_BATCH', pattern: '*/15 * * * *' },
  { name: 'POLL_TRACKING', pattern: '0 */3 * * *' }, // D-35
  { name: 'CHECK_WALLET_BALANCE', pattern: '5 * * * *' }, // hourly
  { name: 'PARTNER_DAILY_DIGEST', pattern: '0 9 * * *' }, // 09:00 IST (Phase 7 §7.3)
  { name: 'OPS_ALERTS', every: 10 * 60_000 }, // Phase 10 §10.3
];
