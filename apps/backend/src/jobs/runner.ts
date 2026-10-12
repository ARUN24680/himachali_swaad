import { UnrecoverableError, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';
import type { ErrorReporter } from '../config/sentry';
import { ShiprocketError } from '../integrations/shiprocket/client';
import type { CommerceServices } from '../services';
import { PermanentJobError } from './errors';
import type { Processors } from './processors';
import { JOB_QUEUE, QUEUE_NAMES, type JobName } from './queues';

/** Jobs whose final failure is a logistics dead letter (ops_issue + last_error + admin alert). */
const LOGISTICS_JOBS: ReadonlySet<JobName> = new Set([
  'SHIPROCKET_CREATE_ORDER',
  'FETCH_AND_STORE_LABEL',
  'SHIPROCKET_SCHEDULE_PICKUP',
  'SHIPROCKET_CANCEL_SHIPMENT',
]);

/** Only network / 5xx / 429 are worth retrying (Phase 6 §6.1); the rest dead-letter now. */
export function toJobError(err: unknown): unknown {
  if (err instanceof PermanentJobError || (err instanceof ShiprocketError && !err.retryable)) {
    return new UnrecoverableError(err.message);
  }
  return err;
}

/**
 * One BullMQ Worker per queue (D-06). Shared by worker.ts and the integration tests so the retry
 * + dead-letter behaviour under test is the production code path.
 */
export function startWorkers(deps: {
  connection: ConnectionOptions;
  processors: Processors;
  svc: CommerceServices;
  logger: Logger;
  reporter: ErrorReporter;
  concurrency: number;
}): Worker[] {
  const { processors, svc, logger, reporter } = deps;
  const workers = QUEUE_NAMES.map(
    (queue) =>
      new Worker(
        queue,
        async (job: Job) => {
          const handler = processors[job.name as JobName];
          if (!handler || JOB_QUEUE[job.name as JobName] !== queue) {
            throw new UnrecoverableError(`Unknown job ${queue}/${job.name}`);
          }
          try {
            return await (handler as (d: unknown, j: Job) => Promise<unknown>)(job.data, job);
          } catch (err) {
            throw toJobError(err);
          }
        },
        { connection: deps.connection, prefix: 'pk:bull', concurrency: queue === 'cron' ? 1 : deps.concurrency },
      ),
  );

  for (const w of workers) {
    w.on('failed', (job, err) => {
      if (!job) return;
      const final = err.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
      logger.error({ err, job: job.name, jobId: job.id, attempt: job.attemptsMade, final }, 'job failed');
      if (!final) return;
      reporter.capture(err, { job: job.name, jobId: job.id ?? '' });
      const name = job.name as JobName;
      if (name === 'INITIATE_REFUND') {
        void svc.payments.refundGaveUp((job.data as { refundId: string }).refundId, err.message).catch(() => undefined);
      } else if (LOGISTICS_JOBS.has(name)) {
        void svc.logistics
          .jobGaveUp(name, (job.data as { orderId: string }).orderId, err.message)
          .catch((e: unknown) => logger.error({ err: e }, 'dead-letter bookkeeping failed'));
      }
    });
  }
  return workers;
}
