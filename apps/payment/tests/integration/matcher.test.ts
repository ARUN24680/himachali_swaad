import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../src/config/db';
import { hmacHex } from '../../src/lib/crypto';
import { createDispatcher } from '../../src/modules/outbox/outbox.service';
import type { Services } from '../../src/services';
import { WEBHOOK_SECRET, basicAuth, createTestApp, createTestDb, silentLogger, truncateAll } from '../helpers/test-env';

let db: Db;
let destroy: () => Promise<void>;
let app: FastifyInstance;
let svc: Services;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  ({ app, svc } = await createTestApp(db));
});
afterAll(async () => {
  await app.close();
  await destroy();
});
beforeEach(() => truncateAll(db));

const order = (amountPaise = 49_999, receipt = 'PK-7KQ2M9') =>
  svc.gateway.createOrder({ amountPaise, receipt, notes: {} });
const credit = (
  amountPaise: number,
  utr: string | null,
  extra: Partial<Parameters<Services['alerts']['ingest']>[0]> = {},
) =>
  svc.alerts.ingest({
    source: 'DEV',
    externalId: `t:${Math.random()}`,
    sender: 't',
    creditedAt: new Date(),
    amountPaise,
    utr,
    ...extra,
  });
const outbox = async () =>
  (await db.query<{ event: string; body: string }>(`SELECT event, body FROM upi_webhook_outbox ORDER BY id`)).rows;

describe('matcher', () => {
  it('exact payable amount + new UTR → MATCHED, order paid, payment.captured queued with the ORDER amount', async () => {
    const o = await order();
    const r = await credit(o.payable_paise, '629012345678');
    expect(r.status).toBe('MATCHED');
    expect((await svc.gateway.getOrder(o.id)).status).toBe('paid');
    const [ev] = await outbox();
    expect(ev!.event).toBe('payment.captured');
    const entity = JSON.parse(ev!.body).payload.payment.entity;
    expect(entity).toMatchObject({ order_id: o.id, amount: 49_999, status: 'captured', method: 'upi', tax: 0 });
    expect(entity.fee).toBe(49_999 - o.payable_paise);
  });

  it('the same UTR from a second channel is a DUPLICATE — one payment only', async () => {
    const o = await order();
    await credit(o.payable_paise, '629012345678', { source: 'EMAIL' });
    const again = await credit(o.payable_paise, '629012345678', { source: 'ANDROID' });
    expect(again.status).toBe('DUPLICATE');
    expect((await svc.gateway.listOrderPayments(o.id)).length).toBe(1);
  });

  it('e-mail and SMS for the same transfer racing → exactly one payment', async () => {
    const o = await order();
    const results = await Promise.all(Array.from({ length: 8 }, () => credit(o.payable_paise, '629012345678')));
    expect(results.filter((r) => r.status === 'MATCHED')).toHaveLength(1);
    expect((await svc.gateway.listOrderPayments(o.id)).length).toBe(1);
    expect((await outbox()).length).toBe(1);
  });

  it('wrong amount, missing UTR, old or future alerts never confirm an order', async () => {
    const o = await order();
    expect((await credit(o.payable_paise + 1, '629012345601')).status).toBe('UNMATCHED');
    expect((await credit(o.payable_paise, null)).status).toBe('UNMATCHED');
    const stale = await credit(o.payable_paise, '629012345602', { creditedAt: new Date(Date.now() - 4 * 86_400_000) });
    expect(stale).toMatchObject({ status: 'REJECTED', reason: 'STALE_ALERT' });
    const future = await credit(o.payable_paise, '629012345603', { creditedAt: new Date(Date.now() + 3_600_000) });
    expect(future).toMatchObject({ status: 'REJECTED', reason: 'FUTURE_TIMESTAMP' });
    expect((await svc.gateway.getOrder(o.id)).status).toBe('created');
    expect(await outbox()).toEqual([]);
  });

  it('a credit before the order existed, or after the hold, does not match', async () => {
    const o = await order();
    const early = await credit(o.payable_paise, '629012345604', { creditedAt: new Date(Date.now() - 10 * 60_000) });
    expect(early.status).toBe('UNMATCHED');
    await db.query(
      `UPDATE upi_orders SET expires_at = NOW() - INTERVAL '2 hours', hold_until = NOW() - INTERVAL '1 hour'`,
    );
    expect((await credit(o.payable_paise, '629012345605')).status).toBe('UNMATCHED');
  });

  it('a late payment inside the grace window still matches (the store decides re-reserve vs refund)', async () => {
    const o = await order();
    await db.query(`UPDATE upi_orders SET expires_at = NOW() - INTERVAL '5 minutes' WHERE id = $1`, [o.id]);
    expect((await credit(o.payable_paise, '629012345606')).status).toBe('MATCHED');
  });

  it('expiry sweeper frees amounts past the hold', async () => {
    const o = await order();
    await db.query(
      `UPDATE upi_orders SET expires_at = NOW() - INTERVAL '2 hours', hold_until = NOW() - INTERVAL '1 minute'`,
    );
    expect(await svc.gateway.expireOverdue()).toBe(1);
    expect((await svc.gateway.getOrder(o.id)).status).toBe('expired');
  });

  it('redelivery of the same external id is a no-op', async () => {
    const o = await order();
    const a = { externalId: 'ses:abc' };
    await credit(o.payable_paise, '629012345607', a);
    expect(await credit(o.payable_paise, '629012345607', a)).toMatchObject({
      status: 'DUPLICATE',
      reason: 'REDELIVERY',
    });
  });
});

