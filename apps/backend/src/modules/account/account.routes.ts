import { AddressCreateRequestSchema, AddressIdParamsSchema, AddressUpdateRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authOf, type AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { AccountService } from './account.service';

/** /api/v1/me — the logged-in CUSTOMER's own data. */
export const accountRoutes: FastifyPluginAsyncZod<{ service: AccountService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['CUSTOMER']));

  app.get('/addresses', async (request) => ok(request, { addresses: await service.list(authOf(request).userId) }));

  app.post('/addresses', { schema: { body: AddressCreateRequestSchema } }, async (request, reply) => {
    const address = await service.create(authOf(request).userId, request.body);
    return reply.status(201).send(ok(request, { address }));
  });

  app.patch(
    '/addresses/:id',
    { schema: { params: AddressIdParamsSchema, body: AddressUpdateRequestSchema } },
    async (request) =>
      ok(request, { address: await service.update(authOf(request).userId, request.params.id, request.body) }),
  );

  app.delete('/addresses/:id', { schema: { params: AddressIdParamsSchema } }, async (request) => {
    await service.remove(authOf(request).userId, request.params.id);
    return ok(request, { deleted: true });
  });
};
