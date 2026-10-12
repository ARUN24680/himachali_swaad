import { SimulateTrackingRequestSchema } from '@pk/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ShiprocketSandbox } from '../../integrations/shiprocket/sandbox';
import { AppError } from '../../utils/app-error';
import { ok } from '../../utils/response';
import type { LogisticsService } from '../logistics/logistics.service';
import type { OrdersService } from '../orders/orders.service';

/**
 * /api/v1/dev/shipping — registered ONLY with the Shiprocket sandbox (SHIPPING_PROVIDER=sandbox,
 * refused in production). Plays the courier: a scan moves the sandbox shipment and the signed
 * tracking webhook is delivered through the real /webhooks/courier-tracking route.
 */
export const devShippingRoutes: FastifyPluginAsyncZod<{
  sandbox: ShiprocketSandbox;
  logistics: LogisticsService;
  orders: OrdersService;
  webhookToken: string;
}> = async (app, { sandbox, logistics, orders, webhookToken }) => {
  app.post('/simulate', { schema: { body: SimulateTrackingRequestSchema } }, async (request) => {
    const { orderCode, status, location, sendWebhook } = request.body;
    const orderId = await orders.idForCode(orderCode);
    const shipment = orderId ? await logistics.shipmentFor(orderId) : null;
    if (!shipment?.awb_code) throw new AppError('NOT_FOUND', 'No AWB for this order yet.');
    const body = sandbox.scan(shipment.awb_code, status, location);
    let delivered: unknown = null;
    if (sendWebhook) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/courier-tracking',
        headers: { 'content-type': 'application/json', 'x-api-key': webhookToken },
        payload: JSON.stringify(body),
      });
      delivered = res.json();
    }
    return ok(request, { awb: shipment.awb_code, status: body.current_status, webhook: delivered });
  });
};
