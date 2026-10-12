import { rolesFor, SettingUpdateRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../../config/db';
import { authOf, type AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import { createSettingsController } from './settings.controller';
import type { SettingsService } from './settings.service';

/** /api/v1/admin/settings — ADMIN only (settings:manage). PATCH validates per key (SETTING_SCHEMAS), audited. */
export const adminSettingsRoutes: FastifyPluginAsyncZod<{
  service: SettingsService;
  db: Db;
  guards: AuthGuards;
}> = async (app, { service, db, guards }) => {
  const c = createSettingsController(service, db);
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(rolesFor('settings:manage')));
  app.get('/', c.list);
  app.patch('/', { schema: { body: SettingUpdateRequestSchema } }, async (request) => {
    await service.update(db, request.body.key, request.body.value, {
      userId: authOf(request).userId,
      ip: request.ip ?? null,
    });
    return ok(request, { settings: await service.list(db) });
  });
};
