import { createHmac, timingSafeEqual } from 'node:crypto';
import { withTimeout } from '../../utils/with-timeout';
import { digitsOnly, MessageError, type MessageProvider } from './provider';

/**
 * WhatsApp Cloud API (Meta Graph) template sends — POST /{version}/{phone-number-id}/messages.
 * Docs: developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates. Untested
 * against Meta until the business number + templates are approved (Phase 0, Q-06).
 */
export function createWhatsAppCloudProvider(cfg: {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}): MessageProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/${cfg.apiVersion ?? 'v21.0'}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
  return {
    channel: 'WHATSAPP',
    name: 'whatsapp-cloud',
    async sendTemplate({ to, template, language, variables, variableOrder }) {
      let res: Response;
      try {
        res = await withTimeout(
          doFetch(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: digitsOnly(to),
              type: 'template',
              template: {
                name: template,
                language: { code: language },
                components: variableOrder.length
                  ? [
                      {
                        type: 'body',
                        parameters: variableOrder.map((k) => ({ type: 'text', text: variables[k] ?? '' })),
                      },
                    ]
                  : [],
              },
            }),
          }),
          10_000,
          'whatsapp send',
        );
      } catch (err) {
        throw new MessageError((err as Error).message, true);
      }
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { code?: number; message?: string };
      };
      if (res.ok && json.messages?.[0]?.id) return { providerMessageId: json.messages[0].id };
      const code = json.error?.code;
      const msg = `whatsapp ${res.status}${code ? `/${code}` : ''}: ${json.error?.message?.slice(0, 200) ?? 'send failed'}`;
      // 131026 undeliverable (not on WhatsApp / old app); 131047 re-engagement window; 131056 pair rate limit
      if (code === 131026) throw new MessageError(msg, false, 'NOT_ON_CHANNEL');
      if (res.status >= 500 || res.status === 429 || code === 131056 || code === 130429 || code === 131000) {
        throw new MessageError(msg, true);
      }
      throw new MessageError(msg, false, 'REJECTED');
    },
  };
}

/** `X-Hub-Signature-256: sha256=<hex HMAC of the raw body with the app secret>`. */
export function verifyMetaSignature(appSecret: string, raw: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(raw).digest('hex'));
  const given = Buffer.from(header.slice('sha256='.length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const metaSignature = (appSecret: string, raw: Buffer | string) =>
  `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}`;
