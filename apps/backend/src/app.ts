import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from './config/db';
import type { ErrorReporter } from './config/sentry';
import { healthRoutes } from './modules/health/health.routes';
import { createHealthService } from './modules/health/health.service';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSecurity } from './plugins/security';
import { genRequestId } from './utils/request-id';

export interface AppDeps {
  logger: Logger;
  db: Db;
  redis: Redis;
  reporter: ErrorReporter;
  origins: string[];
  trustProxy?: boolean;
  rateLimit?: { max: number; windowMs: number };
}

/** Builds the Fastify app without listening — used by server.ts and by integration tests (`app.inject`). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // pino's Logger is a superset of FastifyBaseLogger; the cast keeps FastifyInstance's default logger generic
    loggerInstance: deps.logger as FastifyBaseLogger,
    genReqId: genRequestId,
    logController: new LogController({
      requestIdLogLabel: 'requestId',
      // Load-balancer probes would drown the request log
      disableRequestLogging: (req) => req.url === '/healthz' || req.url === '/readyz',
    }),
    bodyLimit: 1_048_576, // 1 MB; image uploads go direct to R2 (Phase 3)
    trustProxy: deps.trustProxy ?? false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandler(app, deps.reporter);
  await registerSecurity(app, {
    origins: deps.origins,
    redis: deps.redis,
    rateLimitMax: deps.rateLimit?.max ?? 300,
    rateLimitWindowMs: deps.rateLimit?.windowMs ?? 60_000,
  });

  await app.register(healthRoutes, { service: createHealthService({ db: deps.db, redis: deps.redis }) });

  // Domain modules mount under /api/v1 from Phase 2 onwards:
  // await app.register(authRoutes, { prefix: '/api/v1/auth', ... });

  return app;
}
