import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { dkimSign } from 'mailauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../src/config/db';
import { createEmailChannel } from '../../src/modules/alerts/email';
import { observerSignature } from '../../src/modules/alerts/observer';
import { stringToSign, type SnsMessage } from '../../src/modules/alerts/sns';
import type { Services } from '../../src/services';
import { createTestApp, createTestDb, silentLogger, truncateAll } from '../helpers/test-env';

const TOPIC = 'arn:aws:sns:ap-south-1:123456789012:pk-upi-alerts';
const RECIPIENT = 'upi-alerts@in.example.in';
const sns = generateKeyPairSync('rsa', { modulusLength: 2048 });
const bankKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const evilKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const txt = (k: typeof bankKey) =>
  `v=DKIM1; k=rsa; p=${k.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`;
// Fake DNS: the bank publishes its key, the attacker publishes theirs for their own domain
const resolver = async (name: string, type: string) => {
  if (type !== 'TXT') return [];
  if (name === 's1._domainkey.hdfcbank.net') return [[txt(bankKey)]];
  if (name === 's1._domainkey.evil.example') return [[txt(evilKey)]];
  const err = new Error('ENOTFOUND') as Error & { code: string };
  err.code = 'ENOTFOUND';
  throw err;
};

let db: Db;
let destroy: () => Promise<void>;
let app: FastifyInstance;
let svc: Services;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  const base = await createTestApp(db);
  await base.app.close();
  const email = createEmailChannel({
    alerts: base.svc.alerts,
    topicArn: TOPIC,
    recipient: RECIPIENT,
    bankDomains: ['hdfcbank.net'],
    loadCert: async () => sns.publicKey,
    logger: silentLogger(),
    resolver,
  });
  ({ app, svc } = await createTestApp(db, undefined, { email }));
});
afterAll(async () => {
  await app.close();
  await destroy();
});
beforeEach(() => truncateAll(db));

async function bankMail(opts: { from: string; domain: string; key: typeof bankKey; body: string }) {
  const msg =
    `From: HDFC Bank InstaAlerts <${opts.from}>\r\nTo: owner@gmail.com\r\nSubject: You have received a credit\r\n` +
    `Date: ${new Date().toUTCString()}\r\nMessage-ID: <${randomBytes(6).toString('hex')}@bank>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${opts.body}\r\n`;
  const { signatures } = await dkimSign(msg, {
    signatureData: [
      {
        signingDomain: opts.domain,
        selector: 's1',
        privateKey: opts.key.privateKey.export({ type: 'pkcs1', format: 'pem' }),
      },
    ],
  });
  return signatures + msg;
}

function snsEnvelope(raw: string, over: { recipients?: string[]; topic?: string } = {}) {
  const message = JSON.stringify({
    notificationType: 'Received',
    mail: { timestamp: new Date().toISOString(), messageId: randomBytes(8).toString('hex') },
    receipt: { recipients: over.recipients ?? [RECIPIENT], action: { type: 'SNS', encoding: 'BASE64' } },
    content: Buffer.from(raw).toString('base64'),
  });
  const m: SnsMessage = {
    Type: 'Notification',
    MessageId: randomBytes(8).toString('hex'),
    TopicArn: over.topic ?? TOPIC,
    Message: message,
    Timestamp: new Date().toISOString(),
    SignatureVersion: '2',
    Signature: '',
    SigningCertURL: 'https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-x.pem',
  };
  const s = createSign('RSA-SHA256');
  s.update(stringToSign(m));
  return { ...m, Signature: s.sign(sns.privateKey, 'base64') };
}

const postSns = (body: unknown) =>
  app.inject({
    method: 'POST',
    url: '/v1/inbound/ses',
    headers: { 'content-type': 'text/plain; charset=UTF-8' },
    payload: JSON.stringify(body),
  });
const alertRows = async () =>
  (
    await db.query<{ status: string; reason: string | null; source: string }>(
      `SELECT status, reason, source FROM upi_credit_alerts`,
    )
  ).rows;

