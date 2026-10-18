import type { FastifyRequest } from 'fastify';

/** Same response envelope as the store API (Rules §2.2). */
export const ok = <T>(request: FastifyRequest, data: T) => ({
  success: true as const,
  data,
  error: null,
  requestId: request.id,
  timestamp: new Date().toISOString(),
});

export const fail = (requestId: string, code: string, message: string) => ({
  success: false as const,
  data: null,
  error: { code, message },
  requestId,
  timestamp: new Date().toISOString(),
});
