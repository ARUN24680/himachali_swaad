import { z } from 'zod';
import { ORDER_CODE_REGEX } from '../order/order-code';

/**
 * GET /api/v1/partner/orders/:orderCode/label and /api/v1/admin/orders/:orderCode/label (Phase 6
 * §6.6) — a 5-minute signed URL to the 4×6 label PDF in the private bucket (D-11, D-37). JSON like
 * the invoice endpoint (doc 02), not the phase file's 302 (D-53).
 */
export const LabelUrlResponseSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type LabelUrlResponse = z.infer<typeof LabelUrlResponseSchema>;

/**
 * POST /api/v1/dev/shipping/simulate — dev/CI only (SHIPPING_PROVIDER=sandbox). Moves the sandbox
 * shipment to `status` and delivers the signed courier-tracking webhook, standing in for a courier scan.
 */
export const SimulateTrackingRequestSchema = z.object({
  orderCode: z.string().regex(ORDER_CODE_REGEX),
  status: z.string().trim().min(2).max(60),
  location: z.string().trim().max(120).optional(),
  sendWebhook: z.boolean().default(true),
});
export type SimulateTrackingRequest = z.infer<typeof SimulateTrackingRequestSchema>;
