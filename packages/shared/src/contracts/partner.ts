import { z } from 'zod';
import { ORDER_CODE_REGEX } from '../order/order-code';

/**
 * Kitchen Partner Packing Desk (Phase 7, architecture/02 §6). Scoped to the partner's own kitchens
 * (user_pickup_locations); ADMIN sees all. Never: customer phone, full address, revenue (D-40).
 */

/** SOP architecture/05 — every box must be ticked before Mark Packed is enabled (Phase 7 §7.5, D-54). */
export const PACKING_CHECKLIST_KEYS = [
  'correctBatch',
  'weighed',
  'sealChecked',
  'shrinkApplied',
  'bubbleWrapped',
  'labelApplied',
] as const;
export type PackingChecklistKey = (typeof PACKING_CHECKLIST_KEYS)[number];

export const PackingChecklistSchema = z.object(
  Object.fromEntries(PACKING_CHECKLIST_KEYS.map((k) => [k, z.literal(true)])) as Record<
    PackingChecklistKey,
    z.ZodLiteral<true>
  >,
);
export type PackingChecklist = z.infer<typeof PackingChecklistSchema>;

export const MarkPackedRequestSchema = z.object({ checklist: PackingChecklistSchema });
export type MarkPackedRequest = z.infer<typeof MarkPackedRequestSchema>;

/** Header `Idempotency-Key` (uuid) — the offline queue replays with the same key. */
export const MarkPackedHeadersSchema = z.object({ 'idempotency-key': z.uuid() });

export const MarkPackedResponseSchema = z.object({
  orderCode: z.string(),
  status: z.string(),
  /** true when this call did the transition; false = already packed earlier (idempotent replay). */
  changed: z.boolean(),
  pickupDate: z.string().nullable(),
});
export type MarkPackedResponse = z.infer<typeof MarkPackedResponseSchema>;

export const PartnerOrdersQuerySchema = z.object({
  status: z.enum(['AWAITING_PACKING', 'PACKED', 'PICKUP_SCHEDULED']).default('AWAITING_PACKING'),
});
export type PartnerOrdersQuery = z.input<typeof PartnerOrdersQuerySchema>;

export const PartnerOrderCardSchema = z.object({
  orderCode: z.string(),
  status: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      sku: z.string(),
      netWeightG: z.number().int(),
      quantity: z.number().int(),
      /** FIFO-allocated batches → the jars to pick (D-23, D-42). */
      batches: z.array(z.object({ batchCode: z.string(), quantity: z.number().int() })),
    }),
  ),
  customerFirstName: z.string(),
  city: z.string(),
  state: z.string(),
  courierName: z.string().nullable(),
  awbCode: z.string().nullable(),
  labelReady: z.boolean(),
  confirmedAt: z.iso.datetime().nullable(),
  /** Pack before this (today's / next working day's pickup cut-off, D-36) to make that pickup. */
  packBy: z.iso.datetime(),
  pickupDate: z.string().nullable(),
});
export type PartnerOrderCard = z.infer<typeof PartnerOrderCardSchema>;

export const PartnerOrdersResponseSchema = z.object({
  orders: z.array(PartnerOrderCardSchema),
  /** Total AWAITING_PACKING across the partner's kitchens (header "N pack karne hain"). */
  toPack: z.number().int(),
  cutoffHourIst: z.number().int(),
});
export type PartnerOrdersResponse = z.infer<typeof PartnerOrdersResponseSchema>;

/** GET /partner/labels/a4?orders=PK-…,PK-… — 4 labels per A4 page for cyber-café printing. */
export const A4LabelsQuerySchema = z.object({
  orders: z
    .string()
    .transform((v) => [
      ...new Set(
        v
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().regex(ORDER_CODE_REGEX)).min(1).max(20)),
});
export const SignedUrlResponseSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type SignedUrlResponse = z.infer<typeof SignedUrlResponseSchema>;

/** GET /partner/manifests — the latest pickup manifests for the partner's kitchens. */
export const PartnerManifestsResponseSchema = z.object({
  manifests: z.array(
    z.object({
      pickupDate: z.string(),
      kitchenCode: z.string(),
      orderCodes: z.array(z.string()),
      url: z.url(),
      expiresAt: z.iso.datetime(),
    }),
  ),
});
export type PartnerManifestsResponse = z.infer<typeof PartnerManifestsResponseSchema>;

/** Web Push (D-16). */
export const PushSubscriptionRequestSchema = z.object({
  // Push services are always HTTPS (FCM, Mozilla autopush, Apple)
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequestSchema>;
export const PushUnsubscribeRequestSchema = z.object({ endpoint: z.url().max(2000) });
export const PushConfigResponseSchema = z.object({
  /** null = push not configured on this server (no VAPID keys) — UI explains WhatsApp alerts instead. */
  vapidPublicKey: z.string().nullable(),
  subscribed: z.boolean(),
});
export type PushConfigResponse = z.infer<typeof PushConfigResponseSchema>;
