/**
 * Names shared by the page and the service worker (Phase 7 §7.2). The SW is plain JS built by
 * `build/pwa-plugin.ts`, which injects these values — so the two sides can never drift apart.
 */
export const OUTBOX = {
  db: 'pk-desk',
  version: 1,
  store: 'outbox',
  /** Background Sync tag for queued Mark Packed calls. */
  syncTag: 'pk-mark-packed',
  /** Web Locks name — page and SW never flush the outbox at the same time. */
  lock: 'pk-outbox-flush',
} as const;

export const SW_MESSAGES = {
  skipWaiting: 'PK_SKIP_WAITING',
  outboxChanged: 'PK_OUTBOX_CHANGED',
} as const;

export const SW_URL = '/sw.js';
