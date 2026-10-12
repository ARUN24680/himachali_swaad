import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';
import { createMsg91SmsProvider } from '../../src/integrations/messaging/msg91-sms';
import { MessageError } from '../../src/integrations/messaging/provider';
import {
  createWhatsAppCloudProvider,
  metaSignature,
  verifyMetaSignature,
} from '../../src/integrations/messaging/whatsapp-cloud';

/** Phase 8 §8.4: real provider clients against documented response shapes (injected fetch, no network). */
const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
const input = {
  to: '+919812345678',
  template: 'out_for_delivery',
  language: 'hi' as const,
  variables: { order_code: 'PK-7KQ2M9', track_url: 'https://x/track' },
  variableOrder: ['order_code', 'track_url'],
};

describe('WhatsApp Cloud API provider', () => {
  it('sends a template with positional body parameters to the digits-only number', async () => {
    let sent: { url: string; body: unknown; auth: string | null } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = {
        url,
        body: JSON.parse(String(init.body)),
        auth: (init.headers as Record<string, string>).authorization ?? null,
      };
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgM' }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const p = createWhatsAppCloudProvider({
      phoneNumberId: '1234567890',
      accessToken: 'EAAG-token-xxxxxxxxxxxx',
      fetchImpl,
    });
    await expect(p.sendTemplate(input)).resolves.toEqual({ providerMessageId: 'wamid.HBgM' });
    expect(sent!.url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(sent!.auth).toBe('Bearer EAAG-token-xxxxxxxxxxxx');
    expect(sent!.body).toEqual({
      messaging_product: 'whatsapp',
      to: '919812345678',
      type: 'template',
      template: {
        name: 'out_for_delivery',
        language: { code: 'hi' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'PK-7KQ2M9' },
              { type: 'text', text: 'https://x/track' },
            ],
          },
        ],
      },
    });
  });

  it('error mapping: 131026 = not on WhatsApp (permanent), 429 / 131056 / 5xx retryable, other 4xx rejected', async () => {
    const mk = (status: number, code?: number) =>
      createWhatsAppCloudProvider({
        phoneNumberId: '1',
        accessToken: 'EAAG-token-xxxxxxxxxxxx',
        fetchImpl: reply(status, { error: { code, message: 'x' } }),
      }).sendTemplate(input);
    await expect(mk(400, 131026)).rejects.toMatchObject({ retryable: false, reason: 'NOT_ON_CHANNEL' });
    await expect(mk(400, 131056)).rejects.toMatchObject({ retryable: true });
    await expect(mk(429, 130429)).rejects.toMatchObject({ retryable: true });
    await expect(mk(503)).rejects.toMatchObject({ retryable: true });
    await expect(mk(400, 132001)).rejects.toMatchObject({ retryable: false, reason: 'REJECTED' });
  });

  it('X-Hub-Signature-256 verification', () => {
    const raw = Buffer.from('{"entry":[]}');
    expect(verifyMetaSignature('app-secret', raw, metaSignature('app-secret', raw))).toBe(true);
    expect(verifyMetaSignature('app-secret', raw, metaSignature('other', raw))).toBe(false);
    expect(verifyMetaSignature('app-secret', raw, undefined)).toBe(false);
  });
});

describe('MSG91 Flow SMS provider', () => {
  it('posts the DLT flow with named variables; unknown template / errors classified', async () => {
    let body: unknown = null;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ type: 'success', message: '3263686b6c4b343838303235' }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = createMsg91SmsProvider({ authKey: 'k', templates: { out_for_delivery: 'flow-ofd' }, fetchImpl });
    await expect(p.sendTemplate(input)).resolves.toEqual({ providerMessageId: 'msg91.3263686b6c4b343838303235' });
    expect(body).toEqual({
      template_id: 'flow-ofd',
      short_url: '0',
      recipients: [{ mobiles: '919812345678', order_code: 'PK-7KQ2M9', track_url: 'https://x/track' }],
    });
    await expect(p.sendTemplate({ ...input, template: 'order_shipped' })).rejects.toBeInstanceOf(MessageError);
    const down = createMsg91SmsProvider({
      authKey: 'k',
      templates: { out_for_delivery: 'f' },
      fetchImpl: reply(502, {}),
    });
    await expect(down.sendTemplate(input)).rejects.toMatchObject({ retryable: true });
  });
});

describe('messaging env (Phase 8)', () => {
  const valid = {
    DATABASE_URL: 'postgres://pk:pw@localhost:5433/pahadi_khatki',
    REDIS_URL: 'redis://localhost:6380',
    APP_ORIGINS: 'http://localhost:3000',
    COOKIE_DOMAIN: 'localhost',
    JWT_SECRET: 'x'.repeat(32),
    TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  it('mock by default; cloud needs all four WhatsApp values; msg91 needs the flow map; admin phones are E.164', () => {
    const env = parseEnv(valid);
    expect([env.WHATSAPP_PROVIDER, env.SMS_PROVIDER, env.ADMIN_ALERT_PHONES]).toEqual(['mock', 'mock', []]);
    expect(() => parseEnv({ ...valid, WHATSAPP_PROVIDER: 'cloud' })).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
    expect(() => parseEnv({ ...valid, SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'k' })).toThrow(/MSG91_SMS_TEMPLATES/);
    expect(() => parseEnv({ ...valid, MSG91_SMS_TEMPLATES: 'not json' })).toThrow(/MSG91_SMS_TEMPLATES/);
    expect(parseEnv({ ...valid, ADMIN_ALERT_PHONES: '+919811100001, +919811100002' }).ADMIN_ALERT_PHONES).toHaveLength(
      2,
    );
    expect(() => parseEnv({ ...valid, ADMIN_ALERT_PHONES: '9811100001' })).toThrow(/ADMIN_ALERT_PHONES/);
  });
});
