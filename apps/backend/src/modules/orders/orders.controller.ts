import type { AdminCancelOrderRequest, CancelOrderRequest, OrderAccessQuery } from '@pk/shared';
import type { FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { OrdersService } from './orders.service';

type CodeParams = { Params: { orderCode: string } };

export function createOrdersController(service: OrdersService) {
  return {
    status: async (request: FastifyRequest<CodeParams & { Querystring: OrderAccessQuery }>) =>
      ok(
        request,
        await service.statusFor(request.params.orderCode, { auth: request.auth, phone: request.query.phone }),
      ),

    invoice: async (request: FastifyRequest<CodeParams & { Querystring: OrderAccessQuery }>) =>
      ok(
        request,
        await service.invoiceUrl(request.params.orderCode, { auth: request.auth, phone: request.query.phone }),
      ),

    cancelByCustomer: async (request: FastifyRequest<CodeParams & { Body: CancelOrderRequest }>) =>
      ok(
        request,
        await service.cancel(request.params.orderCode, {
          actor: 'CUSTOMER',
          auth: authOf(request),
          refund: true,
          reason: request.body.reason,
          ip: request.ip ?? null,
        }),
      ),

    cancelByAdmin: async (request: FastifyRequest<CodeParams & { Body: AdminCancelOrderRequest }>) =>
      ok(
        request,
        await service.cancel(request.params.orderCode, {
          actor: 'ADMIN',
          auth: authOf(request),
          refund: request.body.refund ?? true,
          reason: request.body.reason,
          ip: request.ip ?? null,
        }),
      ),
  };
}
