/* global __PK_BUILD__ */
/**
 * Pahadi Khatki service worker (Phase 7 §7.2–7.3, D-16). Hand-written, no Workbox.
 * `build/pwa-plugin.ts` replaces __PK_BUILD__ with
 *   { version, precache: string[], apiUrl, outbox: { db, version, store, syncTag, lock }, messages }
 * at build time — the precache list is the real Vite output, so the app shell opens offline.
 *
 * Strategies: navigations → network-first, fall back to the cached shell, then /offline.html;
 * hashed /assets/* → cache-first; other same-origin GETs → stale-while-revalidate. API calls
 * (another origin) are never cached. Mark Packed calls queued offline are replayed by Background
 * Sync with the SAME Idempotency-Key (the server is idempotent by state, D-54 b).
 */
const BUILD = __PK_BUILD__;
const CACHE = `pk-shell-${BUILD.version}`;
const SHELL = '/index.html';
const OFFLINE = '/offline.html';
// Module scripts are CORS-mode requests; hosts often answer `Vary: Origin`, which would make the
// precached copy (fetched without Origin) never match. Our cache keys are exact build URLs.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(BUILD.precache)));
  // No skipWaiting() here: an update waits until the partner taps "Refresh" (applyUpdate()).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('pk-shell-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === BUILD.messages.skipWaiting) void self.skipWaiting();
});

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') event.respondWith(networkFirstShell(req));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(req));
  else event.respondWith(staleWhileRevalidate(req, event));
});

async function networkFirstShell(req) {
  try {
    const res = await fetch(req);
    const isHtml = (res.headers.get('content-type') || '').includes('text/html');
    if (res.ok && isHtml) {
      const cache = await caches.open(CACHE);
      await cache.put(SHELL, res.clone()); // SPA: every route serves the same shell
    }
    return res;
  } catch {
    return (await caches.match(SHELL, MATCH)) || (await caches.match(OFFLINE, MATCH)) || Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, MATCH);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) void cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return refresh;
}

// ── Web Push: { title, body, url, tag } ───────────────────────────────
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Pahadi Khatki';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: data.url || '/desk' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open our own origin — a push payload can't send the partner elsewhere
  let target = new URL('/desk', self.location.origin);
  try {
    const wanted = new URL((event.notification.data && event.notification.data.url) || '/desk', self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {
    /* keep /desk */
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(target.href).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

// ── Background Sync: replay queued Mark Packed calls ──────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === BUILD.outbox.syncTag) event.waitUntil(flushOutbox());
});

function idb(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  const req = indexedDB.open(BUILD.outbox.db, BUILD.outbox.version);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(BUILD.outbox.store))
      req.result.createObjectStore(BUILD.outbox.store, { keyPath: 'key' });
  };
  return idb(req);
}

const store = (db, mode) => db.transaction(BUILD.outbox.store, mode).objectStore(BUILD.outbox.store);

function markPacked(item) {
  return fetch(`${BUILD.apiUrl}/api/v1/partner/orders/${encodeURIComponent(item.orderCode)}/mark-packed`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': item.key },
    body: JSON.stringify({ checklist: item.checklist }),
  });
}

async function flushOutbox() {
  const run = async () => {
    const db = await openDb();
    const items = await idb(store(db, 'readonly').getAll());
    const synced = [];
    let changed = false;
    for (const item of items) {
      if (item.status !== 'pending') continue;
      let res = await markPacked(item); // a network error throws → the browser retries the sync later
      if (res.status === 401) {
        // Access cookie expired while the phone was offline — rotate it once, then replay
        await fetch(`${BUILD.apiUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: '{}',
        }).catch(() => undefined);
        res = await markPacked(item);
      }
      if (res.ok) {
        await idb(store(db, 'readwrite').delete(item.key));
        synced.push(item.orderCode);
        changed = true;
        continue;
      }
      if (res.status >= 500 || res.status === 401 || res.status === 429) throw new Error(`retry later (${res.status})`);
      // Terminal answer (cancelled, not ready, not your kitchen) — keep it for the partner to read
      const body = await res.json().catch(() => null);
      const error = body && body.error ? body.error : {};
      await idb(
        store(db, 'readwrite').put({
          ...item,
          status: 'failed',
          error: {
            code: error.code || `HTTP_${res.status}`,
            reason: (error.details && error.details.reason) || null,
            httpStatus: res.status,
          },
        }),
      );
      changed = true;
    }
    if (changed) {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of windows) c.postMessage({ type: BUILD.messages.outboxChanged, synced });
    }
  };
  return self.navigator.locks ? self.navigator.locks.request(BUILD.outbox.lock, run) : run();
}
