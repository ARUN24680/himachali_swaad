import type { AnalyticsEventRequest } from '@pk/shared';
import { env } from '@/lib/env';

/**
 * Meta Conversions API relay (POST /analytics/events). Fire-and-forget with `keepalive` so an
 * InitiateCheckout sent right before navigation still lands. Failures never affect the shopper.
 */
export function sendServerEvent(body: AnalyticsEventRequest): void {
  try {
    void fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/analytics/events`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // fetch unavailable — ignore
  }
}
