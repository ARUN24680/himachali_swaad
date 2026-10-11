import { z } from 'zod';

/** POST /api/v1/payments/verify (Phase 5 §5.7) — Razorpay Checkout success handler payload. */
export const VerifyPaymentRequestSchema = z.object({
  razorpayOrderId: z.string().min(1).max(40),
  razorpayPaymentId: z.string().min(1).max(40),
  razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid signature'),
});
export type VerifyPaymentRequest = z.infer<typeof VerifyPaymentRequestSchema>;

export const VERIFY_OUTCOMES = ['CONFIRMED', 'REFUND_INITIATED', 'ALREADY_PROCESSED'] as const;
export const VerifyPaymentResponseSchema = z.object({
  orderCode: z.string(),
  status: z.enum(VERIFY_OUTCOMES),
});
export type VerifyPaymentResponse = z.infer<typeof VerifyPaymentResponseSchema>;

/**
 * POST /api/v1/dev/payments/simulate — mock gateway only (PAYMENT_GATEWAY=mock, refused in
 * production). Stands in for the Razorpay modal so the full flow runs without keys.
 */
export const SimulatePaymentRequestSchema = z.object({
  razorpayOrderId: z.string().min(1).max(40),
  outcome: z.enum(['success', 'failure']),
  /** Also deliver the payment.captured webhook (tests "browser closed after paying"). */
  sendWebhook: z.boolean().default(true),
  /** Skip the success callback entirely — only the webhook confirms. */
  skipClientVerify: z.boolean().default(false),
});
export type SimulatePaymentRequest = z.input<typeof SimulatePaymentRequestSchema>;

export const SimulatePaymentResponseSchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  /** Present for `success`: what Razorpay Checkout hands the success handler. */
  razorpaySignature: z.string().nullable(),
});
export type SimulatePaymentResponse = z.infer<typeof SimulatePaymentResponseSchema>;
