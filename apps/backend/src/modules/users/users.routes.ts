import {
  KitchenCreateRequestSchema,
  KitchenUpdateRequestSchema,
  StaffCreateRequestSchema,
  StaffResetPasswordRequestSchema,
  StaffUpdateRequestSchema,
} from '@pk/shared';
import type { FastifyRequest } from 'fastify';
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
  app.post(
    '/:id/reset-password',
    { schema: { params: IdParams, body: StaffResetPasswordRequestSchema } },
    async (request) =>
      ok(
        request,
        await service.resetPassword(request.params.id, request.body.password, {
          auth: authOf(request),
          ip: request.ip ?? null,
        }),
      ),
  );
};

/** /api/v1/admin/kitchens — pickup locations (Shiprocket pickup addresses), ADMIN only. */
export const kitchenRoutes: FastifyPluginAsyncZod<{ service: UsersService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['ADMIN']));
  const by = (request: FastifyRequest) => ({ auth: authOf(request), ip: request.ip ?? null });
  app.get('/', async (request) => ok(request, await service.listKitchens()));
  app.post('/', { schema: { body: KitchenCreateRequestSchema } }, async (request, reply) =>
    reply.code(201).send(ok(request, await service.createKitchen(request.body, by(request)))),
  );
  app.patch('/:id', { schema: { params: IdParams, body: KitchenUpdateRequestSchema } }, async (request) =>
    ok(request, await service.updateKitchen(request.params.id, request.body, by(request))),
  );
};
