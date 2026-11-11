import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '@/lib/env';

/**
 * Idle auto-logout for ADMIN sessions (audit 2026-11-03, R-12 / M-8). Wired in AdminLayout only —
 * never in the Packing Desk, which runs offline for hours.
 *
 * - The limit comes from VITE_ADMIN_IDLE_MINUTES (default 30). It must match the server's idle
 *   rule on /auth/refresh so the warning and the refusal agree.
 * - "Activity" is pointerdown / keydown / scroll / touchstart. The last-activity timestamp lives in
 *   localStorage (`pk-admin-last-active`) so ONE active tab keeps every other admin tab alive.
 * - A tab becoming visible again is NOT activity — it only triggers an immediate re-check, so a
 *   tab left open overnight signs out the moment it is looked at instead of reviving itself.
 * - 60 s before the limit (or half the limit when it is shorter) `warning` turns on with a live
 *   countdown; `stay()` resets the clock; at 0 `onExpire` runs once.
 * - Dev/test hook: `localStorage['pk-admin-idle-ms-override']` shortens the limit, DEV builds only.
 */
export const LAST_ACTIVE_KEY = 'pk-admin-last-active';
export const IDLE_OVERRIDE_KEY = 'pk-admin-idle-ms-override';
const WARN_BEFORE_MS = 60_000;
const WRITE_THROTTLE_MS = 1_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the in-memory copy still works for this tab */
  }
}

/** The configured limit, or the DEV-only override (never honoured in a production build). */
export function idleLimitMs(): number {
  const configured = env.VITE_ADMIN_IDLE_MINUTES * 60_000;
  if (!import.meta.env.DEV) return configured;
  const override = Number(readStorage(IDLE_OVERRIDE_KEY));
  return Number.isFinite(override) && override >= 1_000 ? override : configured;
}

export interface IdleLogoutState {
  /** Show the "Still there?" dialog. */
  warning: boolean;
  /** Whole seconds until sign-out (only meaningful while `warning`). */
  secondsLeft: number;
  /** The limit in minutes, for copy ("after 30 minutes"). */
  limitMinutes: number;
  /** "Stay signed in": reset the clock (and tell the other tabs). */
  stay: () => void;
}

export function useIdleLogout({ enabled, onExpire }: { enabled: boolean; onExpire: () => void }): IdleLogoutState {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const expired = useRef(false);
  const lastWrite = useRef(0);
  const memoryLastActive = useRef(0); // set on mount by markActive(true)
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const markActive = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite.current < WRITE_THROTTLE_MS) return;
    lastWrite.current = now;
    memoryLastActive.current = now;
    writeStorage(LAST_ACTIVE_KEY, String(now));
  }, []);

  const stay = useCallback(() => {
    markActive(true);
    setWarning(false);
  }, [markActive]);

  useEffect(() => {
    if (!enabled) return;
    expired.current = false;
    const limit = idleLimitMs();
    const warnBefore = Math.min(WARN_BEFORE_MS, Math.floor(limit / 2));
    markActive(true); // this tab just opened the admin shell: that counts

    const lastActive = () => {
      const shared = Number(readStorage(LAST_ACTIVE_KEY));
      // Another tab may be newer; a corrupted/absent value falls back to this tab's own clock
      return Number.isFinite(shared) && shared > 0
        ? Math.max(shared, memoryLastActive.current)
        : memoryLastActive.current;
    };

    let warningShown = false;
    const check = () => {
      if (expired.current) return;
      const remaining = lastActive() + limit - Date.now();
      if (remaining <= 0) {
        expired.current = true;
        setWarning(false);
        onExpireRef.current();
        return;
      }
      const show = remaining <= warnBefore;
      warningShown = show;
      setWarning(show);
      setSecondsLeft(Math.max(1, Math.ceil(remaining / 1000)));
    };

    // Passive activity is ignored while the warning is up: a stray scroll must not dismiss it —
    // the explicit "Stay signed in" (or activity in another tab) does.
    const onActivity = () => {
      if (!warningShown) markActive();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVE_KEY) check();
    };

    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    // Fine-grained ticks only matter when the limit is tiny (dev/test override)
    const timer = window.setInterval(check, Math.min(1_000, Math.max(250, Math.floor(limit / 8))));
    check();

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, [enabled, markActive]);

  return { warning: enabled && warning, secondsLeft, limitMinutes: env.VITE_ADMIN_IDLE_MINUTES, stay };
}
