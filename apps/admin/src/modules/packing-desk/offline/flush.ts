import { OUTBOX } from '@/pwa/constants';
import { packingDeskApi } from '../api/packingDeskApi';
import { outboxDb, type OutboxItem } from './outbox-db';
import { isRetryable } from './retryable';
import { isApiError } from '@/services/api/http';

export interface FlushResult {
  synced: string[];
  failed: string[];
}

let inFlight: Promise<FlushResult> | null = null;

async function run(): Promise<FlushResult> {
  const result: FlushResult = { synced: [], failed: [] };
  const items = (await outboxDb.all()).filter((i) => i.status === 'pending');
  for (const item of items) {
    try {
      // SAME Idempotency-Key as the original tap — the server answers 200 even if it already applied it
      await packingDeskApi.markPacked(item.orderCode, item.key, item.checklist);
      await outboxDb.remove(item.key);
      result.synced.push(item.orderCode);
    } catch (err) {
      if (isRetryable(err)) break; // still offline / server down — keep everything, try again later
      await outboxDb.put(failedItem(item, err));
      result.failed.push(item.orderCode);
    }
  }
  return result;
}

export function failedItem(item: Omit<OutboxItem, 'status' | 'error'>, err: unknown): OutboxItem {
  const reason = isApiError(err) && typeof err.details?.reason === 'string' ? err.details.reason : null;
  return {
    ...item,
    status: 'failed',
    error: {
      code: isApiError(err) ? err.code : 'BAD_RESPONSE',
      reason,
      httpStatus: isApiError(err) ? err.status : 0,
    },
  };
}

/**
 * Replay queued Mark Packed calls (app open, `online` event, SW message). Single-flight in this tab
 * and — via the Web Locks API — across tabs and the service worker's Background Sync.
 */
export function flushOutbox(): Promise<FlushResult> {
  inFlight ??= (navigator.locks ? navigator.locks.request(OUTBOX.lock, run) : run()).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Ask the SW to replay when connectivity returns, even if the app is closed (Chrome/Android). */
export async function requestBackgroundSync(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = (await navigator.serviceWorker.getRegistration('/')) as
      (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }) | undefined;
    await reg?.sync?.register(OUTBOX.syncTag);
  } catch {
    /* unsupported (iOS/Firefox) — the page flushes on open / online instead */
  }
}
