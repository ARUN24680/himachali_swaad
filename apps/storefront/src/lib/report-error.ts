import { env } from './env';

/**
 * Error boundaries report through this instead of importing @sentry/nextjs directly — a static
 * import would put the whole SDK (~450 KB) in every page's first-load JS.
 */
export function reportError(error: unknown): void {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import('./sentry-client').then((m) => m.captureException(error));
}
