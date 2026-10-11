import {
  AdjustmentRequestSchema,
  BatchCreateRequestSchema,
  BatchListQuerySchema,
  BatchUpdateRequestSchema,
  rolesFor,
} from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthGuards } from '../../middleware/auth';
import { createInventoryController } from './inventory.controller';
import type { InventoryService } from './inventory.service';

const IdParams = z.object({ id: z.uuid() });

/**
 * /api/v1/batches — ADMIN + KITCHEN_PARTNER (batches:manage). Kitchen scoping happens in the
 * service, because the kitchen comes from the body or the batch row, not the URL.
 */
export const inventoryRoutes: FastifyPluginAsyncZod<{ service: InventoryService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createInventoryController(service);
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(rolesFor('batches:manage')));

  app.get('/', { schema: { querystring: BatchListQuerySchema } }, c.list);
  app.get('/product-options', c.productOptions);
  app.post('/', { schema: { body: BatchCreateRequestSchema } }, c.create);
  app.patch('/:id', { schema: { params: IdParams, body: BatchUpdateRequestSchema } }, c.update);
  app.post('/:id/adjustments', { schema: { params: IdParams, body: AdjustmentRequestSchema } }, c.adjust);
  app.get('/:id/movements', { schema: { params: IdParams } }, c.movements);
};
