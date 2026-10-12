import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DelayedError, type Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { metaSignature } from '../../src/integrations/messaging/whatsapp-cloud';
import type { MockMessage } from '../../src/integrations/messaging/mock';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import type { ShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { createProcessors } from '../../src/jobs/processors';
import { createSweepers } from '../../src/jobs/sweepers';
import { as, catalogActors } from '../helpers/catalog';
import { confirmedOrder, markPacked, registerPickupName, shipmentRow, workerServices } from '../helpers/logistics';
import { startShiprocketSandbox, TEST_COURIER_TOKEN } from '../helpers/shiprocket';
import { assignPickupLocation, createStaff } from '../helpers/factories';
import {
  buildTestApp,
  fakeReporter,
  recordingJobs,
  TEST_ADMIN_PHONE,
  TEST_API_URL,
  TEST_WHATSAPP_SECRET,
  TEST_WHATSAPP_VERIFY,
  testGateway,
  testMessaging,
} from '../helpers/test-app';
import { silentLogger } from '../helpers/test-logger';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Phase 8 §8.4–8.6: WhatsApp-first template messages with SMS fallback, consent, dedup, quiet
 * hours, delivery receipts, admin alert batching, partner cancel alert, refund message.
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let sandbox: ShiprocketSandbox;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
let messaging: ReturnType<typeof testMessaging>;
const jobs = recordingJobs();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-notify-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-notify-secret',
});

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  messaging = testMessaging(redis);
  const sb = await startShiprocketSandbox(redis);
  sandbox = sb.sandbox;
  shiprocket = sb.client;
  closeSandbox = sb.close;
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, privateStorage, shiprocket, messaging });
  actors = await catalogActors(app, t.db);
  await registerPickupName(t.db, actors.kitchenA.id);
});
afterAll(async () => {
  await app.close();
  await closeSandbox();
  await redis.quit();
  await t.destroy();
});
beforeEach(async () => {
  await messaging.whatsapp.clear();
  await messaging.sms.clear();
});

const services = (now?: () => Date) =>
  workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage, messaging, now });
const processors = (now?: () => Date) => {
  const svc = services(now);
  const sweepers = createSweepers({ db: t.db, svc, gateway, jobs, logger: silentLogger(), reporter: fakeReporter() });
  return createProcessors({ db: t.db, svc, sweepers, logger: silentLogger() });
};
/** A BullMQ-ish job: `last` = this is the final attempt. */
const fakeJob = (last = true) => ({ attemptsMade: last ? 2 : 0, opts: { attempts: 3 } }) as unknown as Job;

const sent = async (to: string) => ({
  wa: (await messaging.whatsapp.outbox()).filter((m: MockMessage) => m.to === to),
  sms: (await messaging.sms.outbox()).filter((m: MockMessage) => m.to === to),
});
const logRows = async (orderId: string, template: string) =>
  (
    await t.db.query(
      'SELECT channel, status, error, provider FROM notifications_log WHERE order_id = $1 AND template = $2 ORDER BY channel::text, created_at',
      [orderId, template],
    )
  ).rows;

