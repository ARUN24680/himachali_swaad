import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';

/** ADMIN 2FA (D-19). Secrets are AES-256-GCM encrypted at rest (users.totp_secret_enc). */
const ISSUER = 'Pahadi Khatki';

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totpFor(secretBase32: string, label: string) {
  return new TOTP({
    issuer: ISSUER,
    label,
    secret: Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
}

export const totpUrl = (secretBase32: string, label: string) => totpFor(secretBase32, label).toString();

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secretBase32: string, code: string): boolean {
  return totpFor(secretBase32, 'verify').validate({ token: code, window: 1 }) !== null;
}

/** Test helper / authenticator simulation. */
export const currentTotp = (secretBase32: string) => totpFor(secretBase32, 'gen').generate();

// Format: v1.<iv>.<tag>.<ciphertext> (base64url)
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(
    '.',
  );
}

export function decryptSecret(blob: string, key: Buffer): string {
  const [version, iv, tag, ct] = blob.split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported TOTP secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
