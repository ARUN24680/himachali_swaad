import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';
import { ok } from '../../lib/envelope';
import { AppError } from '../../lib/errors';
import type { CheckoutService } from './checkout.service';

const ORDER_ID = /^order_[A-Za-z0-9]{16}$/;

/**
 * /pay — the customer-facing pay page (built SPA from web/, served from dist/web) and its one
 * read-only JSON endpoint. Rate-limited per IP; ids are unguessable; no PII in responses.
 */
export const checkoutRoutes: FastifyPluginAsync<{ service: CheckoutService; webRoot: string }> = async (
  app,
  { service, webRoot },
) => {
  app.get('/api/orders/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!ORDER_ID.test(id)) throw new AppError('NOT_FOUND', 'Payment not found');
    reply.header('cache-control', 'no-store');
    return ok(request, await service.view(id));
  });

  const built = existsSync(join(webRoot, 'index.html'));
  if (built) {
    await app.register(fastifyStatic, {
      root: join(webRoot, 'assets'),
      prefix: '/assets/',
      immutable: true,
      maxAge: '365d',
      index: false,
      wildcard: false,
      decorateReply: true,
    });
  }

  app.get('/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!ORDER_ID.test(id)) throw new AppError('NOT_FOUND', 'Payment not found');
    if (!built) return reply.code(503).type('text/plain').send('Pay page not built (pnpm --filter @pk/payment build)');
    reply.header('cache-control', 'no-store');
    return reply.sendFile('index.html', webRoot);
  });
};