describe('customer messages (§8.4, §8.5)', () => {
  it('ORDER_CONFIRMED → WhatsApp (opted in) with the rendered template + track link, logged SENT; a second run is deduped', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 2, { whatsappOptIn: true });
    expect(jobs.jobs).toContainEqual(
      expect.objectContaining({ name: 'ORDER_CONFIRMED', jobId: `notify-order_confirmed-${o.orderId}` }),
    );
    const p = processors();
    expect(await p.ORDER_CONFIRMED({ orderId: o.orderId }, fakeJob())).toMatchObject({
      kind: 'sent',
      channel: 'WHATSAPP',
    });
    const { wa, sms } = await sent(o.phone);
    expect(sms).toHaveLength(0);
    expect(wa).toHaveLength(1);
    expect(wa[0]!.template).toBe('order_confirmed');
    expect(wa[0]!.text).toBe(
      `Hi Asha, your order ${o.orderCode} is confirmed: 2× Test Pickle 250g. Track: https://pahadikhatki.test/track?code=${o.orderCode} — Pahadi Khatki`,
    );
    expect(await logRows(o.orderId, 'order_confirmed')).toEqual([
      { channel: 'WHATSAPP', status: 'SENT', error: null, provider: 'mock-whatsapp' },
    ]);
    expect(await p.ORDER_CONFIRMED({ orderId: o.orderId }, fakeJob())).toEqual({ kind: 'duplicate' });
    expect((await sent(o.phone)).wa).toHaveLength(1);
  });

  it('no WhatsApp consent → critical templates by SMS, non-critical not sent at all (DPDP)', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: false });
    const p = processors();
    expect(await p.ORDER_CONFIRMED({ orderId: o.orderId }, fakeJob())).toMatchObject({
      kind: 'sent',
      channel: 'SMS',
      fellBack: false,
    });
    expect(await p.ORDER_STATUS_NOTIFY({ orderId: o.orderId, template: 'delivered_storage_tip' }, fakeJob())).toEqual({
      kind: 'skipped',
      reason: 'NO_CONSENT',
    });
    const { wa, sms } = await sent(o.phone);
    expect(wa).toHaveLength(0);
    expect(sms.map((m) => m.template)).toEqual(['order_confirmed']);
  });

  it('not on WhatsApp → FAILED WhatsApp row + SMS fallback logged; retryable error retries first, falls back on the last attempt', async () => {
    const notOnWa = `+9198765${String(Date.now()).slice(-1)}0000`;
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: true, phone: notOnWa });
    const p = processors();
    expect(await p.ORDER_CONFIRMED({ orderId: o.orderId }, fakeJob())).toMatchObject({
      kind: 'sent',
      channel: 'SMS',
      fellBack: true,
    });
    expect(await logRows(o.orderId, 'order_confirmed')).toEqual([
      { channel: 'SMS', status: 'SENT', error: null, provider: 'mock-sms' },
      { channel: 'WHATSAPP', status: 'FAILED', error: 'mock: recipient is not on WhatsApp', provider: 'mock-whatsapp' },
    ]);

    const o2 = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: true });
    messaging.whatsapp.failNext(2, true);
    await expect(
      p.ORDER_STATUS_NOTIFY({ orderId: o2.orderId, template: 'out_for_delivery' }, fakeJob(false)),
    ).rejects.toThrow(/mock WHATSAPP failure/);
    expect(await logRows(o2.orderId, 'out_for_delivery')).toEqual([
      { channel: 'WHATSAPP', status: 'QUEUED', error: 'mock WHATSAPP failure', provider: 'mock-whatsapp' },
    ]);
    // Last attempt: WhatsApp still down → the same row is closed FAILED and SMS goes out
    expect(
      await p.ORDER_STATUS_NOTIFY({ orderId: o2.orderId, template: 'out_for_delivery' }, fakeJob(true)),
    ).toMatchObject({
      kind: 'sent',
      channel: 'SMS',
    });
    expect((await logRows(o2.orderId, 'out_for_delivery')).map((r) => `${r.channel}:${r.status}`)).toEqual([
      'SMS:SENT',
      'WHATSAPP:FAILED',
    ]);
  });

  it('the same courier webhook twice → ONE order_shipped message', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: true });
    const svc = services();
    await svc.logistics.bookShipment(o.orderId);
    await svc.logistics.fetchAndStoreLabel(o.orderId);
    await markPacked(t.db, o.orderId);
    await services(() => new Date(Date.now() + 3 * 86_400_000)).logistics.pickupBatch();
    const awb = (await shipmentRow(t.db, o.orderId))!.awb_code as string;
    jobs.clear();
    const body = JSON.stringify(sandbox.scan(awb, 'PICKED UP', 'Kullu_Hub'));
    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/courier-tracking',
        headers: { 'content-type': 'application/json', 'x-api-key': TEST_COURIER_TOKEN },
        payload: body,
      });
    }
    const notify = jobs.jobs.filter((j) => j.name === 'ORDER_STATUS_NOTIFY');
    expect(new Set(notify.map((j) => j.jobId))).toEqual(new Set([`notify-order_shipped-${o.orderId}`]));
    // Even if BullMQ ran it twice, the log dedups
    const p = processors();
    for (const j of notify) await p.ORDER_STATUS_NOTIFY(j.data as never, fakeJob());
    await p.ORDER_STATUS_NOTIFY({ orderId: o.orderId, template: 'order_shipped' }, fakeJob());
    const { wa } = await sent(o.phone);
    expect(wa.map((m) => m.template)).toEqual(['order_shipped']);
    expect(wa[0]!.text).toContain(`(AWB ${awb})`);
  });

  it('refund processed → refund_processed with the amount; cancel message carries the refund note', async () => {
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: true });
    jobs.clear();
    await as(app, actors.adminJar).post(`/api/v1/admin/orders/${o.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    const p = processors();
    await p.ORDER_CANCELLED({ orderId: o.orderId }, fakeJob());
    const refundJob = jobs.jobs.find((j) => j.name === 'INITIATE_REFUND')!;
    jobs.clear();
    await p.INITIATE_REFUND(refundJob.data as never, fakeJob());
    // Razorpay's refund.processed (webhook path → settleRefund)
    const refundId = (refundJob.data as { refundId: string }).refundId;
    const r = (await t.db.query('SELECT gateway_refund_id, idempotency_key FROM refunds WHERE id = $1', [refundId]))
      .rows[0]!;
    await services().payments.settleRefund(r.gateway_refund_id, r.idempotency_key, 'processed');
    const refundMsg = jobs.jobs.find((j) => j.name === 'REFUND_PROCESSED')!;
    expect(refundMsg.jobId).toBe(`notify-refund_processed-${(refundJob.data as { refundId: string }).refundId}`);
    await p.REFUND_PROCESSED(refundMsg.data as never, fakeJob());
    const { wa } = await sent(o.phone);
    expect(wa.map((m) => m.template).sort()).toEqual(['order_cancelled', 'refund_processed']);
    expect(wa.find((m) => m.template === 'order_cancelled')!.text).toMatch(/Your refund of ₹[\d,.]+ is on its way/);
    expect(wa.find((m) => m.template === 'refund_processed')!.text).toMatch(/Refund of ₹[\d,.]+ for order/);
  });
});

describe('partner + quiet hours (§8.4, §8.5)', () => {
  it('order cancelled after packing started → "pack mat karein" to the kitchen (WhatsApp fallback when no push)', async () => {
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    await t.db.query("UPDATE users SET phone = '+919811122233' WHERE id = $1", [partner.id]);
    await assignPickupLocation(t.db, partner.id, actors.kitchenB.id);
    await registerPickupName(t.db, actors.kitchenB.id);
    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenB.id);
    const svc = services();
    await svc.logistics.bookShipment(o.orderId);
    await svc.logistics.fetchAndStoreLabel(o.orderId); // AWAITING_PACKING
    await as(app, actors.adminJar).post(`/api/v1/admin/orders/${o.orderCode}/cancel`, {
      reason: 'customer called',
      refund: true,
    });
    jobs.clear();
    const res = await processors().ORDER_CANCELLED({ orderId: o.orderId }, fakeJob());
    expect(res).toMatchObject({ partner: { partners: 1, pushed: 0, fallbacks: 1 } });
    const wa = jobs.jobs.find((j) => j.name === 'WHATSAPP_SEND')!;
    expect(wa.data).toMatchObject({
      template: 'order_cancelled_partner',
      userId: partner.id,
      variables: { order_code: o.orderCode },
    });
    expect(await processors().WHATSAPP_SEND(wa.data as never, fakeJob())).toMatchObject({
      kind: 'sent',
      channel: 'WHATSAPP',
    });
    const msg = (await sent('+919811122233')).wa[0]!;
    expect(msg.text).toBe(`Order ${o.orderCode} cancel ho gaya — pack mat karein, courier ko mat dein.`);
  });

  it('quiet hours: packing_digest at 22:00 IST is held till 08:00 (job moved to delayed), out_for_delivery still goes', async () => {
    const tenPmIst = new Date(Date.UTC(2026, 9, 12, 22, 0) - 5.5 * 3600_000);
    const partner = await createStaff(t.db, { role: 'KITCHEN_PARTNER' });
    await t.db.query("UPDATE users SET phone = '+919811122244' WHERE id = $1", [partner.id]);
    const p = processors(() => tenPmIst);
    const moveToDelayed = vi.fn(async () => undefined);
    const job = { attemptsMade: 0, opts: { attempts: 3 }, moveToDelayed } as unknown as Job;
    await expect(
      p.WHATSAPP_SEND(
        { template: 'packing_digest', userId: partner.id, orderId: null, variables: { count: '3' } },
        job,
        'tok',
      ),
    ).rejects.toBeInstanceOf(DelayedError);
    expect(moveToDelayed).toHaveBeenCalledWith(Date.UTC(2026, 9, 13, 8, 0) - 5.5 * 3600_000, 'tok');
    expect((await sent('+919811122244')).wa).toHaveLength(0);

    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: true });
    expect(await p.ORDER_STATUS_NOTIFY({ orderId: o.orderId, template: 'out_for_delivery' }, fakeJob())).toMatchObject({
      kind: 'sent',
    });
  });
});

describe('WhatsApp delivery receipts (POST /webhooks/whatsapp)', () => {
  const hook = (payload: object, secret = TEST_WHATSAPP_SECRET) => {
    const raw = JSON.stringify(payload);
    return app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(secret, raw) },
      payload: raw,
    });
  };
  const receipt = (id: string, status: string) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }],
  });

  it('GET verification challenge; bad signature → 401; delivered → read is monotonic; failed after delivered is ignored', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${TEST_WHATSAPP_VERIFY}&hub.challenge=12345`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('12345');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1',
        })
      ).statusCode,
    ).toBe(403);

    const o = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 1, { whatsappOptIn: true });
    await processors().ORDER_CONFIRMED({ orderId: o.orderId }, fakeJob());
    const id = (await sent(o.phone)).wa[0]!.id;
    expect((await hook(receipt(id, 'delivered'), 'wrong-secret')).statusCode).toBe(401);

    const status = async () =>
      (await t.db.query('SELECT status, delivered_at FROM notifications_log WHERE provider_message_id = $1', [id]))
        .rows[0]!;
    expect((await hook(receipt(id, 'delivered'))).json().data).toMatchObject({
      status: 'processed',
      updated: 1,
      unknown: 0,
    });
    expect((await status()).status).toBe('DELIVERED');
    await hook(receipt(id, 'read'));
    await hook(receipt(id, 'delivered')); // late, out of order
    await hook(receipt(id, 'failed'));
    const final = await status();
    expect(final.status).toBe('READ');
    expect(final.delivered_at).not.toBeNull();
    expect((await hook(receipt('wamid.UNKNOWN', 'read'))).json().data).toMatchObject({ unknown: 1 });
  });
});

