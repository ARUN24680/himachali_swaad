import { MyOrdersQuerySchema, OrderCodeParamsSchema, TrackRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authOf, type AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { TrackingService } from './tracking.service';

/** POST /api/v1/track — public, code + phone (D-39), 10 / 10 min per IP (+ per code in the service). */
export const trackRoutes: FastifyPluginAsyncZod<{ service: TrackingService }> = async (app, { service }) => {
  app.post(
    '/track',
    { schema: { body: TrackRequestSchema }, config: { rateLimit: { max: 10, timeWindow: 600_000 } } },
    async (request) => ok(request, await service.track(request.body.orderCode, request.body.phone)),
  );
};

/** /api/v1/me/orders — OTP-signed-in CUSTOMER (Phase 8 §8.3, D-18). */
export const myOrdersRoutes: FastifyPluginAsyncZod<{ service: TrackingService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['CUSTOMER']));
  app.get('/orders', { schema: { querystring: MyOrdersQuerySchema } }, async (request) => {
    const q = request.query as { page: number; pageSize: number };
    return ok(request, await service.myOrders(authOf(request), q.page, q.pageSize));
  });
  app.get('/orders/:orderCode', { schema: { params: OrderCodeParamsSchema } }, async (request) =>
    ok(request, await service.myOrder(authOf(request), request.params.orderCode)),
  );
};
