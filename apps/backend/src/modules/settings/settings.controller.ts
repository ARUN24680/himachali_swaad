import type { FastifyRequest } from 'fastify';
import type { Db } from '../../config/db';
import { ok } from '../../utils/response';
import type { SettingsService } from './settings.service';

export function createSettingsController(service: SettingsService, db: Db) {
  return {
    list: async (request: FastifyRequest) => ok(request, { settings: await service.list(db) }),
  };
}
