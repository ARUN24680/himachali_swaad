import { AdminWaitlistQuerySchema, WaitlistJoinRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuthGuards } from '../../middleware/auth';
import { createWaitlistController } from './waitlist.controller';
import type { WaitlistService } from './waitlist.service';

/** POST /api/v1/waitlist — public (guest), 5 / 10 min per IP; duplicates are a 200, never an error. */
export const waitlistRoutes: FastifyPluginAsyncZod<{ service: WaitlistService }> = async (app, { service }) => {
  const c = createWaitlistController(service);
  app.post(
    '/waitlist',
    { schema: { body: WaitlistJoinRequestSchema }, config: { rateLimit: { max: 5, timeWindow: 600_000 } } },
    c.join,
  );
};

/** /api/v1/admin/waitlist — ADMIN only: paginated list + CSV export (PII, audited `EXPORT`). */
export const adminWaitlistRoutes: FastifyPluginAsyncZod<{ service: WaitlistService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  const c = createWaitlistController(service);
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['ADMIN']));
  app.get('/waitlist', { schema: { querystring: AdminWaitlistQuerySchema } }, c.list);
  app.get('/waitlist/export.csv', { config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, c.exportCsv);
};
