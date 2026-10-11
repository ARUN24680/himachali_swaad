import { CartQuoteRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createCartController } from './cart.controller';
import type { CartService } from './cart.service';

/** /api/v1/cart — public. The quote is a pure read; POST only because the body is a list. */
export const cartRoutes: FastifyPluginAsyncZod<{ service: CartService }> = async (app, { service }) => {
  const c = createCartController(service);
  app.post(
    '/quote',
    { schema: { body: CartQuoteRequestSchema }, config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    c.quote,
  );
};
