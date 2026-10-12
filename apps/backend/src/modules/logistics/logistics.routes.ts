import { OrderCodeParamsSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuthGuards } from '../../middleware/auth';
import { createLogisticsController } from './logistics.controller';
import type { LogisticsService } from './logistics.service';

/**
 * Shipping labels (Phase 6 §6.6, D-11): /api/v1/partner/orders/:orderCode/label (KITCHEN_PARTNER of
 * that order's kitchen, or ADMIN) and /api/v1/admin/orders/:orderCode/label (ADMIN). Both return a
 * 5-minute signed URL and audit the view (LABEL_VIEW). Another kitchen's order → 404, not 403.
 */
export const labelRoutes: FastifyPluginAsyncZod<{ service: LogisticsService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createLogisticsController(service);
  app.get(
    '/partner/orders/:orderCode/label',
    {
      schema: { params: OrderCodeParamsSchema },
      preHandler: [guards.requireAuth, guards.requireRole(['KITCHEN_PARTNER', 'ADMIN'])],
      config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    },
    c.label,
  );
  app.get(
    '/admin/orders/:orderCode/label',
    {
      schema: { params: OrderCodeParamsSchema },
      preHandler: [guards.requireAuth, guards.requireRole(['ADMIN'])],
    },
    c.label,
  );
};
