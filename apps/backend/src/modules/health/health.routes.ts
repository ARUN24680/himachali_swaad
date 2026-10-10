import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { HealthService } from './health.service';
import { createHealthController } from './health.controller';

/** Infra endpoints live at the root (not /api/v1) and are exempt from rate limiting. */
export const healthRoutes: FastifyPluginAsyncZod<{ service: HealthService }> = async (app, { service }) => {
  const controller = createHealthController(service);
  app.get('/healthz', controller.live);
  app.get('/readyz', controller.ready);
};
