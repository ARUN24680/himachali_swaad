import { X509Certificate, createVerify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

/** Fields of an SNS HTTP(S) message (https://docs.aws.amazon.com/sns/latest/dg/sns-message-and-json-formats.html). */
export const SnsMessageSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string().min(1).max(100),
  TopicArn: z.string(),
  Subject: z.string().optional(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string(),
  SigningCertURL: z.url(),
  SubscribeURL: z.url().optional(),
  Token: z.string().optional(),
});
export type SnsMessage = z.infer<typeof SnsMessageSchema>;

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;
/** SNS retries for up to an hour by default; older signed messages are treated as replays. */
const MAX_AGE_MS = 60 * 60_000;

/** Only AWS's own SNS hosts over https — an attacker-supplied cert URL must never be fetched. */
export function isAwsSnsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && SNS_HOST.test(u.hostname) && !u.port && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** The canonical string AWS signed, field order fixed by message type. */
export function stringToSign(m: SnsMessage): string {
  const keys =
    m.Type === 'Notification'
      ? (['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const)
      : (['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const);
  let out = '';
  for (const k of keys) {
    const v = m[k];
    if (v === undefined) continue; // Subject is optional
    out += `${k}\n${v}\n`;
  }
  return out;
}

export type CertLoader = (url: string) => Promise<KeyObject>;

/** Fetches + caches the signing certificate; checks it is an SNS certificate. */
export function createCertLoader(fetchImpl: typeof fetch = fetch): CertLoader {
  const cache = new Map<string, KeyObject>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit) return hit;
    if (!isAwsSnsUrl(url) || !new URL(url).pathname.endsWith('.pem')) throw new Error('untrusted SigningCertURL');
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5_000), redirect: 'error' });
    if (!res.ok) throw new Error(`cert fetch ${res.status}`);
    const cert = new X509Certificate(await res.text());
    if (!/CN=sns\.amazonaws\.com/i.test(cert.subject) || Date.parse(cert.validTo) < Date.now()) {
      throw new Error('not a valid SNS certificate');
    }
    cache.set(url, cert.publicKey);
    return cert.publicKey;
  };
}

/** Signature + topic + freshness. Throws on anything that is not a genuine message from our topic. */
export async function verifySnsMessage(
  m: SnsMessage,
  opts: { topicArn: string; loadCert: CertLoader; now?: () => number },
): Promise<void> {
  if (m.TopicArn !== opts.topicArn) throw new Error('unexpected TopicArn');
  // v1 = SHA-1; the topic is set to SignatureVersion=2 (docs/ops/direct-upi.md)
  if (m.SignatureVersion !== '2') throw new Error('SNS SignatureVersion 2 required');
  if (!isAwsSnsUrl(m.SigningCertURL)) throw new Error('untrusted SigningCertURL');
  const age = (opts.now?.() ?? Date.now()) - Date.parse(m.Timestamp);
  if (!Number.isFinite(age) || age > MAX_AGE_MS || age < -5 * 60_000) throw new Error('stale SNS message');
  const key = await opts.loadCert(m.SigningCertURL);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(stringToSign(m), 'utf8');
  if (!verifier.verify(key, m.Signature, 'base64')) throw new Error('bad SNS signature');
}
