import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Payment gateway port (Phase 5). Thin HTTP client only — no DB access, no business rules, and
 * never called inside a DB transaction (D-30). `razorpay` = real API; `mock` = dev/CI stand-in
 * (env.ts refuses it in production) that signs with the same algorithms.
 */
export type GatewayPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

export interface GatewayPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  status: GatewayPaymentStatus;
  method: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  /** Razorpay's fee + GST on it (paise) once captured — settlements (D-41). Optional: older/failed payments lack them. */
  feePaise?: number | null;
  taxPaise?: number | null;
}

export interface GatewayRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  status: 'pending' | 'processed' | 'failed';
  /** We put our refunds.idempotency_key here so a retried job can find a refund it already made. */
  idempotencyKey: string | null;
}

export interface PaymentGateway {
  readonly kind: 'razorpay' | 'mock';
  /** Public key id for Razorpay Checkout. */
  readonly keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPayment[]>;
  capturePayment(paymentId: string, amountPaise: number): Promise<GatewayPayment>;
  createRefund(input: {
    paymentId: string;
    amountPaise: number;
    idempotencyKey: string;
    notes: Record<string, string>;
  }): Promise<GatewayRefund>;
  listPaymentRefunds(paymentId: string): Promise<GatewayRefund[]>;
  /** Checkout handler signature: HMAC_SHA256(order_id|payment_id, KEY_SECRET). */
  verifyPaymentSignature(gatewayOrderId: string, paymentId: string, signature: string): boolean;
  /** Webhook signature: HMAC_SHA256(raw body, WEBHOOK_SECRET) — a different secret. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export const hmacHex = (secret: string, data: string | Buffer) =>
  createHmac('sha256', secret).update(data).digest('hex');

/** Constant-time compare of two hex strings. */
export function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function paymentSignature(keySecret: string, gatewayOrderId: string, paymentId: string): string {
  return hmacHex(keySecret, `${gatewayOrderId}|${paymentId}`);
}

/** Network/5xx failure talking to the gateway (retryable). */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly gatewayCode: string | null = null,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
