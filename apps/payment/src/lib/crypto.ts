import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** `order_` + 16 base62 chars ≈ 95 bits — the order id is in the public pay URL, so it must be unguessable. */
export function randomId(prefix: 'order' | 'pay' | 'rfnd' | 'evt', length = 16): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 62]; // 256 % 62 bias is negligible for ids
  return `${prefix}_${out}`;
}

export const hmacHex = (secret: string | Buffer, data: string | Buffer) =>
  createHmac('sha256', secret).update(data).digest('hex');

/** Constant-time compare of any two strings (hashing first hides the length). */
export function safeEqual(expected: string, given: string | undefined | null): boolean {
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

/** AES-256-GCM: base64(iv | tag | ciphertext). For device secrets at rest. */
export function encryptSecret(kek: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptSecret(kek: Buffer, encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', kek, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
