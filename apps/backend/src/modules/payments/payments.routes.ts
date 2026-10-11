import { VerifyPaymentRequestSchema, type VerifyPaymentRequest } from '@pk/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ok } from '../../utils/response';
import type { PaymentsService } from './payments.service';

/** /api/v1/payments — public; authenticity comes from the Razorpay signature, not a session. */
export const paymentsRoutes: FastifyPluginAsyncZod<{ service: PaymentsService }> = async (app, { service }) => {
  app.post(
    '/verify',
    { schema: { body: VerifyPaymentRequestSchema }, config: { rateLimit: { max: 30, timeWindow: 600_000 } } },
    async (request: FastifyRequest<{ Body: VerifyPaymentRequest }>) => ok(request, await service.verify(request.body)),
  );
};
