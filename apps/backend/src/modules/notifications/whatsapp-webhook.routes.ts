import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyMetaSignature } from '../../integrations/messaging/whatsapp-cloud';
import { AppError } from '../../utils/app-error';
import { ok } from '../../utils/response';
import type { MessagesService } from './messages.service';

const StatusPayload = z.looseObject({
  entry: z
    .array(
      z.looseObject({
        changes: z.array(
          z.looseObject({
            value: z.looseObject({
              statuses: z
                .array(
                  z.looseObject({
                    id: z.string(),
                    status: z.string(),
                    timestamp: z.string().optional(),
                    errors: z
                      .array(z.looseObject({ title: z.string().optional(), message: z.string().optional() }))
                      .optional(),
                  }),
                )
                .optional(),
            }),
          }),
        ),
      }),
    )
    .default([]),
});

/**
 * /api/v1/webhooks/whatsapp (architecture/02 §4, Phase 8 §8.4). GET = Meta's verification
 * challenge (hub.verify_token); POST = delivery receipts signed with X-Hub-Signature-256 over the
 * RAW body (app secret). Bad signature → 401; anything else → 200 so Meta doesn't retry forever.
 */
export const whatsappWebhookRoutes: FastifyPluginAsync<{
  messages: MessagesService;
  appSecret: string;
  verifyToken: string;
}> = async (app, { messages, appSecret, verifyToken }) => {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1_048_576 }, (_req, body, done) =>
    done(null, body),
  );

  app.get('/whatsapp', { config: { rateLimit: false } }, async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === verifyToken && q['hub.challenge']) {
      return reply.type('text/plain').send(q['hub.challenge']);
    }
    throw new AppError('FORBIDDEN', 'Verification failed.');
  });

  app.post('/whatsapp', { config: { rateLimit: false } }, async (request) => {
    const raw = (request.body as Buffer | undefined) ?? Buffer.alloc(0);
    const sig = request.headers['x-hub-signature-256'];
    if (!verifyMetaSignature(appSecret, raw, Array.isArray(sig) ? sig[0] : sig)) {
      throw new AppError('UNAUTHENTICATED', 'Invalid webhook signature.');
    }
    let parsed: z.infer<typeof StatusPayload>;
    try {
      parsed = StatusPayload.parse(JSON.parse(raw.toString('utf8') || '{}'));
    } catch {
      return ok(request, { status: 'ignored' });
    }
    const statuses = parsed.entry.flatMap((e) => e.changes.flatMap((c) => c.value.statuses ?? []));
    return ok(request, { status: 'processed', ...(await messages.applyReceipts(statuses)) });
  });
};
