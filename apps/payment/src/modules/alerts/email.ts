import { dkimVerify, type DNSResolver } from 'mailauth';
import { simpleParser } from 'mailparser';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AlertsService, IncomingAlert } from './alerts.service';
import { type CertLoader, type SnsMessage, SnsMessageSchema, isAwsSnsUrl, verifySnsMessage } from './sns';

/** SES receipt-rule SNS action payload (we only read these fields). */
const SesNotification = z.object({
  notificationType: z.literal('Received'),
  mail: z.object({ timestamp: z.string(), messageId: z.string() }),
  receipt: z.object({
    recipients: z.array(z.string()),
    action: z.object({ type: z.literal('SNS'), encoding: z.enum(['UTF8', 'BASE64']).optional() }),
  }),
  content: z.string(),
});

const MAX_RAW_BYTES = 200_000; // SNS caps at 256 KB; bank alerts are a few KB

const domainOf = (address: string | undefined) => address?.split('@').pop()?.toLowerCase() ?? '';
const inDomain = (domain: string, allowed: string) => domain === allowed || domain.endsWith(`.${allowed}`);

export type SnsResult = 'confirmed' | 'ignored' | 'processed';

/**
 * Channel 1: bank alert e-mail → (Gmail filter forward) → SES inbound → SNS → here.
 * Trust chain: SNS signature (it really came from our AWS topic) → our recipient address →
 * a DKIM signature that PASSES for an allowlisted bank domain AND aligns with the From domain.
 * SES's own verdicts are not used: after a Gmail forward they describe Gmail, not the bank.
 */
export function createEmailChannel(deps: {
  alerts: AlertsService;
  topicArn: string;
  recipient: string;
  bankDomains: string[];
  loadCert: CertLoader;
  logger: Logger;
  /** Tests inject DNS; production uses the system resolver. */
  resolver?: DNSResolver;
  fetchImpl?: typeof fetch;
}) {
  const doFetch = deps.fetchImpl ?? fetch;

  async function bankCheck(raw: Buffer): Promise<{ sender: string | null; text: string; reject: string | null }> {
    const parsed = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
    const from = parsed.from?.value[0]?.address;
    const fromDomain = domainOf(from);
    const text = `${parsed.subject ?? ''}\n${parsed.text ?? ''}`;

    const dkim = await dkimVerify(raw, { resolver: deps.resolver, rejectRsaSha1: true });
    // Signed by a bank domain AND aligned with the visible From — a valid bank signature on
    // someone else's From is not the bank
    const bankSig = dkim.results.find(
      (r) =>
        r.status.result === 'pass' &&
        deps.bankDomains.some((d) => inDomain((r.signingDomain ?? '').toLowerCase(), d) && inDomain(fromDomain, d)),
    );
    return { sender: from ?? null, text, reject: bankSig ? null : 'DKIM_NOT_BANK' };
  }

  async function handleNotification(m: SnsMessage): Promise<void> {
    const ses = SesNotification.parse(JSON.parse(m.Message));
    if (!ses.receipt.recipients.some((r) => r.toLowerCase() === deps.recipient.toLowerCase())) {
      throw new Error('mail not addressed to the alert recipient');
    }
    const raw = Buffer.from(ses.content, ses.receipt.action.encoding === 'BASE64' ? 'base64' : 'utf8');
    if (raw.length > MAX_RAW_BYTES) throw new Error('mail too large');

    const check = await bankCheck(raw);
    const alert: IncomingAlert = {
      source: 'EMAIL',
      externalId: `ses:${ses.mail.messageId}`,
      sender: check.sender,
      // SES receive time, not a date parsed out of the body
      creditedAt: new Date(ses.mail.timestamp),
      text: check.text,
      ...(check.reject ? { rejectReason: check.reject } : {}),
    };
    await deps.alerts.ingest(alert);
  }

  return {
    /** POST /v1/inbound/ses — body is the SNS JSON envelope (sent as text/plain). */
    async handle(body: unknown): Promise<SnsResult> {
      const m = SnsMessageSchema.parse(body);
      await verifySnsMessage(m, { topicArn: deps.topicArn, loadCert: deps.loadCert });
      if (m.Type === 'SubscriptionConfirmation') {
        // Confirm only our own topic's subscription, only via an AWS URL (no SSRF)
        if (!m.SubscribeURL || !isAwsSnsUrl(m.SubscribeURL)) throw new Error('untrusted SubscribeURL');
        const res = await doFetch(m.SubscribeURL, { signal: AbortSignal.timeout(5_000), redirect: 'error' });
        if (!res.ok) throw new Error(`subscription confirm ${res.status}`);
        deps.logger.info({ topic: m.TopicArn }, 'SNS subscription confirmed');
        return 'confirmed';
      }
      if (m.Type !== 'Notification') return 'ignored';
      await handleNotification(m);
      return 'processed';
    },
  };
}

export type EmailChannel = ReturnType<typeof createEmailChannel>;
