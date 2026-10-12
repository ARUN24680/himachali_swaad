import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import { cleanupRefreshTokens } from '../../modules/auth/auth.service';
import type { CommerceServices } from '../../services';
import type { JobName, JobPayloads } from '../queues';
import type { Sweepers } from '../sweepers';

type Handler<N extends JobName> = (data: JobPayloads[N], job: Job) => Promise<unknown>;
export type Processors = { [N in JobName]: Handler<N> };

/**
 * One handler per job (architecture/02 §8). Each calls a module service; consumers owned by later
 * phases are logged no-ops so the deterministic job ids are already in place: customer/partner/admin
 * notifications (ORDER_*, ADMIN_ALERT) → Phase 8.
 */
export function createProcessors(deps: {
  db: Db;
  svc: CommerceServices;
  sweepers: Sweepers;
  logger: Logger;
}): Processors {
  const { db, svc, sweepers, logger } = deps;
  const later = (phase: string) => async (data: unknown, job: Job) => {
    logger.info({ job: job.name, data, phase }, 'job consumer not built yet — no-op');
    return { skipped: phase };
  };
  return {
    SHIPROCKET_CREATE_ORDER: (d) => svc.logistics.bookShipment(d.orderId),
    FETCH_AND_STORE_LABEL: (d) => svc.logistics.fetchAndStoreLabel(d.orderId),
    SHIPROCKET_SCHEDULE_PICKUP: (d) => svc.logistics.schedulePickup(d.orderId),
    SHIPROCKET_CANCEL_SHIPMENT: (d) => svc.logistics.cancelShipment(d.orderId),
    PICKUP_BATCH: () => svc.logistics.pickupBatch(),
    POLL_TRACKING: () => svc.logistics.pollTracking(),
    CHECK_WALLET_BALANCE: () => svc.logistics.checkWallet(),
    ORDER_CONFIRMED: later('Phase 8'),
    ORDER_CANCELLED: later('Phase 8'),
    ORDER_STATUS_NOTIFY: later('Phase 8'),
    ADMIN_ALERT: later('Phase 8'),
    WHATSAPP_SEND: later('Phase 8'),
    PARTNER_NEW_ORDER_ALERT: (d) => svc.notifications.partnerNewOrderAlert(d.orderId),
    PARTNER_DAILY_DIGEST: () => svc.notifications.partnerDailyDigest(),
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
];
