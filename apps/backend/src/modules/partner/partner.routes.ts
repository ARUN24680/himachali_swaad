import {
  A4LabelsQuerySchema,
  MarkPackedHeadersSchema,
  MarkPackedRequestSchema,
  OrderCodeParamsSchema,
  PartnerOrdersQuerySchema,
  PushSubscriptionRequestSchema,
  PushUnsubscribeRequestSchema,
} from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthGuards } from '../../middleware/auth';
import type { NotificationsService } from '../notifications/notifications.service';
import { createPartnerController } from './partner.controller';
import type { PartnerService } from './partner.service';

const LocationParams = z.object({ id: z.uuid() });

/**
 * /api/v1/partner — KITCHEN_PARTNER (own kitchens only, via user_pickup_locations) + ADMIN.
 * Packing desk (Phase 7): queue, mark packed, A4 labels, manifests, Web Push subscriptions.
 * Single-label URLs live in the logistics module (/partner/orders/:code/label, Phase 6).
 */
export const partnerRoutes: FastifyPluginAsyncZod<{
  service: PartnerService;
  notifications: NotificationsService;
  guards: AuthGuards;
}> = async (app, { service, notifications, guards }) => {
  const c = createPartnerController(service, notifications);
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['KITCHEN_PARTNER', 'ADMIN']));

  app.get('/pickup-locations', c.pickupLocations);
  app.get(
    '/pickup-locations/:id',
    {
      schema: { params: LocationParams },
      preHandler: guards.requirePickupLocationAccess((req) => (req.params as { id?: string }).id),
    },
    c.pickupLocation,
  );

  app.get('/orders', { schema: { querystring: PartnerOrdersQuerySchema } }, c.orders);
  app.post(
    '/orders/:orderCode/mark-packed',
    { schema: { params: OrderCodeParamsSchema, headers: MarkPackedHeadersSchema, body: MarkPackedRequestSchema } },
    c.markPacked,
  );
  app.get(
    '/labels/a4',
    { schema: { querystring: A4LabelsQuerySchema }, config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    c.a4Labels,
  );
  app.get('/manifests', c.manifests);

  app.get('/push-subscriptions', c.pushConfig);
  app.post('/push-subscriptions', { schema: { body: PushSubscriptionRequestSchema } }, c.subscribe);
  app.delete('/push-subscriptions', { schema: { body: PushUnsubscribeRequestSchema } }, c.unsubscribe);
};
