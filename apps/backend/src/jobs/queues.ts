/** BullMQ queue names (architecture/02 §8). Jobs are added from Phase 5 onwards. */
export const QUEUE_NAMES = ['orders', 'documents', 'payments', 'notify', 'cron'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
