import { z } from 'zod';
import { ORDER_CODE_REGEX } from '../order/order-code';

/**
 * POST /api/v1/track (Phase 8 §8.1, D-39) — order code AND phone, both required. The phone may be
 * typed as 10 digits or +91… (normalised to E.164). Mismatch = the same generic 404 as unknown.
 */
export const TrackRequestSchema = z.object({
  orderCode: z.string().trim().toUpperCase().regex(ORDER_CODE_REGEX, 'Order code looks like PK-7KQ2M9'),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .transform((v) => (/^[6-9]\d{9}$/.test(v) ? `+91${v}` : /^91[6-9]\d{9}$/.test(v) ? `+${v}` : v))
    .pipe(z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter the 10-digit mobile number used at checkout')),
});
export type TrackRequest = z.input<typeof TrackRequestSchema>;

export const TIMELINE_KEYS = [
  'BOTTLED',
  'CONFIRMED',
  'PACKED',
  'HANDED_TO_COURIER',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RTO',
  'CANCELLED',
  'REFUND',
] as const;
export type TimelineKey = (typeof TIMELINE_KEYS)[number];

export const TimelineEntrySchema = z.object({
  key: z.enum(TIMELINE_KEYS),
  /** Customer-facing English label; the UI may localise by `key`. */
  label: z.string(),
  at: z.iso.datetime(),
  /** Hub / city for courier scans, batch code for BOTTLED, refund state for REFUND. */
  detail: z.string().nullable(),
  tone: z.enum(['success', 'info', 'warning', 'destructive', 'neutral']),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const TrackResponseSchema = z.object({
  orderCode: z.string(),
  customerFirstName: z.string(),
  destinationCity: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      netWeightG: z.number().int(),
      quantity: z.number().int(),
      batchCode: z.string().nullable(),
      manufacturedAt: z.string().nullable(), // 'YYYY-MM-DD'
    }),
  ),
  courier: z.object({ name: z.string().nullable(), awb: z.string(), trackingUrl: z.url() }).nullable(),
  etd: z.string().nullable(),
  timeline: z.array(TimelineEntrySchema),
  refund: z.object({ status: z.string(), amountPaise: z.number().int() }).nullable(),
  updatedAt: z.iso.datetime(),
});
export type TrackResponse = z.infer<typeof TrackResponseSchema>;

/** GET /api/v1/me/orders (Phase 8 §8.3) — OTP-signed-in customer: own + guest orders with the verified phone. */
export const MyOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type MyOrdersQuery = z.input<typeof MyOrdersQuerySchema>;

export const MyOrderSummarySchema = z.object({
  orderCode: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  totalPaise: z.number().int(),
  itemCount: z.number().int(),
  firstItemTitle: z.string(),
  createdAt: z.iso.datetime(),
});
export type MyOrderSummary = z.infer<typeof MyOrderSummarySchema>;

export const MyOrdersResponseSchema = z.object({
  orders: z.array(MyOrderSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type MyOrdersResponse = z.infer<typeof MyOrdersResponseSchema>;

/** GET /api/v1/me/orders/:orderCode — tracking view + money/invoice facts for the owner. */
export const MyOrderDetailSchema = TrackResponseSchema.extend({
  totalPaise: z.number().int(),
  subtotalPaise: z.number().int(),
  shippingFeePaise: z.number().int(),
  invoiceAvailable: z.boolean(),
  canCancel: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type MyOrderDetail = z.infer<typeof MyOrderDetailSchema>;
