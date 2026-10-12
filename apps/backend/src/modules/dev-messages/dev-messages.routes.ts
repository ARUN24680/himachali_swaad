import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { metaSignature } from '../../integrations/messaging/whatsapp-cloud';
import type { MockMessageProvider } from '../../integrations/messaging/mock';
import { ok } from '../../utils/response';

const StatusBody = z.object({
  providerMessageId: z.string().min(3),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
});

/**
 * /api/v1/dev/messages — registered ONLY with the mock providers (refused in production). Lists
 * what would have been sent (WhatsApp + SMS outbox) and plays Meta's delivery receipt webhook.
 */
export const devMessageRoutes: FastifyPluginAsync<{
  whatsapp: MockMessageProvider;
  sms: MockMessageProvider;
  appSecret: string;
}> = async (app, { whatsapp, sms, appSecret }) => {
  app.get('/', async (request) => {
    const all = [...(await whatsapp.outbox()), ...(await sms.outbox())].sort((a, b) => b.at.localeCompare(a.at));
    return ok(request, { messages: all.slice(0, 100) });
  });

  app.post('/status', async (request) => {
    const body = StatusBody.parse(request.body);
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'dev',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: body.providerMessageId,
                    status: body.status,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    ...(body.status === 'failed' ? { errors: [{ title: 'Simulated failure' }] } : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(appSecret, payload) },
      payload,
    });
    return ok(request, { webhook: res.json() });
  });
};
