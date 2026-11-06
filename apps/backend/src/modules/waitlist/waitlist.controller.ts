import type { AdminWaitlistQuery, WaitlistJoinRequest } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { WaitlistJoinInput, WaitlistService } from './waitlist.service';

export function createWaitlistController(service: WaitlistService) {
  return {
    join: async (request: FastifyRequest<{ Body: WaitlistJoinRequest }>) =>
      ok(
        request,
        await service.join(request.body as WaitlistJoinInput, {
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        }),
      ),

    list: async (request: FastifyRequest<{ Querystring: AdminWaitlistQuery }>) => {
      const q = request.query as { page: number; pageSize: number; q?: string; source?: WaitlistJoinInput['source'] };
      return ok(request, await service.list({ page: q.page, pageSize: q.pageSize, q: q.q, source: q.source }));
    },

    exportCsv: async (request: FastifyRequest, reply: FastifyReply) => {
      const { csv, filename } = await service.exportCsv({ auth: authOf(request), ip: request.ip ?? null });
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .header('cache-control', 'private, no-store')
        .send(`\uFEFF${csv}`); // BOM so Excel reads UTF-8
    },
  };
}
