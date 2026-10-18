import { z } from 'zod';
import { MAX_CART_LINES } from '../constants/limits';
import { PhoneSchema, PincodeSchema } from '../schemas/common';
import { CartItemInputSchema } from './cart';

/** POST /api/v1/checkout/create-order (Phase 5 §5.5, architecture/07 §4.1). Prepaid only (D-25). */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const CheckoutCustomerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  /** E.164 (+91XXXXXXXXXX). The form takes 10 digits and adds +91. */
  phone: PhoneSchema,
  email: z
    .email('Enter a valid email')
    .max(254)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type CheckoutCustomer = z.infer<typeof CheckoutCustomerSchema>;

export const CheckoutAddressSchema = z.object({
  line1: z.string().trim().min(3, 'Enter house / street').max(200),
  line2: optionalText(200),
  landmark: optionalText(120),
  city: z.string().trim().min(2, 'Enter city').max(80),
  state: z.string().trim().min(2, 'Enter state').max(80),
  pincode: PincodeSchema,
});
export type CheckoutAddress = z.infer<typeof CheckoutAddressSchema>;

export const CreateOrderRequestSchema = z.object({
  items: z.array(CartItemInputSchema).min(1, 'Your cart is empty').max(MAX_CART_LINES),
  customer: CheckoutCustomerSchema,
  shippingAddress: CheckoutAddressSchema,
  /** Logged-in customers only: also save to /me/addresses. Ignored for guests. */
  saveAddress: z.boolean().optional(),
  /** DPDP: order updates are needed to fulfil the order; WhatsApp opt-in is separate and default off. */
  consent: z.object({ orderUpdates: z.literal(true), whatsappOptIn: z.boolean() }),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

/** Idempotency-Key header: one UUID per checkout attempt; retries and double-clicks resend it. */
export const IdempotencyKeySchema = z.uuid('Idempotency-Key must be a UUID');
export const CheckoutHeadersSchema = z.object({ 'idempotency-key': IdempotencyKeySchema });

export const PAYMENT_GATEWAYS = ['razorpay', 'mock', 'direct_upi'] as const;

export const CreateOrderResponseSchema = z.object({
  orderCode: z.string(),
  razorpayOrderId: z.string(),
  amountPaise: z.number().int().positive(),
  currency: z.literal('INR'),
  /** Razorpay public key id (rzp_test_… / rzp_live_…); 'mock' for the dev gateway. */
  keyId: z.string(),
  /**
   * `razorpay` → open Razorpay Checkout; `mock` → dev-only simulated payment (never in production);
   * `direct_upi` → send the customer to `checkoutUrl` (our own UPI pay page, D-59).
   */
  gateway: z.enum(PAYMENT_GATEWAYS),
  /** Hosted pay page (direct_upi only), else null. */
  checkoutUrl: z.url().nullable(),
  /** Reservation end — Razorpay `timeout` = seconds until this. */
  expiresAt: z.iso.datetime(),
  prefill: z.object({ name: z.string(), contact: z.string(), email: z.string().nullable() }),
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;

/**
 * POST /api/v1/checkout/abandon — "Change details / Start again": releases the jars of the attempt
 * now instead of after the 15-min hold. Proof of ownership = the same Idempotency-Key header.
 * Never releases an order the gateway already has a payment for.
 */
export const AbandonOrderRequestSchema = z.object({
  orderCode: z.string().regex(/^PK-[0-9A-HJKMNP-TV-Z]{6}$/, 'Invalid order code'),
});
export type AbandonOrderRequest = z.infer<typeof AbandonOrderRequestSchema>;
export const AbandonOrderResponseSchema = z.object({ orderCode: z.string(), released: z.boolean() });
export type AbandonOrderResponse = z.infer<typeof AbandonOrderResponseSchema>;
