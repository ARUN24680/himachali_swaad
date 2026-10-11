import type { Logger } from 'pino';

/** Next.js cache tags the API invalidates (storefront fetches tag their data with these). */
export type CacheTag = 'products';

export interface StorefrontRevalidator {
  /** Fire after COMMIT (D-30). Never throws — a missed revalidation only delays freshness. */
  revalidate(tags: CacheTag[]): Promise<void>;
}

/**
 * Calls the storefront's POST /api/revalidate (secret header) so product edits show up without
 * waiting for cache expiry. No URL configured → no-op (local dev without the storefront running).
 */
export function createStorefrontRevalidator(cfg: {
  url?: string;
  secret?: string;
  logger: Logger;
}): StorefrontRevalidator {
  return {
    async revalidate(tags) {
      if (!cfg.url || !cfg.secret) return;
      try {
        const res = await fetch(cfg.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-revalidate-secret': cfg.secret },
          body: JSON.stringify({ tags }),
          signal: AbortSignal.timeout(3_000),
        });
        if (!res.ok) cfg.logger.warn({ status: res.status, tags }, 'storefront revalidate failed');
      } catch (err) {
        cfg.logger.warn({ err, tags }, 'storefront revalidate failed');
      }
    },
  };
}
