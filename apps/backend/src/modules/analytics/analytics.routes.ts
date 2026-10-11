import { AnalyticsEventRequestSchema, type AnalyticsEventRequest } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ConversionsClient } from '../../integrations/meta/conversions';
import { ok } from '../../utils/response';

/**
 * /api/v1/analytics — Meta Conversions API relay for browser events (Phase 4 §4.8). Accepts only
 * events sent with marketing consent; answers 202 straight away and relays in the background.
 */
export const analyticsRoutes: FastifyPluginAsyncZod<{ capi: ConversionsClient }> = async (app, { capi }) => {
  app.post(
    '/events',
    { schema: { body: AnalyticsEventRequestSchema }, config: { rateLimit: { max: 120, timeWindow: 60_000 } } },
    async (request: FastifyRequest<{ Body: AnalyticsEventRequest }>, reply: FastifyReply) => {
      const e = request.body;
      if (capi.enabled) {
        void capi.send({
          eventName: e.eventName,
          eventId: e.eventId,
          eventTime: Math.floor(Date.now() / 1000),
          eventSourceUrl: e.eventSourceUrl,
          userData: {
            clientIpAddress: request.ip,
            clientUserAgent: request.headers['user-agent'],
            fbp: request.cookies._fbp,
            fbc: request.cookies._fbc,
          },
          customData: {
            currency: 'INR',
            ...(e.valuePaise !== undefined ? { value: e.valuePaise / 100 } : {}), // Meta expects rupees
            ...(e.contentIds ? { contentIds: e.contentIds, contentType: 'product' as const } : {}),
          },
        });
      }
      return reply.status(202).send(ok(request, { accepted: true, relayed: capi.enabled }));
    },
  );
};
