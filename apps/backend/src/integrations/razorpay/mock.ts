import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  hmacHex,
  paymentSignature,
  safeEqualHex,
  type GatewayPayment,
  type GatewayRefund,
  type PaymentGateway,
} from './gateway';

const TTL_SEC = 7 * 24 * 3600;
const id = (prefix: string) => `${prefix}_${randomBytes(7).toString('base64url').replace(/[-_]/g, 'x')}`;
const k = {
  order: (o: string) => `pk:mockpay:order:${o}`,
  payments: (o: string) => `pk:mockpay:payments:${o}`,
  payment: (p: string) => `pk:mockpay:payment:${p}`,
  refunds: (p: string) => `pk:mockpay:refunds:${p}`,
};

export interface MockPaymentGateway extends PaymentGateway {
  readonly kind: 'mock';
  readonly keySecret: string;
  readonly webhookSecret: string;
  /** What the Razorpay modal would do: create a payment on the order (captured or failed). */
  simulatePayment(
    gatewayOrderId: string,
    outcome: 'success' | 'failure',
    amountPaise?: number,
  ): Promise<GatewayPayment>;
  /** Signed webhook body + headers exactly as Razorpay would send them. */
  buildWebhook(event: string, payload: Record<string, unknown>): { body: string; signature: string; eventId: string };
  /** Test hook: make the next createOrder call fail. */
  failNextCreateOrder(): void;
}

/**
 * Dev/CI payment gateway (PAYMENT_GATEWAY=mock — env.ts refuses it in production). State lives in
 * Redis so the API and the worker (sweeper, refunds) see the same payments.
 */
export function createMockGateway(cfg: { redis: Redis; keySecret: string; webhookSecret: string }): MockPaymentGateway {
  const { redis } = cfg;
  let failCreate = false;

  async function readPayment(paymentId: string): Promise<GatewayPayment> {
    const raw = await redis.get(k.payment(paymentId));
    if (!raw) throw new Error(`mock payment ${paymentId} not found`);
    return JSON.parse(raw) as GatewayPayment;
  }
  async function savePayment(p: GatewayPayment): Promise<void> {
    await redis.set(k.payment(p.id), JSON.stringify(p), 'EX', TTL_SEC);
  }

  return {
    kind: 'mock',
    keyId: 'rzp_test_mock',
    keySecret: cfg.keySecret,
    webhookSecret: cfg.webhookSecret,

    failNextCreateOrder() {
      failCreate = true;
    },

    async createOrder({ amountPaise, receipt }) {
      if (failCreate) {
        failCreate = false;
        throw new Error('mock gateway: createOrder failed');
      }
      const orderId = id('order');
      await redis.set(k.order(orderId), JSON.stringify({ amountPaise, receipt }), 'EX', TTL_SEC);
      return { id: orderId };
    },

    fetchPayment: readPayment,

    async fetchOrderPayments(orderId) {
      const ids = await redis.lrange(k.payments(orderId), 0, -1);
      return Promise.all(ids.map(readPayment));
    },

    async capturePayment(paymentId) {
      const p = await readPayment(paymentId);
      const captured = { ...p, status: 'captured' as const };
      await savePayment(captured);
      return captured;
    },

    async simulatePayment(orderId, outcome, amountPaise) {
      const raw = await redis.get(k.order(orderId));
      if (!raw) throw new Error(`mock order ${orderId} not found`);
      const order = JSON.parse(raw) as { amountPaise: number };
      const amount = amountPaise ?? order.amountPaise;
      const p: GatewayPayment = {
        id: id('pay'),
        orderId,
        amountPaise: amount,
        status: outcome === 'success' ? 'captured' : 'failed',
        method: 'upi',
        errorCode: outcome === 'success' ? null : 'BAD_REQUEST_ERROR',
        errorDescription: outcome === 'success' ? null : 'Payment was declined (mock)',
        // Razorpay standard pricing stand-in: 2 % fee + 18 % GST on the fee (D-41 worked example)
        feePaise: outcome === 'success' ? Math.round(amount * 0.02) : null,
        taxPaise: outcome === 'success' ? Math.round(Math.round(amount * 0.02) * 0.18) : null,
      };
      await savePayment(p);
      await redis.rpush(k.payments(orderId), p.id);
      await redis.expire(k.payments(orderId), TTL_SEC);
      return p;
    },

    async createRefund({ paymentId, amountPaise, idempotencyKey }) {
      const r: GatewayRefund = { id: id('rfnd'), paymentId, amountPaise, status: 'pending', idempotencyKey };
      await redis.rpush(k.refunds(paymentId), JSON.stringify(r));
      await redis.expire(k.refunds(paymentId), TTL_SEC);
      return r;
    },

    async listPaymentRefunds(paymentId) {
      const rows = await redis.lrange(k.refunds(paymentId), 0, -1);
      return rows.map((r) => JSON.parse(r) as GatewayRefund);
    },

    verifyPaymentSignature: (orderId, paymentId, signature) =>
      safeEqualHex(paymentSignature(cfg.keySecret, orderId, paymentId), signature),

    verifyWebhookSignature: (rawBody, signature) => safeEqualHex(hmacHex(cfg.webhookSecret, rawBody), signature),

    buildWebhook(event, payload) {
      const body = JSON.stringify({
        entity: 'event',
        account_id: 'acc_mock',
        event,
        contains: Object.keys(payload),
        payload,
        created_at: Math.floor(Date.now() / 1000),
      });
      return { body, signature: hmacHex(cfg.webhookSecret, body), eventId: id('evt') };
    },
  };
}

/** Razorpay webhook payload shape for a payment entity. */
export const paymentEntity = (p: GatewayPayment) => ({
  payment: {
    entity: {
      id: p.id,
      entity: 'payment',
      amount: p.amountPaise,
      currency: 'INR',
      status: p.status,
      order_id: p.orderId,
      method: p.method,
      error_code: p.errorCode,
      error_description: p.errorDescription,
    },
  },
});

export const refundEntity = (r: GatewayRefund, status: 'processed' | 'failed') => ({
  refund: {
    entity: {
      id: r.id,
      entity: 'refund',
      amount: r.amountPaise,
      payment_id: r.paymentId,
      status,
      notes: { idempotency_key: r.idempotencyKey },
    },
  },
});
