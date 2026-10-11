import { z } from 'zod';
import { OrderStatusEnum, PaymentStatusEnum, RefundStatusEnum } from '../order/rows';
import { PhoneSchema } from '../schemas/common';

/** Customer-facing order endpoints (Phase 5 §5.8, §5.10, §5.11). Orders are addressed by orderCode. */

export const OrderCodeParamsSchema = z.object({
  orderCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^PK-[0-9A-HJKMNP-TV-Z]{6}$/, 'Invalid order code'),
});

/** Guests prove ownership with the checkout phone (E.164); logged-in owners need nothing. */
export const OrderAccessQuerySchema = z.object({ phone: PhoneSchema.optional() });
export type OrderAccessQuery = z.infer<typeof OrderAccessQuerySchema>;

export const OrderItemSummarySchema = z.object({
  productId: z.uuid(),
  title: z.string(),
  netWeightG: z.number().int(),
  quantity: z.number().int(),
  unitPricePaise: z.number().int(),
  totalPricePaise: z.number().int(),
});

export const OrderStatusResponseSchema = z.object({
  orderCode: z.string(),
  status: OrderStatusEnum,
  paymentStatus: PaymentStatusEnum,
  items: z.array(OrderItemSummarySchema),
  subtotalPaise: z.number().int(),
  shippingFeePaise: z.number().int(),
  totalPaise: z.number().int(),
  /** Shown as "Delivering to <city>" — the full address is never returned here. */
  shippingCity: z.string(),
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  /** While PENDING_PAYMENT: when the jar hold ends. */
  reservationExpiresAt: z.iso.datetime(),
  /** Customer-safe cancellation reason code (LATE_PAYMENT_STOCKOUT, CUSTOMER_CANCEL, …). */
  cancelReason: z.string().nullable(),
  refund: z.object({ status: RefundStatusEnum, amountPaise: z.number().int() }).nullable(),
  invoiceAvailable: z.boolean(),
  canCancel: z.boolean(),
  /** Customer opted into WhatsApp updates at checkout (else SMS for critical updates only). */
  whatsappOptIn: z.boolean(),
  /** PENDING_PAYMENT with time left: everything needed to reopen the payment modal. */
  retryPayment: z
    .object({
      razorpayOrderId: z.string(),
      keyId: z.string(),
      gateway: z.enum(['razorpay', 'mock']),
      amountPaise: z.number().int(),
    })
    .nullable(),
});
export type OrderStatusResponse = z.infer<typeof OrderStatusResponseSchema>;

export const InvoiceUrlResponseSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type InvoiceUrlResponse = z.infer<typeof InvoiceUrlResponseSchema>;

export const CancelOrderRequestSchema = z.object({ reason: z.string().trim().min(3, 'Tell us why').max(300) });
export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

/** Admin cancel (UI in Phase 9). `refund: false` only for orders that were never paid. */
export const AdminCancelOrderRequestSchema = CancelOrderRequestSchema.extend({ refund: z.boolean().default(true) });
export type AdminCancelOrderRequest = z.input<typeof AdminCancelOrderRequestSchema>;

export const CancelOrderResponseSchema = z.object({
  orderCode: z.string(),
  status: OrderStatusEnum,
  paymentStatus: PaymentStatusEnum,
});
export type CancelOrderResponse = z.infer<typeof CancelOrderResponseSchema>;
