import {
  rolesFor,
  AdminCancelOrderRequestSchema,
  CancelOrderRequestSchema,
  OrderAccessQuerySchema,
  OrderCodeParamsSchema,
} from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuthGuards } from '../../middleware/auth';
import { createOrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

/**
 * /api/v1/orders — customer-facing (Phase 5 §5.8–5.11). Readable by the session owner or with the
 * checkout phone. The status page polls every 3 s for ≤ 60 s, so its limit is 60 / 10 min per IP
 * (doc 02's 10 / 10 min would cut the poll short — D-52).
 */
export const orderRoutes: FastifyPluginAsyncZod<{ service: OrdersService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createOrdersController(service);
  app.get(
    '/:orderCode/status',
    {
      schema: { params: OrderCodeParamsSchema, querystring: OrderAccessQuerySchema },
      preHandler: guards.optionalAuth,
      config: { rateLimit: { max: 60, timeWindow: 600_000 } },
    },
    c.status,
  );
  app.get(
    '/:orderCode/invoice',
    {
      schema: { params: OrderCodeParamsSchema, querystring: OrderAccessQuerySchema },
      preHandler: guards.optionalAuth,
      config: { rateLimit: { max: 20, timeWindow: 600_000 } },
    },
    c.invoice,
  );
  app.post(
    '/:orderCode/cancel',
    {
      schema: { params: OrderCodeParamsSchema, body: CancelOrderRequestSchema },
      preHandler: [guards.requireAuth, guards.requireRole(['CUSTOMER'])],
    },
    c.cancelByCustomer,
  );
};

/** /api/v1/admin/orders — ADMIN (UI in Phase 9). */
export const adminOrderRoutes: FastifyPluginAsyncZod<{ service: OrdersService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createOrdersController(service);
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(rolesFor('orders:cancel-refund')));
  app.post(
    '/:orderCode/cancel',
    { schema: { params: OrderCodeParamsSchema, body: AdminCancelOrderRequestSchema } },
    c.cancelByAdmin,
  );
};
