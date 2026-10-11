import {
  AbandonOrderRequestSchema,
  CheckoutHeadersSchema,
  CreateOrderRequestSchema,
  type AbandonOrderRequest,
  type CreateOrderRequest,
} from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { CheckoutService } from './checkout.service';

/** /api/v1/checkout — guest or CUSTOMER (D-18). 10 / 10 min per IP here; 5 / 10 min per phone in the service. */
export const checkoutRoutes: FastifyPluginAsyncZod<{ service: CheckoutService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  app.post(
    '/create-order',
    {
      schema: { body: CreateOrderRequestSchema, headers: CheckoutHeadersSchema },
      preHandler: guards.optionalAuth,
      config: { rateLimit: { max: 10, timeWindow: 600_000 } },
    },
    async (request: FastifyRequest<{ Body: CreateOrderRequest }>, reply: FastifyReply) => {
      const data = await service.createOrder(request.body, {
        idempotencyKey: String(request.headers['idempotency-key']).toLowerCase(),
        auth: request.auth,
      });
      return reply.status(201).send(ok(request, data));
    },
  );

  app.post(
    '/abandon',
    {
      schema: { body: AbandonOrderRequestSchema, headers: CheckoutHeadersSchema },
      config: { rateLimit: { max: 20, timeWindow: 600_000 } },
    },
    async (request: FastifyRequest<{ Body: AbandonOrderRequest }>) =>
      ok(
        request,
        await service.abandon(request.body.orderCode, String(request.headers['idempotency-key']).toLowerCase()),
      ),
  );
};
