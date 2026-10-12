import {
  AddNoteRequestSchema,
  AdminCustomersQuerySchema,
  AdminOrdersQuerySchema,
  AdminRefundRequestSchema,
  AuditLogQuerySchema,
  CustomerPhoneParamsSchema,
  ExportParamsSchema,
  ExportQuerySchema,
  IdempotencyHeadersSchema,
  OrderCodeParamsSchema,
  ResendNotificationRequestSchema,
  ResolveIssueRequestSchema,
  WebhookIdParamsSchema,
} from '@pk/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authOf, type AuthGuards } from '../../middleware/auth';
import { ok } from '../../utils/response';
import type { AdminActor, AdminService } from './admin.service';
import type { ExportsService } from './exports.service';
import type { OpsAlertsService } from './ops-alerts.service';

const actor = (request: FastifyRequest): AdminActor => ({ auth: authOf(request), ip: request.ip ?? null });

/**
 * /api/v1/admin — the ADMIN console API (Phase 9). Whole prefix: requireAuth + ADMIN. Every
 * mutation is audited by its service. (Order cancel lives in the orders module, labels in logistics.)
 */
export const adminRoutes: FastifyPluginAsyncZod<{
  service: AdminService;
  exportsService: ExportsService;
  opsAlerts: OpsAlertsService;
  guards: AuthGuards;
}> = async (app, { service, exportsService, opsAlerts, guards }) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole(['ADMIN']));

  app.get('/dashboard', async (request) => ok(request, await service.dashboard()));

  app.get('/orders', { schema: { querystring: AdminOrdersQuerySchema } }, async (request) => {
    const q = request.query;
    return ok(
      request,
      await service.orders({
        tab: q.tab,
        statuses: q.status,
        q: q.q,
        from: q.from,
        to: q.to,
        page: q.page,
        pageSize: q.pageSize,
        sort: q.sort,
      }),
    );
  });
  app.get('/orders/:orderCode', { schema: { params: OrderCodeParamsSchema } }, async (request) =>
    ok(request, await service.orderDetail(request.params.orderCode)),
  );
  app.post(
    '/orders/:orderCode/refunds',
    { schema: { params: OrderCodeParamsSchema, headers: IdempotencyHeadersSchema, body: AdminRefundRequestSchema } },
    async (request) =>
      ok(
        request,
        await service.refund(
          request.params.orderCode,
          request.body,
          String(request.headers['idempotency-key']).toLowerCase(),
          actor(request),
        ),
      ),
  );
  app.post(
    '/orders/:orderCode/notifications/resend',
    { schema: { params: OrderCodeParamsSchema, body: ResendNotificationRequestSchema } },
    async (request) =>
      ok(request, await service.resendNotification(request.params.orderCode, request.body.template, actor(request))),
  );
  app.post('/orders/:orderCode/retry-shipment', { schema: { params: OrderCodeParamsSchema } }, async (request) =>
    ok(request, await service.retryShipment(request.params.orderCode, actor(request))),
  );
  app.post(
    '/orders/:orderCode/resolve-issue',
    { schema: { params: OrderCodeParamsSchema, body: ResolveIssueRequestSchema } },
    async (request) =>
      ok(request, await service.resolveIssue(request.params.orderCode, request.body.note, actor(request))),
  );
  app.post(
    '/orders/:orderCode/notes',
    { schema: { params: OrderCodeParamsSchema, body: AddNoteRequestSchema } },
    async (request) => ok(request, await service.addNote(request.params.orderCode, request.body.text, actor(request))),
  );

  app.get('/customers', { schema: { querystring: AdminCustomersQuerySchema } }, async (request) =>
    ok(request, await service.customers(request.query)),
  );
  app.get('/customers/:phone', { schema: { params: CustomerPhoneParamsSchema } }, async (request) =>
    ok(request, await service.customer(request.params.phone)),
  );

  app.get('/inventory/expiry-alerts', async (request) => ok(request, await service.expiryAlerts()));

  app.get(
    '/exports/:type',
    {
      schema: { params: ExportParamsSchema, querystring: ExportQuerySchema },
      config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    },
    async (request, reply) => {
      const { csv, filename } = await exportsService.export(request.params.type, request.query, actor(request));
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .header('cache-control', 'private, no-store')
        .send(`\uFEFF${csv}`); // BOM so Excel reads UTF-8
    },
  );

  app.get('/webhooks/failures', async (request) => ok(request, await service.webhookFailures()));
  app.post('/webhooks/:id/replay', { schema: { params: WebhookIdParamsSchema } }, async (request) =>
    ok(request, await service.replayWebhook(request.params.id, actor(request))),
  );

  // Phase 10 §10.3: ops metrics card + "send a test alert" button
  app.get('/ops/metrics', async (request) => ok(request, await opsAlerts.metrics()));
  app.post('/ops/test-alert', async (request) => ok(request, await opsAlerts.testAlert(actor(request))));

  app.get('/audit-log', { schema: { querystring: AuditLogQuerySchema } }, async (request) =>
    ok(request, await service.auditLog(request.query)),
  );
};
