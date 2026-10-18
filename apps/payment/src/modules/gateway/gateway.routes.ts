import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { safeEqual } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { paymentEntity, refundEntity } from '../outbox/outbox.service';
import type { OrderRow } from './gateway.repository';
import type { GatewayService } from './gateway.service';

const Notes = z
  .union([z.record(z.string(), z.union([z.string(), z.number()])), z.array(z.never())])
  .optional()
  .transform((n) =>
    !n || Array.isArray(n)
      ? {}
      : Object.fromEntries(Object.entries(n).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 256)])),
  )
  .refine((n) => Object.keys(n).length <= 15, 'at most 15 notes');

const CreateOrder = z.object({
  amount: z.number().int().min(100).max(100_000_000),
  currency: z.literal('INR'),
  receipt: z.string().min(1).max(40),
  notes: Notes,
  payment_capture: z.union([z.literal(1), z.literal(true)]).optional(),
});
const CreateRefund = z.object({
  amount: z.number().int().positive(),
  speed: z.string().optional(),
  receipt: z.string().max(40).optional(),
  notes: Notes,
});
const Id = z.string().regex(/^(order|pay)_[A-Za-z0-9]{8,32}$/);

const orderEntity = (o: OrderRow) => ({
  id: o.id,
  entity: 'order',
  amount: o.amount_paise,
  amount_paid: o.status === 'paid' ? o.amount_paise : 0,
  amount_due: o.status === 'paid' ? 0 : o.amount_paise,
  currency: 'INR',
  receipt: o.receipt,
  status: o.status === 'paid' ? 'paid' : 'created',
  notes: o.notes,
  created_at: Math.floor(o.created_at.getTime() / 1000),
});

/** Razorpay's error body, so the store's client reports it the same way. */
function razorpayError(reply: FastifyReply, err: AppError) {
  return reply.code(err.status).send({
    error: { code: err.code, description: err.message, source: 'NA', step: 'NA', reason: 'NA', metadata: {} },
  });
}

/**
 * /v1 — the Razorpay-compatible REST subset the store backend calls (Basic auth with the store's
 * key id + secret, constant-time compare). Server-to-server only; browsers never see the key.
 */
export const gatewayRoutes: FastifyPluginAsync<{ service: GatewayService; keyId: string; keySecret: string }> = async (
  app,
  { service, keyId, keySecret },
) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    const [id, ...rest] = Buffer.from(encoded ?? '', 'base64')
      .toString('utf8')
      .split(':');
    const okId = safeEqual(keyId, id);
    const okSecret = safeEqual(keySecret, rest.join(':'));
    if (scheme !== 'Basic' || !okId || !okSecret) {
      return razorpayError(reply, new AppError('UNAUTHENTICATED', 'Authentication failed'));
    }
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return razorpayError(reply, err);
    if (err instanceof z.ZodError) {
      return razorpayError(reply, new AppError('BAD_REQUEST_ERROR', err.issues[0]?.message ?? 'Invalid request'));
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return razorpayError(reply, new AppError('RATE_LIMITED', 'Too many requests'));
    }
    request.log.error({ err }, 'gateway API error');
    return razorpayError(reply, new AppError('INTERNAL', 'Something went wrong'));
  });

  app.post('/orders', async (request) => {
    const body = CreateOrder.parse(request.body);
    return orderEntity(
      await service.createOrder({ amountPaise: body.amount, receipt: body.receipt, notes: body.notes }),
    );
  });

  app.get('/orders/:id', async (request) =>
    orderEntity(await service.getOrder(Id.parse((request.params as { id: string }).id))),
  );

  app.get('/orders/:id/payments', async (request) => {
    const order = await service.getOrder(Id.parse((request.params as { id: string }).id));
    const items = (await service.listOrderPayments(order.id)).map((p) => paymentEntity(order, p));
    return { entity: 'collection', count: items.length, items };
  });

  app.get('/payments/:id', async (request) => {
    const payment = await service.getPayment(Id.parse((request.params as { id: string }).id));
    return paymentEntity({ id: payment.order_id }, payment);
  });

  // Auto-captured: capture just returns the payment (the store calls it only for `authorized`)
  app.post('/payments/:id/capture', async (request) => {
    const payment = await service.getPayment(Id.parse((request.params as { id: string }).id));
    return paymentEntity({ id: payment.order_id }, payment);
  });

  app.post('/payments/:id/refund', async (request) => {
    const paymentId = Id.parse((request.params as { id: string }).id);
    const body = CreateRefund.parse(request.body);
    return refundEntity(await service.createRefund({ paymentId, amountPaise: body.amount, notes: body.notes }));
  });

  app.get('/payments/:id/refunds', async (request) => {
    const payment = await service.getPayment(Id.parse((request.params as { id: string }).id));
    const items = (await service.listRefunds(payment.id)).map(refundEntity);
    return { entity: 'collection', count: items.length, items };
  });
};
