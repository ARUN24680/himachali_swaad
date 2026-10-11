import { z } from 'zod';

/**
 * POST /api/v1/analytics/events (Phase 4 §4.8) — Meta Conversions API relay. The browser sends the
 * same `eventId` to the Pixel and here so Meta de-duplicates. Sent only after marketing consent.
 * `Purchase` is fired server-side from payment confirmation in Phase 5, never from the browser.
 */
export const BROWSER_CAPI_EVENTS = ['ViewContent', 'AddToCart', 'InitiateCheckout'] as const;

export const AnalyticsEventRequestSchema = z.object({
  eventName: z.enum(BROWSER_CAPI_EVENTS),
  eventId: z.string().min(8).max(64),
  eventSourceUrl: z.url(),
  contentIds: z.array(z.string().max(40)).max(20).optional(),
  valuePaise: z.number().int().nonnegative().optional(),
  /** Marketing consent given in the banner — the server refuses without it. */
  consent: z.literal(true),
});
export type AnalyticsEventRequest = z.infer<typeof AnalyticsEventRequestSchema>;
