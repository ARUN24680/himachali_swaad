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
}

export async function registerSecurity(app: FastifyInstance, opts: SecurityOptions): Promise<void> {
  await app.register(helmet, { global: true });

  await app.register(cors, {
    origin: opts.origins,
    credentials: true, // httpOnly cookie sessions (D-20)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['x-request-id', 'retry-after'],
  });

  await app.register(rateLimit, {
    global: true,
    max: opts.rateLimitMax,
    timeWindow: opts.rateLimitWindowMs,
    redis: opts.redis,
    nameSpace: 'pk:rl:',
    skipOnError: false,
    allowList: (request) => request.url === '/healthz' || request.url === '/readyz',
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', 'Too many requests. Please wait and try again.', {
        retryAfterSeconds: Math.ceil(context.ttl / 1000),
      }),
  });
}
