import type { FastifyReply, FastifyRequest } from 'fastify';
import { fail, ok } from '../../utils/response';
import type { HealthService } from './health.service';

export function createHealthController(service: HealthService) {
  return {
    /** Process is alive — no dependency checks (liveness). */
    live: async (request: FastifyRequest) => ok(request, { status: 'ok' as const }),

    /** Worker heartbeat (uptime monitor): 503 when the worker hasn't checked in for 90 s. */
    worker: async (request: FastifyRequest, reply: FastifyReply) => {
      const w = await service.worker();
      if (w.alive) return ok(request, w);
      return reply
        .status(503)
        .send(fail(request.id, { code: 'UPSTREAM_UNAVAILABLE', message: 'Worker heartbeat missing', details: w }));
    },

    /** DB + Redis reachable (readiness). 503 so the load balancer stops routing traffic. */
    ready: async (request: FastifyRequest, reply: FastifyReply) => {
      const readiness = await service.readiness();
      if (readiness.ready) return ok(request, readiness);
      return reply.status(503).send(
        fail(request.id, {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Service dependencies unavailable',
          details: { database: readiness.database, redis: readiness.redis },
        }),
      );
    },
  };
}
