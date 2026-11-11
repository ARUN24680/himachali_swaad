/**
 * Where a signed-out user goes. `next` keeps the page they were on (same-app path only — the login
 * page re-validates it); `idle` marks an ADMIN session ended for inactivity (audit 2026-11-03,
 * R-12 / M-8) so the login page can show "You were signed out after N minutes" instead of a bare form.
 * Lives in lib/ (not the auth module) because guards and the bootstrap need it too (D-44 layering).
 */
export const IDLE_REASON = 'idle';

export function loginUrl({ idle = false, next }: { idle?: boolean; next?: string } = {}): string {
  const params = new URLSearchParams();
  if (idle) params.set('reason', IDLE_REASON);
  if (next && next !== '/' && !next.startsWith('/login')) params.set('next', next);
  const qs = params.toString();
  return qs ? `/login?${qs}` : '/login';
}
