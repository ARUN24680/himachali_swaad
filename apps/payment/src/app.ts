import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from './config/db';
import { fail, ok } from './lib/envelope';
import { AppError } from './lib/errors';
import { alertRoutes, devRoutes } from './modules/alerts/alerts.routes';
import type { AlertsService } from './modules/alerts/alerts.service';
import type { EmailChannel } from './modules/alerts/email';
import type { ObserverChannel } from './modules/alerts/observer';
import { checkoutRoutes } from './modules/checkout/checkout.routes';
import type { CheckoutService } from './modules/checkout/checkout.service';
import { gatewayRoutes } from './modules/gateway/gateway.routes';
import type { GatewayService } from './modules/gateway/gateway.service';

export interface AppDeps {
  db: Db;
  logger: Logger;
  gateway: GatewayService;
  checkout: CheckoutService;
  alerts: AlertsService;
  email: EmailChannel | null;
  observer: ObserverChannel | null;
  apiKeyId: string;
  apiKeySecret: string;
  webRoot: string;
  trustProxy: boolean;
  devTools: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.logger as FastifyBaseLogger,
    trustProxy: deps.trustProxy,
    genReqId: (req) => {
      const given = req.headers['x-request-id'];
      return typeof given === 'string' && /^[\w-]{8,64}$/.test(given) ? given : `req_${randomUUID()}`;
    },
    bodyLimit: 65_536,
  });

  // The pay page is a static SPA: everything from our own origin, nothing inline, never framed
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        // HTTPS only: on a local http:// run it would make the browser fetch the assets over https
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: process.env.NODE_ENV === 'production',
  });

  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send(fail(request.id, err.code, err.message));
    if (err instanceof z.ZodError) {
      return reply.code(400).send(fail(request.id, 'BAD_REQUEST_ERROR', err.issues[0]?.message ?? 'Invalid request'));
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) return reply.code(429).send(fail(request.id, 'RATE_LIMITED', 'Too many requests'));
    if (status < 500) return reply.code(status).send(fail(request.id, 'BAD_REQUEST_ERROR', 'Invalid request'));
    request.log.error({ err }, 'unhandled error');
    return reply.code(500).send(fail(request.id, 'INTERNAL', 'Something went wrong'));
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send(fail(request.id, 'NOT_FOUND', 'Not found')));

  app.get('/healthz', { config: { rateLimit: false } }, async (request) => ok(request, { status: 'ok' }));
  app.get('/readyz', { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await deps.db.query('SELECT 1');
      return ok(request, { status: 'ready' });
    } catch {
      return reply.code(503).send(fail(request.id, 'NOT_READY', 'Database unavailable'));
    }
  });

  await app.register(gatewayRoutes, {
    prefix: '/v1',
    service: deps.gateway,
    keyId: deps.apiKeyId,
    keySecret: deps.apiKeySecret,
  });
  await app.register(alertRoutes, { prefix: '/v1', email: deps.email, observer: deps.observer });
  await app.register(checkoutRoutes, { prefix: '/pay', service: deps.checkout, webRoot: deps.webRoot });
  if (deps.devTools) await app.register(devRoutes, { prefix: '/dev', alerts: deps.alerts });

  return app;
}
