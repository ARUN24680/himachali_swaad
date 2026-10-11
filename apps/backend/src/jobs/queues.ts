import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';

/** BullMQ queue names (architecture/02 §8). */
export const QUEUE_NAMES = ['orders', 'documents', 'payments', 'notify', 'cron'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Job name → queue + payload. Consumers of SHIPROCKET_* (Phase 6) and notify (Phase 8) are stubs for now. */
export interface JobPayloads {
  SHIPROCKET_CREATE_ORDER: { orderId: string };
  SHIPROCKET_CANCEL_SHIPMENT: { orderId: string };
  GENERATE_INVOICE: { orderId: string };
  INITIATE_REFUND: { refundId: string };
  ORDER_CONFIRMED: { orderId: string };
  ORDER_CANCELLED: { orderId: string };
  EXPIRE_RESERVATIONS: Record<string, never>;
  RECONCILE_CONFIRMED: Record<string, never>;
  RECONCILE_REFUNDS: Record<string, never>;
  LEDGER_CHECK: Record<string, never>;
  CLEANUP_REFRESH_TOKENS: Record<string, never>;
}
export type JobName = keyof JobPayloads;

export const JOB_QUEUE: Record<JobName, QueueName> = {
  SHIPROCKET_CREATE_ORDER: 'orders',
  SHIPROCKET_CANCEL_SHIPMENT: 'orders',
  GENERATE_INVOICE: 'documents',
  INITIATE_REFUND: 'payments',
  ORDER_CONFIRMED: 'notify',
  ORDER_CANCELLED: 'notify',
  EXPIRE_RESERVATIONS: 'cron',
  RECONCILE_CONFIRMED: 'cron',
  RECONCILE_REFUNDS: 'cron',
  LEDGER_CHECK: 'cron',
  CLEANUP_REFRESH_TOKENS: 'cron',
};

/**
 * Deterministic job ids (07 §4.2): verify + webhook + sweeper enqueueing the same work collapse
 * into one job. BullMQ forbids ':' in custom ids, so doc 02's `ship:<id>` is written `ship-<id>` (D-52).
 */
export const jobIds = {
  ship: (orderId: string) => `ship-${orderId}`,
  shipCancel: (orderId: string) => `shipcancel-${orderId}`,
  invoice: (orderId: string) => `inv-${orderId}`,
  refund: (refundId: string) => `refund-${refundId}`,
  notify: (template: string, orderId: string) => `notify-${template}-${orderId}`,
};

/** Retry policy per job (architecture/02 §8). */
const RETRIES: Partial<Record<JobName, number>> = {
  SHIPROCKET_CREATE_ORDER: 5,
  SHIPROCKET_CANCEL_SHIPMENT: 5,
  GENERATE_INVOICE: 3,
  INITIATE_REFUND: 5,
  ORDER_CONFIRMED: 3,
  ORDER_CANCELLED: 3,
};

export function jobOptions(name: JobName, jobId?: string): JobsOptions {
  return {
    ...(jobId ? { jobId } : {}),
    attempts: RETRIES[name] ?? 1,
    backoff: { type: 'exponential', delay: 30_000 },
    // Keep finished jobs for a while so a re-add with the same jobId is still a no-op
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: { age: 30 * 24 * 3600 }, // dead letters stay visible in bull-board (D-09)
  };
}

/** What services depend on — tests swap in a recorder. */
export interface JobQueue {
  add<N extends JobName>(name: N, data: JobPayloads[N], jobId?: string): Promise<void>;
}

export interface BullJobQueue extends JobQueue {
  queues: Map<QueueName, Queue>;
  close(): Promise<void>;
}

export function createBullJobQueue(connection: ConnectionOptions): BullJobQueue {
  const queues = new Map<QueueName, Queue>(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection, prefix: 'pk:bull' })]),
  );
  return {
    queues,
    async add(name, data, jobId) {
      await queues.get(JOB_QUEUE[name])!.add(name, data, jobOptions(name, jobId));
    },
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
    },
  };
}
