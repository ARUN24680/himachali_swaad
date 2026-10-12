import { createWebPushSender, type PushSender } from '../../src/integrations/push/web-push';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { Db, Queryable } from '../../src/config/db';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import type { PrivateStorage } from '../../src/integrations/storage/private';
import type { JobQueue } from '../../src/jobs/queues';
import { transitionOrder } from '../../src/modules/orders/orders.service';
import { createCommerceServices } from '../../src/services';
import { liveProduct, orderRow, payAtGateway, placeOrder, verify } from './checkout';
import { TEST_COURIER_TOKEN } from './shiprocket';
import { fakeReporter, spyRevalidator, testStorage } from './test-app';
import { silentLogger } from './test-logger';

/** Worker-side service graph against the sandbox (optionally with a fixed clock). */
export function workerServices(d: {
  db: Db;
  redis: Redis;
  gateway: MockPaymentGateway;
  jobs: JobQueue;
  shiprocket: ShiprocketApi;
  privateStorage: PrivateStorage;
  now?: () => Date;
  reporter?: ReturnType<typeof fakeReporter>;
  push?: PushSender;
}) {
  return createCommerceServices({
    db: d.db,
    redis: d.redis,
    logger: silentLogger(),
    reporter: d.reporter ?? fakeReporter(),
    storage: testStorage(),
    privateStorage: d.privateStorage,
    revalidator: spyRevalidator(),
    gateway: d.gateway,
    jobs: d.jobs,
    allowDraftInvoice: true,
    shiprocket: d.shiprocket,
    courierWebhookToken: TEST_COURIER_TOKEN,
    push: d.push ?? createWebPushSender({}),
    now: d.now,
  });
}

/** Kitchen registered in Shiprocket (Phase 0 prerequisite). */
export async function registerPickupName(db: Queryable, kitchenId: string, name = `KITCHEN-${kitchenId.slice(0, 8)}`) {
  await db.query('UPDATE pickup_locations SET shiprocket_pickup_name = $2 WHERE id = $1', [kitchenId, name]);
  return name;
}

/** Paid + CONFIRMED order (mock Razorpay) of `quantity` jars from `kitchenId`. */
export async function confirmedOrder(
  app: FastifyInstance,
  db: Queryable,
  gateway: MockPaymentGateway,
  kitchenId: string,
  quantity = 1,
) {
  const p = await liveProduct(db, kitchenId, { stock: 10 });
  const co = (await placeOrder(app, [{ productId: p.id, quantity }])).json().data;
  const { verifyBody } = await payAtGateway(gateway, co.razorpayOrderId);
  const verified = await verify(app, verifyBody);
  const order = await orderRow(db, co.orderCode);
  if (order.status !== 'CONFIRMED') {
    throw new Error(`confirmedOrder: ${co.orderCode} is ${order.status} (verify → ${verified.statusCode})`);
  }
  return { orderId: order.id, orderCode: co.orderCode as string, productId: p.id, batchId: p.batchId! };
}

/** Partner packs it (Phase 7 does this through the packing desk). */
export async function markPacked(db: Db, orderId: string) {
  await db.transaction((client) =>
    transitionOrder(client, orderId, 'AWAITING_PACKING', 'PACKED', { actor: 'KITCHEN_PARTNER', reason: 'test pack' }),
  );
}

export async function shipmentRow(db: Queryable, orderId: string) {
  const { rows } = await db.query('SELECT * FROM shipments WHERE order_id = $1', [orderId]);
  return rows[0] as Record<string, unknown> | undefined;
}