describe('e-mail channel (SES → SNS)', () => {
  it('a DKIM-valid bank alert for the exact amount confirms the order', async () => {
    const o = await svc.gateway.createOrder({ amountPaise: 49_999, receipt: 'PK-7KQ2M9', notes: {} });
    const rupees = `${Math.floor(o.payable_paise / 100)}.${String(o.payable_paise % 100).padStart(2, '0')}`;
    const raw = await bankMail({
      from: 'alerts@hdfcbank.net',
      domain: 'hdfcbank.net',
      key: bankKey,
      body: `Dear Customer, Rs.${rupees} has been credited to your account **1234 by VPA buyer@okicici on 17-10-26. Your UPI transaction reference number is 629012345678.`,
    });
    const res = await postSns(snsEnvelope(raw));
    expect(res.statusCode).toBe(200);
    expect(await alertRows()).toEqual([{ status: 'MATCHED', reason: null, source: 'EMAIL' }]);
    expect((await svc.gateway.getOrder(o.id)).status).toBe('paid');
  });

  it('a forged "bank" mail signed by another domain is REJECTED, even with a matching amount', async () => {
    const o = await svc.gateway.createOrder({ amountPaise: 49_999, receipt: 'PK-7KQ2M9', notes: {} });
    const rupees = `${Math.floor(o.payable_paise / 100)}.${String(o.payable_paise % 100).padStart(2, '0')}`;
    const raw = await bankMail({
      from: 'alerts@hdfcbank.net',
      domain: 'evil.example',
      key: evilKey,
      body: `Rs.${rupees} credited to your account. UPI Ref No 629012345679.`,
    });
    expect((await postSns(snsEnvelope(raw))).statusCode).toBe(200);
    expect(await alertRows()).toEqual([{ status: 'REJECTED', reason: 'DKIM_NOT_BANK', source: 'EMAIL' }]);
    expect((await svc.gateway.getOrder(o.id)).status).toBe('created');
  });

  it('a mail whose body was altered after the bank signed it is REJECTED', async () => {
    const raw = (
      await bankMail({
        from: 'alerts@hdfcbank.net',
        domain: 'hdfcbank.net',
        key: bankKey,
        body: 'Rs.100.00 credited. UPI Ref No 629012345680.',
      })
    ).replace('100.00', '999.00');
    await postSns(snsEnvelope(raw));
    expect((await alertRows())[0]).toMatchObject({ status: 'REJECTED', reason: 'DKIM_NOT_BANK' });
  });

  it('wrong topic, wrong recipient or a bad SNS signature → 400 and nothing stored', async () => {
    const raw = await bankMail({
      from: 'alerts@hdfcbank.net',
      domain: 'hdfcbank.net',
      key: bankKey,
      body: 'Rs.1.00 credited. UPI Ref No 629012345681.',
    });
    expect((await postSns(snsEnvelope(raw, { topic: `${TOPIC}x` }))).statusCode).toBe(400);
    expect((await postSns(snsEnvelope(raw, { recipients: ['someone@else.in'] }))).statusCode).toBe(400);
    const tampered = { ...snsEnvelope(raw), MessageId: 'changed' };
    expect((await postSns(tampered)).statusCode).toBe(400);
    expect(await alertRows()).toEqual([]);
  });
});

