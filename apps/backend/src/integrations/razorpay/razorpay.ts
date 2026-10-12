import { withTimeout } from '../../utils/with-timeout';
import {
  GatewayError,
  hmacHex,
  paymentSignature,
  safeEqualHex,
  type GatewayPayment,
  type GatewayPaymentStatus,
  type GatewayRefund,
  type PaymentGateway,
} from './gateway';

const API = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10_000;

interface RzpPayment {
  id: string;
  order_id: string;
  amount: number;
  status: GatewayPaymentStatus;
  method?: string | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
}
interface RzpRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
  notes?: Record<string, string> | unknown[];
}

export const toGatewayPayment = (p: RzpPayment): GatewayPayment => ({
  id: p.id,
  orderId: p.order_id,
  amountPaise: p.amount,
  status: p.status,
  method: p.method ?? null,
  errorCode: p.error_code ?? null,
  errorDescription: p.error_description ?? null,
  feePaise: p.fee ?? null,
  taxPaise: p.tax ?? null,
});

export const toGatewayRefund = (r: RzpRefund): GatewayRefund => ({
  id: r.id,
  paymentId: r.payment_id,
  amountPaise: r.amount,
  status: r.status,
  // Razorpay returns notes as [] when empty
  idempotencyKey: !Array.isArray(r.notes) && r.notes?.idempotency_key ? r.notes.idempotency_key : null,
});

/** Razorpay REST API (https://razorpay.com/docs/api/) with Basic auth. No SDK — four endpoints. */
export function createRazorpayGateway(cfg: {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
}): PaymentGateway {
  const doFetch = cfg.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await withTimeout(
        doFetch(`${API}${path}`, {
          method,
          headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        TIMEOUT_MS,
        `razorpay ${method} ${path.split('/')[1]}`,
      );
    } catch (err) {
      throw new GatewayError((err as Error).message, null);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } };
    if (!res.ok) {
      // Never include the request body or key in the message (PII / secrets)
      throw new GatewayError(
        `razorpay ${res.status}: ${json.error?.description ?? 'request failed'}`,
        res.status,
        json.error?.code ?? null,
      );
    }
    return json as T;
  }

  return {
    kind: 'razorpay',
    keyId: cfg.keyId,

    async createOrder({ amountPaise, receipt, notes }) {
      const o = await call<{ id: string }>('POST', '/orders', {
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes,
        payment_capture: 1,
      });
      return { id: o.id };
    },

    fetchPayment: async (id) => toGatewayPayment(await call<RzpPayment>('GET', `/payments/${encodeURIComponent(id)}`)),

    async fetchOrderPayments(orderId) {
      const r = await call<{ items: RzpPayment[] }>('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
      return r.items.map(toGatewayPayment);
    },

    capturePayment: async (id, amountPaise) =>
      toGatewayPayment(
        await call<RzpPayment>('POST', `/payments/${encodeURIComponent(id)}/capture`, {
          amount: amountPaise,
          currency: 'INR',
        }),
      ),

    async createRefund({ paymentId, amountPaise, idempotencyKey, notes }) {
      const r = await call<RzpRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountPaise,
        speed: 'normal',
        receipt: idempotencyKey.slice(0, 40),
        notes: { ...notes, idempotency_key: idempotencyKey },
      });
      return toGatewayRefund(r);
    },

    async listPaymentRefunds(paymentId) {
      const r = await call<{ items: RzpRefund[] }>('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`);
      return r.items.map(toGatewayRefund);
    },

    verifyPaymentSignature: (orderId, paymentId, signature) =>
      safeEqualHex(paymentSignature(cfg.keySecret, orderId, paymentId), signature),

    verifyWebhookSignature: (rawBody, signature) => safeEqualHex(hmacHex(cfg.webhookSecret, rawBody), signature),
  };
}