describe('admin link', () => {
  it('links an unmatched alert; an under-payment reaches the store as an amount mismatch', async () => {
    const o = await order(49_999);
    const a = await credit(40_000, '629012345608');
    expect(a.status).toBe('UNMATCHED');
    const { payment } = await svc.alerts.link(a.alertId!, o.id, 'tester');
    expect(payment.received_paise).toBe(40_000);
    expect(payment.amount_paise).toBe(40_000 + (49_999 - o.payable_paise));
    expect(payment.amount_paise).not.toBe(49_999);
    const audit = await db.query(`SELECT action, actor FROM upi_admin_audit`);
    expect(audit.rows).toEqual([{ action: 'ALERT_LINKED', actor: 'tester' }]);
    await expect(svc.alerts.link(a.alertId!, o.id, 'tester')).rejects.toThrow('LINKED');
  });

  it('refuses to book a UTR twice or pay a paid order', async () => {
    const o = await order();
    await credit(o.payable_paise, '629012345609');
    const o2 = await order(30_000, 'PK-OTHER1');
    const dupe = await credit(1_234, '629012345610');
    await expect(svc.alerts.link(dupe.alertId!, o.id, 'tester')).rejects.toThrow('already paid');
    expect((await svc.alerts.link(dupe.alertId!, o2.id, 'tester')).payment.utr).toBe('629012345610');
  });
});

describe('refunds (manual payout)', () => {
  async function paid() {
    const o = await order();
    const r = await credit(o.payable_paise, '629012345611');
    if (r.status !== 'MATCHED') throw new Error('setup');
    return r.paymentId;
  }
  const refund = (paymentId: string, amount: number, key: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/payments/${paymentId}/refund`,
      headers: { authorization: basicAuth(), 'content-type': 'application/json' },
      payload: { amount, speed: 'normal', notes: { idempotency_key: key, reason: 'LATE_PAYMENT_STOCKOUT' } },
    });

  it('records a pending refund idempotently and caps the total', async () => {
    const pay = await paid();
    const first = await refund(pay, 49_999, 'refund:p1:STOCKOUT');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ entity: 'refund', status: 'pending', amount: 49_999 });
    expect(first.json().notes.idempotency_key).toBe('refund:p1:STOCKOUT');
    const again = await refund(pay, 49_999, 'refund:p1:STOCKOUT');
    expect(again.json().id).toBe(first.json().id);
    expect((await refund(pay, 1, 'refund:p1:more')).statusCode).toBe(400);
    const list = await app.inject({
      method: 'GET',
      url: `/v1/payments/${pay}/refunds`,
      headers: { authorization: basicAuth() },
    });
    expect(list.json().count).toBe(1);
  });

  it('admin completes it with the payout UTR → refund.processed for the store, audited', async () => {
    const pay = await paid();
    const id = (await refund(pay, 49_999, 'refund:p2:X')).json().id;
    await svc.gateway.settleRefund(id, { status: 'processed', utr: '729012345612' }, 'tester');
    const events = await outbox();
    expect(events.at(-1)!.event).toBe('refund.processed');
    expect(JSON.parse(events.at(-1)!.body).payload.refund.entity).toMatchObject({
      id,
      payment_id: pay,
      status: 'processed',
    });
    await expect(svc.gateway.settleRefund(id, { status: 'failed', reason: 'x' }, 'tester')).rejects.toThrow(
      'already processed',
    );
  });
});

describe('outbox dispatcher', () => {
  let server: Server;
  let received: { headers: IncomingMessage['headers']; body: string }[];
  let status = 200;
  let url: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(status).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/webhooks/razorpay`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    received = [];
    status = 200;
  });

  it('delivers Razorpay-signed events once; failures are retried with backoff', async () => {
    const dispatcher = createDispatcher({ db, url, secret: WEBHOOK_SECRET, logger: silentLogger() });
    const o = await order();
    await credit(o.payable_paise, '629012345613');

    status = 503;
    expect(await dispatcher.tick()).toBe(1);
    const failed = await db.query(
      `SELECT attempts, next_attempt_at > NOW() AS later, delivered_at FROM upi_webhook_outbox`,
    );
    expect(failed.rows[0]).toMatchObject({ attempts: 1, later: true, delivered_at: null });
    expect(await dispatcher.tick()).toBe(0); // not due yet

    await db.query(`UPDATE upi_webhook_outbox SET next_attempt_at = NOW()`);
    status = 200;
    expect(await dispatcher.tick()).toBe(1);
    const last = received.at(-1)!;
    expect(last.headers['x-razorpay-signature']).toBe(hmacHex(WEBHOOK_SECRET, last.body));
    expect(last.headers['x-razorpay-event-id']).toMatch(/^evt_/);
    expect(JSON.parse(last.body).event).toBe('payment.captured');
    expect(await dispatcher.tick()).toBe(0); // delivered → never re-sent
  });
});
