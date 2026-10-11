import { env } from './lib/env';

// Sentry's browser SDK is ~450 KB. Load it only when a DSN is configured, and only once the page
// is idle, so it never competes with the LCP image (Phase 4 Lighthouse target). Trade-off: errors
// thrown in the first moments of a page load are not reported.
if (env.NEXT_PUBLIC_SENTRY_DSN) {
  const load = () => void import('./lib/sentry-client').then((m) => m.initSentry());
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2000);
}
