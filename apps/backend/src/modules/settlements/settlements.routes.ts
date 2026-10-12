import {
  ExpenseCreateRequestSchema,
  ExpensesQuerySchema,
  ExpenseUpdateRequestSchema,
  MarkPaidRequestSchema,
  ReceiptUploadRequestSchema,
  SettlementGenerateRequestSchema,
} from '@pk/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, type AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { Actor, SettlementsService } from './settlements.service';

const IdParams = z.object({ id: z.uuid() });
const actor = (request: FastifyRequest): Actor => ({ auth: authOf(request), ip: request.ip ?? null });

/** /api/v1/admin/settlements + /api/v1/admin/expenses — ADMIN (settlements:manage), D-41. */
export const adminSettlementRoutes: FastifyPluginAsyncZod<{ service: SettlementsService; guards: AuthGuards }> = async (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['ADMIN']));

  app.get('/settlements', async (request) => ok(request, await service.list(false)));
  app.post('/settlements', { schema: { body: SettlementGenerateRequestSchema } }, async (request, reply) =>
    reply.code(201).send(ok(request, await service.generate(request.body, actor(request)))),
  );
  app.get('/settlements/:id', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.detail(request.params.id, false)),
  );
  app.delete('/settlements/:id', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.deleteDraft(request.params.id, actor(request))),
  );
  app.post('/settlements/:id/finalize', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.finalize(request.params.id, actor(request))),
  );
  app.post(
    '/settlements/:id/mark-paid',
    { schema: { params: IdParams, body: MarkPaidRequestSchema } },
    async (request) => ok(request, await service.markPaid(request.params.id, request.body, actor(request))),
  );
  app.get('/settlements/:id/statement', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.statementUrl(request.params.id, false)),
  );

  app.get('/expenses', { schema: { querystring: ExpensesQuerySchema } }, async (request) =>
    ok(request, await service.expenses(request.query)),
  );
  app.post('/expenses', { schema: { body: ExpenseCreateRequestSchema } }, async (request, reply) =>
    reply.code(201).send(ok(request, await service.createExpense(request.body, actor(request)))),
  );
  app.patch('/expenses/:id', { schema: { params: IdParams, body: ExpenseUpdateRequestSchema } }, async (request) =>
    ok(request, await service.updateExpense(request.params.id, request.body, actor(request))),
  );
  app.delete('/expenses/:id', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.deleteExpense(request.params.id, actor(request))),
  );
  app.post(
    '/expenses/:id/receipt-upload',
    { schema: { params: IdParams, body: ReceiptUploadRequestSchema } },
    async (request) => ok(request, await service.receiptUpload(request.params.id, request.body)),
  );
  app.get('/expenses/:id/receipt', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.receiptUrl(request.params.id)),
  );
};

/** /api/v1/partner/settlements — KITCHEN_PARTNER (+ ADMIN) read-only, FINALIZED / PAID only (D-40). */
export const partnerSettlementRoutes: FastifyPluginAsyncZod<{
  service: SettlementsService;
  guards: AuthGuards;
}> = async (app, { service, guards }) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['KITCHEN_PARTNER', 'ADMIN']));
  app.get('/settlements', async (request) => ok(request, await service.list(true)));
  app.get('/settlements/:id', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.detail(request.params.id, true)),
  );
  app.get('/settlements/:id/statement', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.statementUrl(request.params.id, true)),
  );
  app.post('/settlements/:id/acknowledge', { schema: { params: IdParams } }, async (request) =>
    ok(request, await service.acknowledge(request.params.id, actor(request))),
  );
};
