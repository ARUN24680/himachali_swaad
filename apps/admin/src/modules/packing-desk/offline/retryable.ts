import { isApiError } from '@/services/api/http';

/** Worth queueing and replaying later (no network, server hiccup, rate limit, expired session). */
export function isRetryable(err: unknown): boolean {
  if (!isApiError(err)) return true;
  return err.status === 0 || err.status >= 500 || err.status === 429 || err.status === 401;
}
