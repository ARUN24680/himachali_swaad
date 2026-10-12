import type { MarkPackedRequest, PartnerOrdersQuery, PushSubscriptionRequest } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PartnerService } from './partner.service';

type CodeParams = { Params: { orderCode: string } };

export function createPartnerController(service: PartnerService, notifications: NotificationsService) {
  return {
    pickupLocation: async (request: FastifyRequest<{ Params: { id: string } }>) =>
      ok(request, { location: await service.pickupLocation(request.params.id) }),
    pickupLocations: async (request: FastifyRequest) =>
      ok(request, { locations: await service.pickupLocations(authOf(request)) }),

    orders: async (request: FastifyRequest<{ Querystring: PartnerOrdersQuery }>) =>
      ok(request, await service.orders(authOf(request), request.query.status ?? 'AWAITING_PACKING')),

    markPacked: async (request: FastifyRequest<CodeParams & { Body: MarkPackedRequest }>) =>
      ok(
        request,
        await service.markPacked(authOf(request), request.params.orderCode, {
          idempotencyKey: String(request.headers['idempotency-key']).toLowerCase(),
          checklist: request.body.checklist,
        }),
      ),

    a4Labels: async (request: FastifyRequest<{ Querystring: { orders: string[] } }>) =>
      ok(request, await service.a4Labels(authOf(request), request.query.orders, request.ip ?? null)),

    manifests: async (request: FastifyRequest) => ok(request, await service.manifests(authOf(request))),

    pushConfig: async (request: FastifyRequest) => ok(request, await notifications.pushConfig(authOf(request))),

    subscribe: async (request: FastifyRequest<{ Body: PushSubscriptionRequest }>, reply: FastifyReply) => {
      const ua = request.headers['user-agent'];
      await notifications.subscribe(authOf(request), request.body, typeof ua === 'string' ? ua : null);
      return reply.code(201).send(ok(request, { subscribed: true }));
    },

    unsubscribe: async (request: FastifyRequest<{ Body: { endpoint: string } }>) =>
      ok(request, { removed: await notifications.unsubscribe(authOf(request), request.body.endpoint) }),
  };
}
