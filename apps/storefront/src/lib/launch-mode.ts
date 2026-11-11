/**
 * Pre-launch lock: in production only the `/coming-soon` teaser is public; every other storefront
 * URL answers with the product-neutral 404 (`app/not-found.tsx`). Development is never locked.
 *
 * Switch: `LAUNCH_MODE` (runtime env, read by `src/proxy.ts`).
 * - unset in production → `coming-soon` (locked; the safe default for the pre-launch deploy)
 * - `live` → the whole store is served (launch day: set it and restart, no rebuild)
 * - `coming-soon` → locked, also usable to preview the lock on a local `next start`
 */
export type LaunchMode = 'coming-soon' | 'live';

/**
 * Production domains where the pre-launch lock applies.
 * All other domains (e.g. staging.pahadikhatki.in, localhost, preview) remain live.
 */
export const PRODUCTION_DOMAINS = new Set(['pahadikhatki.in', 'www.pahadikhatki.in']);

export function cleanHost(host?: string | null): string {
  if (!host) return '';
  const first = host.split(',')[0] ?? '';
  return (first.split(':')[0] ?? '').trim().toLowerCase();
}

/** The configured public site host also counts as production (a renamed domain needs no code change). */
function configuredSiteHost(env: { NEXT_PUBLIC_SITE_URL?: string }): string {
  try {
    return env.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL).hostname.toLowerCase() : '';
  } catch {
    return '';
  }
}

export function isProductionHost(
  host?: string | null,
  env: { NEXT_PUBLIC_SITE_URL?: string } = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL },
): boolean {
  const h = cleanHost(host);
  if (!h) return false;
  if (PRODUCTION_DOMAINS.has(h)) return true;
  const site = configuredSiteHost(env);
  return site !== '' && (h === site || h === `www.${site}`);
}

/**
 * Search-engine policy per host (audit 2026-11-03, M-4): the same production image serves
 * staging.pahadikhatki.in and localhost `next start`. Only the production hosts may be indexed;
 * every other host in a production build gets `X-Robots-Tag: noindex` and a disallow-all robots.txt.
 * Development (`next dev`) is never affected, so e2e specs see the real robots.txt.
 */
export type IndexingPolicy = 'index' | 'noindex';

export function indexingPolicy(
  env: { NODE_ENV?: string; NEXT_PUBLIC_SITE_URL?: string } = process.env,
  host?: string | null,
): IndexingPolicy {
  if (env.NODE_ENV !== 'production') return 'index';
  return isProductionHost(host, env) ? 'index' : 'noindex';
}

/** Served instead of `/robots.txt` on a non-indexable host (`public/robots-noindex.txt`). */
export const NOINDEX_ROBOTS_PATH = '/robots-noindex.txt';
export const NOINDEX_HEADER_VALUE = 'noindex, nofollow, noarchive';

export function launchMode(
  env: { NODE_ENV?: string; LAUNCH_MODE?: string; NEXT_PUBLIC_SITE_URL?: string } = process.env,
  host?: string | null,
): LaunchMode {
  // 1. Explicit global live switch (launch day override)
  if (env.LAUNCH_MODE === 'live') return 'live';

  // 2. Pre-launch lock applies strictly to production domains (pahadikhatki.in / www.pahadikhatki.in).
  // Staging (staging.pahadikhatki.in), preview, and development environments are never locked.
  if (!isProductionHost(host, env)) {
    return 'live';
  }

  // 3. For the production domain: locked to coming-soon in production
  if (env.LAUNCH_MODE === 'coming-soon' || env.NODE_ENV === 'production') {
    return 'coming-soon';
  }
  return 'live';
}

/** Internal page with the neutral 404 UI; the proxy rewrites locked URLs to it with status 404. */
export const LOCKED_404_PATH = '/launch-404';

/** Paths served while locked (besides `/`, which is rewritten to the teaser). */
const OPEN_EXACT = new Set([
  '/coming-soon',
  '/robots.txt',
  NOINDEX_ROBOTS_PATH,
  '/icon.svg',
  '/favicon.ico',
  '/.well-known/security.txt', // RFC 9116 (audit R-11) — must be reachable while locked
]);
const OPEN_PREFIXES = [
  '/coming-soon/', // its share image (opengraph-image)
  '/teaser/', // the teaser's own photo
  '/_next/', // framework assets, fonts, image optimiser
  '/api/revalidate', // backend → ISR webhook (secret-protected); harmless while locked
  '/api/v1/waitlist', // the teaser's waitlist form (same-origin proxy to the API; nginx serves /api/ itself)
];

export type LockDecision = { action: 'pass' } | { action: 'rewrite'; to: string; status?: 404 };

export function lockDecision(pathname: string): LockDecision {
  if (pathname === '/') return { action: 'rewrite', to: '/coming-soon' };
  if (OPEN_EXACT.has(pathname) || OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return { action: 'pass' };
  return { action: 'rewrite', to: LOCKED_404_PATH, status: 404 };
}
