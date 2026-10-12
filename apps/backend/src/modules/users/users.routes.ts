import { StaffCreateRequestSchema, StaffUpdateRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, type AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { UsersService } from './users.service';

const IdParams = z.object({ id: z.uuid() });

/** /api/v1/admin/staff — ADMIN only (Phase 9 §9.7). */
export const staffRoutes: FastifyPluginAsyncZod<{ service: UsersService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['ADMIN']));
  app.get('/', async (request) => ok(request, await service.list()));
  app.post('/', { schema: { body: StaffCreateRequestSchema } }, async (request, reply) =>
    reply.code(201).send(
      ok(
        request,
        await service.create(request.body as Parameters<UsersService['create']>[0], {
          auth: authOf(request),
          ip: request.ip ?? null,
        }),
      ),
    ),
  );
  app.patch('/:id', { schema: { params: IdParams, body: StaffUpdateRequestSchema } }, async (request) =>
    ok(
      request,
      await service.update(request.params.id, request.body, { auth: authOf(request), ip: request.ip ?? null }),
    ),
  );
};
