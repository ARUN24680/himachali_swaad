import type { FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { PartnerService } from './partner.service';

export function createPartnerController(service: PartnerService) {
  return {
    pickupLocation: async (request: FastifyRequest<{ Params: { id: string } }>) =>
      ok(request, { location: await service.pickupLocation(request.params.id) }),
    pickupLocations: async (request: FastifyRequest) =>
      ok(request, { locations: await service.pickupLocations(authOf(request)) }),
  };
}
