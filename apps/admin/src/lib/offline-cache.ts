import { can, RoleEnum, type MeResponse } from '@pk/shared';

/**
 * Offline cold start for the Packing Desk PWA (Phase 7 §7.2). When the phone opens the installed
 * desk with no internet, the session check can't reach the API — so we keep:
 *  - the last signed-in desk identity (id, role, display name, kitchens) in localStorage, and
 *  - the last partner queue responses in IndexedDB (`pk-desk-cache`, separate from the outbox DB).
 * NEVER tokens, cookies or anything secret (sessions are httpOnly cookies the JS never sees, D-20).
 * Both are cleared on sign-out and whenever the API answers 401/403. Every storage call is wrapped:
 * private mode / blocked storage simply means no offline cold start.
 */

const IDENTITY_KEY = 'pk-desk-identity';

export interface CachedIdentity {
  v: 1;
  user: { id: string; role: MeResponse['user']['role']; fullName: string | null };
  pickupLocationIds: string[];
  savedAt: number;
}

/** Remember who is signed in — only for roles that can use the desk (the only offline-capable area). */
export function saveIdentity(me: MeResponse): void {
  try {
    if (!can(me.user.role, 'packing:operate')) {
      localStorage.removeItem(IDENTITY_KEY);
      return;
    }
    const value: CachedIdentity = {
      v: 1,
      user: { id: me.user.id, role: me.user.role, fullName: me.user.fullName },
      pickupLocationIds: me.pickupLocationIds,
      savedAt: Date.now(),
    };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — no offline cold start */
  }
}

export function loadIdentity(): CachedIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CachedIdentity> | null;
    const role = RoleEnum.safeParse(v?.user?.role);
    if (
      v?.v !== 1 ||
      typeof v.user?.id !== 'string' ||
      !role.success ||
      !Array.isArray(v.pickupLocationIds) ||
      typeof v.savedAt !== 'number'
    )
      return null;
    if (!can(role.data, 'packing:operate')) return null;
    return v as CachedIdentity;
  } catch {
    return null;
  }
}

/** The cached identity in the shape the guards / pages read (fields we never store are null). */
export function identityToMe(c: CachedIdentity): MeResponse {
  return {
    user: {
      id: c.user.id,
      role: c.user.role,
      fullName: c.user.fullName,
      phoneMasked: null,
      email: null,
      totpEnabled: false,
    },
    pickupLocationIds: c.pickupLocationIds,
  };
}

// ── Snapshot store (IndexedDB) ──────────────────────────────────────────
const DB = 'pk-desk-cache';
const STORE = 'snapshots';

interface SnapshotRow<T> {
  key: string;
  data: T;
  savedAt: number;
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB unavailable'));
  }).catch((err: unknown) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const store = async (mode: IDBTransactionMode) => (await openDb()).transaction(STORE, mode).objectStore(STORE);

/** Last good API responses by key. Reads return null on any storage failure. */
export const snapshotCache = {
  get: async <T>(key: string): Promise<{ data: T; savedAt: number } | null> => {
    try {
      const row = (await req((await store('readonly')).get(key))) as SnapshotRow<T> | undefined;
      return row ? { data: row.data, savedAt: row.savedAt } : null;
    } catch {
      return null;
    }
  },
  put: async <T>(key: string, data: T): Promise<void> => {
    try {
      await req((await store('readwrite')).put({ key, data, savedAt: Date.now() } satisfies SnapshotRow<T>));
    } catch {
      /* best effort */
    }
  },
  /** Edit a snapshot in place (keeps its savedAt) — e.g. drop a card packed offline. */
  update: async <T>(key: string, edit: (data: T) => T): Promise<void> => {
    try {
      const s = await store('readwrite');
      const row = (await req(s.get(key))) as SnapshotRow<T> | undefined;
      if (row) await req(s.put({ ...row, data: edit(row.data) }));
    } catch {
      /* best effort */
    }
  },
  clear: async (): Promise<void> => {
    try {
      await req((await store('readwrite')).clear());
    } catch {
      /* best effort */
    }
  },
};

const clearListeners = new Set<() => void>();
/** Lets feature stores (e.g. the desk's "last updated" banner) reset when the offline data goes. */
export function onOfflineDataCleared(listener: () => void): () => void {
  clearListeners.add(listener);
  return () => clearListeners.delete(listener);
}

/** Sign-out / 401: forget the identity and every cached queue. */
export async function clearOfflineData(): Promise<void> {
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {
    /* ignore */
  }
  for (const l of clearListeners) l();
  await snapshotCache.clear();
}
