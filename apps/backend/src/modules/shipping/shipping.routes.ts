import { PincodeCheckRequestSchema, PincodeParamsSchema, type PincodeCheckRequest } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { ok } from '../../utils/response';
import type { ShippingService } from './shipping.service';

/** /api/v1/shipping — public pincode check (rate-limited per IP). */
export const shippingRoutes: FastifyPluginAsyncZod<{ service: ShippingService }> = async (app, { service }) => {
  app.post(
    '/check-pincode',
    { schema: { body: PincodeCheckRequestSchema }, config: { rateLimit: { max: 30, timeWindow: 60_000 } } },
    async (request: FastifyRequest<{ Body: PincodeCheckRequest }>) =>
      ok(request, await service.checkPincode(request.body.pincode)),
  );

  app.get(
    '/pincode/:pincode/locality',
    { schema: { params: PincodeParamsSchema }, config: { rateLimit: { max: 30, timeWindow: 60_000 } } },
    async (request) => ok(request, await service.locality(request.params.pincode)),
  );
};
