import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';

/** BullMQ queue names (architecture/02 §8). */
export const QUEUE_NAMES = ['orders', 'documents', 'payments', 'notify', 'cron'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Customer message templates (architecture/07 §6) — sent by the Phase 8 notify consumer. */
export type NotifyTemplate = 'order_shipped' | 'out_for_delivery' | 'delivered_storage_tip' | 'delivery_attempt_failed';

/** Job name → queue + payload. notify consumers (ORDER_*, ADMIN_ALERT) are Phase 8 stubs for now. */
export interface JobPayloads {
  SHIPROCKET_CREATE_ORDER: { orderId: string };
  FETCH_AND_STORE_LABEL: { orderId: string };
  SHIPROCKET_SCHEDULE_PICKUP: { orderId: string };
  SHIPROCKET_CANCEL_SHIPMENT: { orderId: string };
  GENERATE_INVOICE: { orderId: string };
  INITIATE_REFUND: { refundId: string };
  ORDER_CONFIRMED: { orderId: string };
  ORDER_CANCELLED: { orderId: string };
  ORDER_STATUS_NOTIFY: { orderId: string; template: NotifyTemplate };
  /** Ops alert for the admin (WhatsApp/push in Phase 8; ops_issue + Sentry already carry it). */
  ADMIN_ALERT: { kind: string; orderId: string | null; message: string };
  /** Push to the kitchen's partners (Phase 7 §7.3); WhatsApp fallback via WHATSAPP_SEND. */
  PARTNER_NEW_ORDER_ALERT: { orderId: string };
  /** WhatsApp template to a staff user (partner push fallback). */
  WHATSAPP_SEND: {
    template: string;
    userId: string | null;
    orderId: string | null;
    variables?: Record<string, string>;
  };
  /** Customer refund_processed message (Phase 8 §8.5). */
  REFUND_PROCESSED: { refundId: string };
  /** End of an admin-alert batching window: one summary message with the count (Phase 8 §8.6). */
  ADMIN_ALERT_SUMMARY: { kind: string; window: string };
  EXPIRE_RESERVATIONS: Record<string, never>;
  RECONCILE_CONFIRMED: Record<string, never>;
  RECONCILE_REFUNDS: Record<string, never>;
  LEDGER_CHECK: Record<string, never>;
  CLEANUP_REFRESH_TOKENS: Record<string, never>;
  PICKUP_BATCH: Record<string, never>;
  POLL_TRACKING: Record<string, never>;
  CHECK_WALLET_BALANCE: Record<string, never>;
  PARTNER_DAILY_DIGEST: Record<string, never>;
}
export type JobName = keyof JobPayloads;

export const JOB_QUEUE: Record<JobName, QueueName> = {
  SHIPROCKET_CREATE_ORDER: 'orders',
  SHIPROCKET_SCHEDULE_PICKUP: 'orders',
  SHIPROCKET_CANCEL_SHIPMENT: 'orders',
  FETCH_AND_STORE_LABEL: 'documents',
  GENERATE_INVOICE: 'documents',
  INITIATE_REFUND: 'payments',
  ORDER_CONFIRMED: 'notify',
  ORDER_CANCELLED: 'notify',
  ORDER_STATUS_NOTIFY: 'notify',
  ADMIN_ALERT: 'notify',
  PARTNER_NEW_ORDER_ALERT: 'notify',
  WHATSAPP_SEND: 'notify',
  REFUND_PROCESSED: 'notify',
  ADMIN_ALERT_SUMMARY: 'notify',
  EXPIRE_RESERVATIONS: 'cron',
  RECONCILE_CONFIRMED: 'cron',
  RECONCILE_REFUNDS: 'cron',
  LEDGER_CHECK: 'cron',
  CLEANUP_REFRESH_TOKENS: 'cron',
  PICKUP_BATCH: 'cron',
  POLL_TRACKING: 'cron',
  CHECK_WALLET_BALANCE: 'cron',
  PARTNER_DAILY_DIGEST: 'cron',
};

/**
 * Deterministic job ids (07 §4.2): verify + webhook + sweeper enqueueing the same work collapse
 * into one job. BullMQ forbids ':' in custom ids, so doc 02's `ship:<id>` is written `ship-<id>` (D-52).
 */
export const jobIds = {
  ship: (orderId: string) => `ship-${orderId}`,
  label: (orderId: string) => `label-${orderId}`,
  pickup: (orderId: string) => `pickup-${orderId}`,
  shipCancel: (orderId: string) => `shipcancel-${orderId}`,
  /** One alert per (kind, subject) — subject = order id, or a date for account-level alerts. */
  alert: (kind: string, subject: string) => `alert-${kind}-${subject}`,
  invoice: (orderId: string) => `inv-${orderId}`,
  refund: (refundId: string) => `refund-${refundId}`,
  notify: (template: string, orderId: string) => `notify-${template}-${orderId}`,
};

/** Retry policy per job (architecture/02 §8). */
const RETRIES: Partial<Record<JobName, number>> = {
  SHIPROCKET_CREATE_ORDER: 5,
  FETCH_AND_STORE_LABEL: 5,
  SHIPROCKET_SCHEDULE_PICKUP: 5,
  SHIPROCKET_CANCEL_SHIPMENT: 5,
  GENERATE_INVOICE: 3,
  INITIATE_REFUND: 5,
  ORDER_CONFIRMED: 3,
  ORDER_CANCELLED: 3,
  ORDER_STATUS_NOTIFY: 3,
  ADMIN_ALERT: 3,
  PARTNER_NEW_ORDER_ALERT: 3,
  WHATSAPP_SEND: 3,
  REFUND_PROCESSED: 3,
  ADMIN_ALERT_SUMMARY: 3,
};

export const DEFAULT_BACKOFF_MS = 30_000;

export function jobOptions(
  name: JobName,
  jobId?: string,
  backoffMs = DEFAULT_BACKOFF_MS,
  delayMs?: number,
): JobsOptions {
  return {
    ...(jobId ? { jobId } : {}),
    ...(delayMs && delayMs > 0 ? { delay: delayMs } : {}),
    attempts: RETRIES[name] ?? 1,
    // Only retryable failures come back: non-retryable ones throw UnrecoverableError (jobs/runner.ts)
    backoff: { type: 'exponential', delay: backoffMs },
    // Keep finished jobs for a while so a re-add with the same jobId is still a no-op
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: { age: 30 * 24 * 3600 }, // dead letters stay visible in bull-board (D-09)
  };
}

/** What services depend on — tests swap in a recorder. */
export interface JobQueue {
  add<N extends JobName>(name: N, data: JobPayloads[N], jobId?: string, opts?: { delayMs?: number }): Promise<void>;
}

export interface BullJobQueue extends JobQueue {
  queues: Map<QueueName, Queue>;
  close(): Promise<void>;
}

/** `backoffMs` exists for tests (the retry test can't wait 30 s × 2^n). */
export function createBullJobQueue(connection: ConnectionOptions, opts: { backoffMs?: number } = {}): BullJobQueue {
  const queues = new Map<QueueName, Queue>(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection, prefix: 'pk:bull' })]),
  );
  return {
    queues,
    async add(name, data, jobId, addOpts) {
      await queues.get(JOB_QUEUE[name])!.add(name, data, jobOptions(name, jobId, opts.backoffMs, addOpts?.delayMs));
    },
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
    },
  };
}
