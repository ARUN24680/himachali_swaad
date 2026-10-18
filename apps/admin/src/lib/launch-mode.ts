/**
 * Pre-launch lock for the admin + Packing Desk SPA. While the store launches with only the
 * storefront's `/coming-soon` page, a production build of this app shows nothing but a 404.
 *
 * Build-time switch `VITE_LAUNCH_MODE` (read in vite.config.ts, exposed as `__PK_ADMIN_LOCKED__`):
 * - unset on `vite build` → locked (the safe default for the pre-launch deploy)
 * - `live` → the full app (launch day: rebuild with it)
 * - `coming-soon` → locked, also in `vite dev` (to preview the lock locally)
 * `vite dev` without it is never locked.
 */
export function isAdminLocked(mode: { production: boolean; launchMode?: string }): boolean {
  if (mode.launchMode === 'live') return false;
  if (mode.launchMode === 'coming-soon') return true;
  return mode.production;
}
