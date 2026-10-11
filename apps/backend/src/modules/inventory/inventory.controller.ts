import type { AdjustmentRequest, BatchCreateRequest, ShelfStatus } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { InventoryService, MutationContext } from './inventory.service';

type IdParams = { Params: { id: string } };
const ctxOf = (request: FastifyRequest): MutationContext => ({ ip: request.ip ?? null });

export function createInventoryController(service: InventoryService) {
  return {
    list: async (
      request: FastifyRequest<{
        Querystring: { productId?: string; locationId?: string; status?: ShelfStatus; includeEmpty: boolean };
      }>,
    ) => ok(request, await service.listBatches(authOf(request), request.query)),

    productOptions: async (request: FastifyRequest) => ok(request, { products: await service.productOptions() }),

    create: async (request: FastifyRequest<{ Body: BatchCreateRequest }>, reply: FastifyReply) => {
      const batch = await service.createBatch(authOf(request), request.body, ctxOf(request));
      return reply.status(201).send(ok(request, { batch }));
    },

    update: async (request: FastifyRequest<IdParams & { Body: { notes: string | null } }>) =>
      ok(request, {
        batch: await service.updateNotes(authOf(request), request.params.id, request.body.notes, ctxOf(request)),
      }),

    adjust: async (request: FastifyRequest<IdParams & { Body: AdjustmentRequest }>) =>
      ok(request, { batch: await service.adjust(authOf(request), request.params.id, request.body, ctxOf(request)) }),

    movements: async (request: FastifyRequest<IdParams>) =>
      ok(request, { movements: await service.movements(authOf(request), request.params.id) }),
  };
}
