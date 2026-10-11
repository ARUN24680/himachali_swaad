import { z } from 'zod';

/**
 * POST /api/v1/analytics/events (Phase 4 §4.8) — Meta Conversions API relay. The browser sends the
 * same `eventId` to the Pixel and here so Meta de-duplicates. Sent only after marketing consent.
 * `Purchase` (Phase 5) carries only `orderCode`: the server reads value, items and the hashed phone
 * from the confirmed order itself (client values are ignored) and uses `event_id = orderCode`.
 */
export const BROWSER_CAPI_EVENTS = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'] as const;

export const AnalyticsEventRequestSchema = z
  .object({
    eventName: z.enum(BROWSER_CAPI_EVENTS),
    eventId: z.string().min(8).max(64),
    eventSourceUrl: z.url(),
    contentIds: z.array(z.string().max(40)).max(20).optional(),
    valuePaise: z.number().int().nonnegative().optional(),
    /** Purchase only: the confirmed order (PK-XXXXXX). */
    orderCode: z
      .string()
      .regex(/^PK-[0-9A-HJKMNP-TV-Z]{6}$/)
      .optional(),
    /** Marketing consent given in the banner — the server refuses without it. */
    consent: z.literal(true),
  })
  .refine((e) => e.eventName !== 'Purchase' || e.orderCode !== undefined, {
    path: ['orderCode'],
    message: 'Purchase needs orderCode',
  });
export type AnalyticsEventRequest = z.infer<typeof AnalyticsEventRequestSchema>;
