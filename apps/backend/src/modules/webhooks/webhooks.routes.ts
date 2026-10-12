import type { FastifyRequest } from 'fastify';
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

  const header = (request: FastifyRequest, name: string) => {
    const v = request.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };

  app.post('/razorpay', { config: { rateLimit: false } }, async (request) => {
    const result = await service.handleRazorpay(
      request.body as Buffer,
      header(request, 'x-razorpay-signature'),
      header(request, 'x-razorpay-event-id'),
    );
    return ok(request, result);
  });

  /**
   * Shiprocket tracking webhook (D-35). Path avoids the words Shiprocket rejects in webhook URLs
   * ("shiprocket", "kartrocket", "sr", "kr") — doc 02's /webhooks/shiprocket can't be registered (D-53).
   */
  app.post('/courier-tracking', { config: { rateLimit: false } }, async (request) =>
    ok(
      request,
      await service.handleCourierTracking(
        (request.body as Buffer | undefined) ?? Buffer.alloc(0),
        header(request, 'x-api-key'),
      ),
    ),
  );
};
