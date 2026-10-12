import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { AppError } from '../utils/app-error';

export interface SecurityOptions {
  origins: string[];
  redis: Redis;
  /** Global default (architecture/02 §9: 300 / min per user/IP). Stricter limits are set per route. */
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /** HSTS (2 years, preload-ready) only over real HTTPS deployments. */
  production?: boolean;
}

/**
 * The API only serves JSON (+ PDFs via signed links), so its CSP denies everything and it may not
 * be framed (Phase 10 §10.1). bull-board, the one HTML page, relaxes this in queue-dashboard.ts.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export async function registerSecurity(app: FastifyInstance, opts: SecurityOptions): Promise<void> {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false, // set below as one exact header (helmet's builder would add defaults)
    hsts: opts.production ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
  });
  app.addHook('onSend', async (_request, reply) => {
    if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', API_CSP);
  });

  await app.register(cors, {
    origin: opts.origins,
    credentials: true, // httpOnly cookie sessions (D-20)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['x-request-id', 'retry-after', 'content-disposition'],
  });

  await app.register(rateLimit, {
    global: true,
    max: opts.rateLimitMax,
    timeWindow: opts.rateLimitWindowMs,
    redis: opts.redis,
    nameSpace: 'pk:rl:',
    skipOnError: false,
    allowList: (request) =>
      request.url === '/healthz' || request.url === '/readyz' || request.url === '/healthz/worker',
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', 'Too many requests. Please wait and try again.', {
        retryAfterSeconds: Math.ceil(context.ttl / 1000),
      }),
  });
}
