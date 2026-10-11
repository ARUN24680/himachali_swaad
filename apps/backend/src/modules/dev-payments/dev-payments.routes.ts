import { SimulatePaymentRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { paymentSignature } from '../../integrations/razorpay/gateway';
import { paymentEntity, type MockPaymentGateway } from '../../integrations/razorpay/mock';
import { ok } from '../../utils/response';

/**
 * /api/v1/dev/payments — registered ONLY with the mock gateway (env.ts refuses PAYMENT_GATEWAY=mock
 * in production). Plays the part of the Razorpay modal + Razorpay's servers: creates the payment,
 * returns what Checkout's success handler would get, and delivers the signed webhook a moment later
 * through the real /webhooks/razorpay route.
 */
export const devPaymentRoutes: FastifyPluginAsyncZod<{ gateway: MockPaymentGateway; webhookDelayMs: number }> = async (
  app,
  { gateway, webhookDelayMs },
) => {
  app.post('/simulate', { schema: { body: SimulatePaymentRequestSchema } }, async (request) => {
    const { razorpayOrderId, outcome, sendWebhook } = request.body;
    const payment = await gateway.simulatePayment(razorpayOrderId, outcome);

    if (sendWebhook) {
      const hook = gateway.buildWebhook(
        outcome === 'success' ? 'payment.captured' : 'payment.failed',
        paymentEntity(payment),
      );
      const deliver = () =>
        app
          .inject({
            method: 'POST',
            url: '/api/v1/webhooks/razorpay',
            headers: {
              'content-type': 'application/json',
              'x-razorpay-signature': hook.signature,
              'x-razorpay-event-id': hook.eventId,
            },
            payload: hook.body,
          })
          .catch((err: unknown) => request.log.error({ err }, 'mock webhook delivery failed'));
      if (webhookDelayMs > 0) setTimeout(() => void deliver(), webhookDelayMs).unref();
      else await deliver();
    }

    return ok(request, {
      razorpayOrderId,
      razorpayPaymentId: payment.id,
      razorpaySignature:
        outcome === 'success' ? paymentSignature(gateway.keySecret, razorpayOrderId, payment.id) : null,
    });
  });
};
