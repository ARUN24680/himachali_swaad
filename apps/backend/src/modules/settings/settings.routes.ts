import { rolesFor } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../../config/db';
import type { AuthGuards } from '../../middleware/auth';
import { createSettingsController } from './settings.controller';
import type { SettingsService } from './settings.service';

/** /api/v1/admin/settings — ADMIN only (settings:manage). Editing arrives in Phase 9. */
export const adminSettingsRoutes: FastifyPluginAsyncZod<{
  service: SettingsService;
  db: Db;
  guards: AuthGuards;
}> = async (app, { service, db, guards }) => {
  const c = createSettingsController(service, db);
  app.get('/', { preHandler: [guards.requireAuth, guards.requireRole(rolesFor('settings:manage'))] }, c.list);
};
