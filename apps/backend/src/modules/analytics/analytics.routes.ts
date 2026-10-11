import { AnalyticsEventRequestSchema, type AnalyticsEventRequest } from '@pk/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { hashForMeta, type CapiEvent, type ConversionsClient } from '../../integrations/meta/conversions';
import { ok } from '../../utils/response';

/** What a Purchase event may reveal about a confirmed order (never trusted from the browser). */
export interface PurchaseFacts {
  totalPaise: number;
  productIds: string[];
  phone: string;
}

/**
 * /api/v1/analytics — Meta Conversions API relay for browser events (Phase 4 §4.8). Accepts only
 * events sent with marketing consent; answers 202 straight away and relays in the background.
 * Purchase (Phase 5 §5.7): value, items and hashed phone come from the confirmed order, event_id
 * is the order code so the browser Pixel's Purchase de-duplicates against it.
 */
export const analyticsRoutes: FastifyPluginAsyncZod<{
  capi: ConversionsClient;
  purchaseFacts: (orderCode: string) => Promise<PurchaseFacts | null>;
}> = async (app, { capi, purchaseFacts }) => {
  app.post(
    '/events',
    { schema: { body: AnalyticsEventRequestSchema }, config: { rateLimit: { max: 120, timeWindow: 60_000 } } },
    async (request: FastifyRequest<{ Body: AnalyticsEventRequest }>, reply: FastifyReply) => {
      const e = request.body;
      if (!capi.enabled) return reply.status(202).send(ok(request, { accepted: true, relayed: false }));

      const base: Omit<CapiEvent, 'eventName' | 'eventId'> = {
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: e.eventSourceUrl,
        userData: {
          clientIpAddress: request.ip,
          clientUserAgent: request.headers['user-agent'],
          fbp: request.cookies._fbp,
          fbc: request.cookies._fbc,
        },
      };
      if (e.eventName === 'Purchase') {
        const facts = await purchaseFacts(e.orderCode!);
        if (!facts) return reply.status(202).send(ok(request, { accepted: true, relayed: false }));
        void capi.send({
          ...base,
          eventName: 'Purchase',
          eventId: e.orderCode!,
          userData: { ...base.userData, phoneHashes: [hashForMeta(facts.phone.replace(/^\+/, ''))] },
          customData: {
            currency: 'INR',
            value: facts.totalPaise / 100,
            contentIds: facts.productIds,
            contentType: 'product',
          },
        });
        return reply.status(202).send(ok(request, { accepted: true, relayed: true }));
      }
      void capi.send({
        ...base,
        eventName: e.eventName,
        eventId: e.eventId,
        customData: {
          currency: 'INR',
          ...(e.valuePaise !== undefined ? { value: e.valuePaise / 100 } : {}), // Meta expects rupees
          ...(e.contentIds ? { contentIds: e.contentIds, contentType: 'product' as const } : {}),
        },
      });
      return reply.status(202).send(ok(request, { accepted: true, relayed: true }));
    },
  );
};
