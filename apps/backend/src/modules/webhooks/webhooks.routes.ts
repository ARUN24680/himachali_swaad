import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ok } from '../../utils/response';
import type { WebhooksService } from './webhooks.service';

/**
 * /api/v1/webhooks — signature-authenticated, no cookies, exempt from the Origin check and from
 * rate limiting (architecture/02 §4, §9). JSON is kept as the raw Buffer: the HMAC is over the
 * exact bytes Razorpay sent, so it must not be re-serialised.
 */
export const webhookRoutes: FastifyPluginAsyncZod<{ service: WebhooksService }> = async (app, { service }) => {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1_048_576 }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/razorpay', { config: { rateLimit: false } }, async (request) => {
    const header = (name: string) => {
      const v = request.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const result = await service.handleRazorpay(
      request.body as Buffer,
      header('x-razorpay-signature'),
      header('x-razorpay-event-id'),
    );
    return ok(request, result);
  });
};
