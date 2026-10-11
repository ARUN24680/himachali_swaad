import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthGuards } from '../../middleware/auth';
import { createPartnerController } from './partner.controller';
import type { PartnerService } from './partner.service';

const LocationParams = z.object({ id: z.uuid() });

/** /api/v1/partner — KITCHEN_PARTNER (own pickup locations) + ADMIN. Packing desk endpoints arrive in Phase 7. */
export const partnerRoutes: FastifyPluginAsyncZod<{ service: PartnerService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createPartnerController(service);
  app.get(
    '/pickup-locations/:id',
    {
      schema: { params: LocationParams },
      preHandler: [
        guards.requireAuth,
        guards.requireRole(['KITCHEN_PARTNER', 'ADMIN']),
        guards.requirePickupLocationAccess((req) => (req.params as { id?: string }).id),
      ],
    },
    c.pickupLocation,
  );
};
