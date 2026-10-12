/**
 * A failure retrying can't fix (bad config, rejected payload) — the job runner turns it into
 * BullMQ's UnrecoverableError so it dead-letters at once instead of burning 5 attempts (Phase 6 §6.1).
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
