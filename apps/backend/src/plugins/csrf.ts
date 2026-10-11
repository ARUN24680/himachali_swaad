import type { FastifyInstance } from 'fastify';
import { AppError } from '../utils/app-error';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Webhooks authenticate by signature/token, not cookies (architecture/02 §4). */
const EXEMPT_PREFIXES = ['/api/v1/webhooks/'];

/**
 * CSRF defence (D-20): every cookie-carrying mutation must come from an allowed browser origin.
 * A missing Origin is rejected too — server-side callers (Next.js server actions) must send one.
 */
export function registerOriginCheck(app: FastifyInstance, allowedOrigins: string[]): void {
  const allowed = new Set(allowedOrigins);
  app.addHook('onRequest', async (request) => {
    if (!MUTATING.has(request.method)) return;
    if (EXEMPT_PREFIXES.some((p) => request.url.startsWith(p))) return;
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) {
      request.log.warn({ origin: origin ?? null, url: request.routeOptions.url }, 'blocked by origin check');
      throw new AppError('FORBIDDEN', 'Request origin not allowed.');
    }
  });
}
