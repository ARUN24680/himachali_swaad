import { withTimeout } from '../../utils/with-timeout';
import { digitsOnly, MessageError, type MessageProvider } from './provider';

/**
 * MSG91 Flow API SMS (TRAI DLT) — POST https://control.msg91.com/api/v5/flow, header `authkey`.
 * Each template maps to a DLT-approved flow id (env MSG91_SMS_TEMPLATES); flow variables use the
 * registry's variable names. Untested against MSG91 until DLT approval (Phase 0).
 */
export function createMsg91SmsProvider(cfg: {
  authKey: string;
  templates: Record<string, string>;
  fetchImpl?: typeof fetch;
}): MessageProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    channel: 'SMS',
    name: 'msg91',
    async sendTemplate({ to, template, variables }) {
      const flowId = cfg.templates[template];
      if (!flowId) throw new MessageError(`no DLT flow configured for ${template}`, false, 'REJECTED');
      let res: Response;
      try {
        res = await withTimeout(
          doFetch('https://control.msg91.com/api/v5/flow', {
            method: 'POST',
            headers: { authkey: cfg.authKey, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              template_id: flowId,
              short_url: '0',
              recipients: [{ mobiles: digitsOnly(to), ...variables }],
            }),
          }),
          10_000,
          'msg91 send',
        );
      } catch (err) {
        throw new MessageError((err as Error).message, true);
      }
      const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (res.ok && json.type === 'success' && json.message) return { providerMessageId: `msg91.${json.message}` };
      const msg = `msg91 ${res.status}: ${json.message?.slice(0, 200) ?? 'send failed'}`;
      throw new MessageError(msg, res.status >= 500 || res.status === 429);
    },
  };
}
