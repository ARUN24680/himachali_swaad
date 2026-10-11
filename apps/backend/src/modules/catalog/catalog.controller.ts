import type { ImageUploadRequest, ProductCreateInput, ProductUpdateRequest } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { MutationContext } from '../inventory/inventory.service';
import type { CatalogService } from './catalog.service';

type IdParams = { Params: { id: string } };
const ctxOf = (request: FastifyRequest): MutationContext => ({ ip: request.ip ?? null });

/** Short shared-cache window; product edits also purge the storefront's `products` tag. */
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

export function createCatalogController(service: CatalogService) {
  return {
    listPublic: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('cache-control', PUBLIC_CACHE);
      return ok(request, await service.listPublic());
    },
    detailPublic: async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      reply.header('cache-control', PUBLIC_CACHE);
      return ok(request, { product: await service.detailPublic(request.params.slug) });
    },

    listAdmin: async (request: FastifyRequest) => ok(request, { products: await service.listAdmin() }),
    getAdmin: async (request: FastifyRequest<IdParams>) =>
      ok(request, { product: await service.getAdmin(request.params.id) }),
    create: async (request: FastifyRequest<{ Body: ProductCreateInput }>, reply: FastifyReply) => {
      const product = await service.create(authOf(request), request.body, ctxOf(request));
      return reply.status(201).send(ok(request, { product }));
    },
    update: async (request: FastifyRequest<IdParams & { Body: ProductUpdateRequest }>) =>
      ok(request, { product: await service.update(authOf(request), request.params.id, request.body, ctxOf(request)) }),
    publish: async (request: FastifyRequest<IdParams>) =>
      ok(request, { product: await service.publish(authOf(request), request.params.id, ctxOf(request)) }),
    unpublish: async (request: FastifyRequest<IdParams>) =>
      ok(request, { product: await service.unpublish(authOf(request), request.params.id, ctxOf(request)) }),
    presignImage: async (request: FastifyRequest<{ Body: ImageUploadRequest }>) =>
      ok(request, await service.presignImage(request.body)),
  };
}
