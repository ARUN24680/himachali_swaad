import type { CartQuoteRequest } from '@pk/shared';
import type { FastifyRequest } from 'fastify';
import { ok } from '../../utils/response';
import type { CartService } from './cart.service';

export function createCartController(service: CartService) {
  return {
    quote: async (request: FastifyRequest<{ Body: CartQuoteRequest }>) =>
      ok(request, await service.quoteCart(request.body.items)),
  };
}