describe('admin alerts (§8.6)', () => {
  it('same kind within 10 min → first now, then ONE summary with the count; nobody reachable → e-mail fallback', async () => {
    const svc = services();
    const kind = `TEST_KIND_${randomBytes(3).toString('hex')}`;
    jobs.clear();
    await svc.messages.adminAlert({ kind, orderId: null, message: 'first' });
    await svc.messages.adminAlert({ kind, orderId: null, message: 'second' });
    await svc.messages.adminAlert({ kind, orderId: null, message: 'third' });
    const adminWa = (await sent(TEST_ADMIN_PHONE)).wa.filter((m) => m.variables.kind === kind);
    expect(adminWa.map((m) => m.variables.message)).toEqual(['first']);
    const summary = jobs.jobs.filter((j) => j.name === 'ADMIN_ALERT_SUMMARY');
    expect(summary).toHaveLength(1);
    expect(summary[0]!.delayMs).toBe(600_000);
    await svc.messages.adminAlertSummary(summary[0]!.data as never);
    const after = (await sent(TEST_ADMIN_PHONE)).wa.filter((m) => m.variables.kind === kind);
    expect(after.map((m) => m.variables.message)).toContain(
      `2 more "${kind}" alert(s) in the last 10 minutes — see the admin dashboard`,
    );

    // WhatsApp down for every admin number → e-mail
    messaging.whatsapp.failNext(1, false);
    const kind2 = `${kind}_B`;
    expect(await svc.messages.adminAlert({ kind: kind2, orderId: null, message: 'wallet low' })).toEqual({
      sent: 'EMAIL',
    });
    expect(messaging.email.sent.at(-1)).toEqual({
      to: 'ops@pahadikhatki.test',
      subject: `[Pahadi Khatki ops] ${kind2}`,
    });
  });
});
