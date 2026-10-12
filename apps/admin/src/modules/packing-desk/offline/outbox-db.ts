import type { PackingChecklist } from '@pk/shared';
import { OUTBOX } from '@/pwa/constants';

/**
 * IndexedDB outbox for Mark Packed taps that couldn't reach the server (Phase 7 §7.2).
 * Keyed by the Idempotency-Key, so every replay — page or service worker — sends the SAME key.
 * The SW (src/pwa/sw.js) reads/writes this same store with the same names (injected at build).
 */
export interface OutboxItem {
  key: string;
  orderCode: string;
  checklist: PackingChecklist;
  createdAt: number;
  status: 'pending' | 'failed';
  /** Terminal server answer, e.g. { code: 'INVALID_STATE', reason: 'ORDER_CANCELLED' }. */
  error?: { code: string; reason: string | null; httpStatus: number };
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(OUTBOX.db, OUTBOX.version);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(OUTBOX.store))
        open.result.createObjectStore(OUTBOX.store, { keyPath: 'key' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB unavailable'));
  }).catch((err: unknown) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const store = async (mode: IDBTransactionMode) =>
  (await openDb()).transaction(OUTBOX.store, mode).objectStore(OUTBOX.store);

export const outboxDb = {
  all: async (): Promise<OutboxItem[]> =>
    ((await req((await store('readonly')).getAll())) as OutboxItem[]).sort((a, b) => a.createdAt - b.createdAt),
  put: async (item: OutboxItem): Promise<void> => {
    await req((await store('readwrite')).put(item));
  },
  remove: async (key: string): Promise<void> => {
    await req((await store('readwrite')).delete(key));
  },
};
