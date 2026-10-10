import type { ApiError, Envelope } from '@pk/shared';
import type { FastifyRequest } from 'fastify';

/** Standard success envelope (Rules §2.2). Controllers return `ok(request, data)`. */
export function ok<T>(request: FastifyRequest, data: T): Envelope<T> {
  return { success: true, data, error: null, requestId: request.id, timestamp: new Date().toISOString() };
}

export function fail(requestId: string, error: ApiError): Envelope<never> {
  return { success: false, data: null, error, requestId, timestamp: new Date().toISOString() };
}