describe('Android observer channel', () => {
  async function device() {
    return svc.observer!.enroll('Shop phone', 'tester');
  }
  const send = (
    d: { deviceId: string; secret: string },
    body: object | string,
    over: { ts?: string; nonce?: string; sig?: string; path?: string } = {},
  ) => {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const ts = over.ts ?? String(Date.now());
    const nonce = over.nonce ?? randomBytes(16).toString('hex');
    return app.inject({
      method: 'POST',
      url: over.path ?? '/v1/observer/alerts',
      headers: {
        'content-type': 'application/json',
        'x-device-id': d.deviceId,
        'x-timestamp': ts,
        'x-nonce': nonce,
        'x-signature': over.sig ?? observerSignature(d.secret, ts, nonce, raw),
      },
      payload: raw,
    });
  };

  it('a signed SMS from an allowlisted bank sender confirms the order; the phone learns nothing else', async () => {
    const d = await device();
    const o = await svc.gateway.createOrder({ amountPaise: 30_000, receipt: 'PK-7KQ2M9', notes: {} });
    const rupees = `${Math.floor(o.payable_paise / 100)}.${String(o.payable_paise % 100).padStart(2, '0')}`;
    const res = await send(d, {
      sender: 'AD-HDFCBK',
      text: `Money Received - INR ${rupees} in your HDFC Bank A/c xx1234 from abc@ybl UPI Ref:629012345690`,
      receivedAt: Date.now(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ received: true, status: 'MATCHED' });
    expect((await svc.gateway.getOrder(o.id)).status).toBe('paid');
  });

  it('tampered body, stale timestamp, replayed nonce, unknown or revoked device → 401', async () => {
    const d = await device();
    const body = { sender: 'AD-HDFCBK', text: 'Rs 100 credited UPI Ref 629012345691', receivedAt: Date.now() };
    const ts = String(Date.now());
    const nonce = randomBytes(16).toString('hex');
    const sig = observerSignature(d.secret, ts, nonce, JSON.stringify(body));

    expect(
      (await send(d, { ...body, text: 'Rs 999 credited UPI Ref 629012345691' }, { ts, nonce, sig })).statusCode,
    ).toBe(401);
    const old = String(Date.now() - 10 * 60_000);
    expect((await send(d, body, { ts: old })).statusCode).toBe(401);
    expect((await send(d, body, { ts, nonce, sig })).statusCode).toBe(200);
    expect((await send(d, body, { ts, nonce, sig })).statusCode).toBe(401); // replay
    expect((await send({ deviceId: '00000000-0000-4000-8000-000000000000', secret: d.secret }, body)).statusCode).toBe(
      401,
    );
    await svc.observer!.revoke(d.deviceId, 'tester');
    expect((await send(d, body)).statusCode).toBe(401);
  });

  it('a sender outside the allowlist is stored as REJECTED, never matched', async () => {
    const d = await device();
    const o = await svc.gateway.createOrder({ amountPaise: 30_000, receipt: 'PK-7KQ2M9', notes: {} });
    const rupees = `${Math.floor(o.payable_paise / 100)}.${String(o.payable_paise % 100).padStart(2, '0')}`;
    for (const sender of ['+919876543210', 'AD-HDFCBKX', 'HDFCBK-FAKE']) {
      await send(d, {
        sender,
        text: `INR ${rupees} credited to a/c UPI Ref:62901234569${sender.length % 10}`,
        receivedAt: Date.now(),
      });
    }
    expect((await alertRows()).every((a) => a.status === 'REJECTED' && a.reason === 'SENDER_NOT_ALLOWED')).toBe(true);
    expect((await svc.gateway.getOrder(o.id)).status).toBe('created');
  });

  it('heartbeat updates last_seen_at and needs a signature too', async () => {
    const d = await device();
    expect((await send(d, '', { path: '/v1/observer/heartbeat' })).statusCode).toBe(200);
    expect((await send(d, '', { path: '/v1/observer/heartbeat', sig: 'f'.repeat(64) })).statusCode).toBe(401);
    const row = await db.query(`SELECT last_seen_at FROM upi_observer_devices WHERE id = $1`, [d.deviceId]);
    expect(row.rows[0]!.last_seen_at).not.toBeNull();
  });

  it('device secrets are stored encrypted, never in clear', async () => {
    const d = await device();
    const row = await db.query<{ secret_ciphertext: string }>(`SELECT secret_ciphertext FROM upi_observer_devices`);
    expect(row.rows[0]!.secret_ciphertext).not.toContain(d.secret);
  });
});
