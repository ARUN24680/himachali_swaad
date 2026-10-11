import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../../src/config/db';
import { paymentSignature } from '../../src/integrations/razorpay/gateway';
import { paymentEntity, type MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import { createProduct, insertBatchDirect } from './factories';
import { cookieHeader } from './catalog';
import type { Jar } from './session';
import { fromBrowser } from './test-app';

export const uniquePhone = () => `+9198${Array.from(randomBytes(8), (b) => String(b % 10)).join('')}`;
let ipSeq = 0;
/** Distinct client IPs so per-IP route limits don't interfere with concurrency tests. */
export const nextIp = () => {
  ipSeq += 1;
  return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
};

/** A published product with one sellable batch of `stock` jars (expiring in `expiresInDays`). */
export async function liveProduct(
  db: Queryable,
  kitchenId: string,
  opts: { stock: number; pricePaise?: number; expiresInDays?: number } = { stock: 10 },
) {
  const p = await createProduct(db, { pricePaise: opts.pricePaise ?? 44_900 });
  await db.query("UPDATE products SET images = ARRAY['products/' || id || '/a.webp'], is_active = TRUE WHERE id = $1", [
    p.id,
  ]);
  const batchId =
    opts.stock > 0
      ? await insertBatchDirect(db, {
          productId: p.id,
          locationId: kitchenId,
          quantity: opts.stock,
          expiresInDays: opts.expiresInDays ?? 200,
        })
      : null;
  return { ...p, batchId };
}

export function orderBody(items: { productId: string; quantity: number }[], phone = uniquePhone()) {
  return {
    items,
    customer: { fullName: 'Asha Thakur', phone, email: 'asha@example.com' },
    shippingAddress: { line1: '12 Mall Road', city: 'Kullu', state: 'Himachal Pradesh', pincode: '175101' },
    consent: { orderUpdates: true, whatsappOptIn: false },
  };
}

export async function placeOrder(
  app: FastifyInstance,
  items: { productId: string; quantity: number }[],
  opts: { key?: string; phone?: string; jar?: Jar; body?: object } = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/checkout/create-order',
    remoteAddress: nextIp(),
    headers: fromBrowser({
      'idempotency-key': opts.key ?? randomUUID(),
      ...(opts.jar ? { cookie: cookieHeader(opts.jar) } : {}),
    }),
    payload: opts.body ?? orderBody(items, opts.phone),
  });
}

/** Simulate the customer paying in the (mock) Razorpay modal; returns what Checkout hands the success handler. */
export async function payAtGateway(
  gateway: MockPaymentGateway,
  razorpayOrderId: string,
  opts: { amountPaise?: number; outcome?: 'success' | 'failure' } = {},
) {
  const payment = await gateway.simulatePayment(razorpayOrderId, opts.outcome ?? 'success', opts.amountPaise);
  return {
    payment,
    verifyBody: {
      razorpayOrderId,
      razorpayPaymentId: payment.id,
      razorpaySignature: paymentSignature(gateway.keySecret, razorpayOrderId, payment.id),
    },
  };
}

export const verify = (app: FastifyInstance, body: object) =>
  app.inject({ method: 'POST', url: '/api/v1/payments/verify', headers: fromBrowser(), payload: body });

/** Delivers a signed Razorpay webhook (no Origin — webhooks are exempt). */
export function sendWebhook(
  app: FastifyInstance,
  gateway: MockPaymentGateway,
  event: string,
  payload: Record<string, unknown>,
  opts: { eventId?: string; signature?: string } = {},
) {
  const hook = gateway.buildWebhook(event, payload);
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': opts.signature ?? hook.signature,
      'x-razorpay-event-id': opts.eventId ?? hook.eventId,
    },
    payload: hook.body,
  });
}

export const capturedWebhook = (
  app: FastifyInstance,
  gateway: MockPaymentGateway,
  payment: Parameters<typeof paymentEntity>[0],
  eventId?: string,
) => sendWebhook(app, gateway, 'payment.captured', paymentEntity(payment), { eventId });

export async function orderRow(db: Queryable, orderCode: string) {
  const { rows } = await db.query('SELECT * FROM orders WHERE order_code = $1', [orderCode]);
  return rows[0] as Record<string, unknown> & { id: string; status: string; payment_status: string };
}

export async function batchStock(db: Queryable, batchId: string): Promise<number> {
  const { rows } = await db.query<{ available_stock: number }>(
    'SELECT available_stock FROM inventory_batches WHERE id = $1',
    [batchId],
  );
  return rows[0]!.available_stock;
}

export async function statusLog(db: Queryable, orderId: string) {
  const { rows } = await db.query<{
    from_status: string | null;
    to_status: string;
    actor_type: string;
    reason: string | null;
  }>('SELECT from_status, to_status, actor_type, reason FROM order_status_logs WHERE order_id = $1 ORDER BY id', [
    orderId,
  ]);
  return rows;
}

/** Backdates a reservation so the expiry sweeper picks it up ("fake clock"). */
export const expireHold = (db: Queryable, orderId: string) =>
  db.query("UPDATE orders SET reservation_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [orderId]);
