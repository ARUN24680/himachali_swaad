import type { FastifyRequest } from 'fastify';
import { authOf } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { LogisticsService } from './logistics.service';

type CodeParams = { Params: { orderCode: string } };

export function createLogisticsController(service: LogisticsService) {
  return {
    label: async (request: FastifyRequest<CodeParams>) =>
      ok(request, await service.labelUrl(request.params.orderCode, authOf(request), request.ip ?? null)),
  };
}
