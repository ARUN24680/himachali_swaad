import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type EnvValidationError, parseEnv } from '../../src/config/env';
import { decryptSecret, encryptSecret, randomId, safeEqual } from '../../src/lib/crypto';

const base = {
  PAYMENT_DATABASE_URL: 'postgres://u:p@db:5432/pk_payment',
  PAYMENT_API_KEY_ID: 'upi_live_abcdefgh12',
  PAYMENT_API_KEY_SECRET: 'k'.repeat(40),
  PAYMENT_WEBHOOK_SECRET: 'w'.repeat(40),
  PAYMENT_WEBHOOK_URL: 'https://api.example.in/api/v1/webhooks/razorpay',
  PAYMENT_PUBLIC_URL: 'https://pay.example.in',
  PAYMENT_STOREFRONT_URL: 'https://example.in',
  UPI_VPA: 'shop@hdfcbank',
  UPI_PAYEE_NAME: 'Pahadi Khatki',
  PAYMENT_DB_SSL: 'true',
  UPI_DEVICE_KEK: randomBytes(32).toString('base64'),
  UPI_BANK_SMS_SENDERS: 'HDFCBK',
};
const issues = (src: Record<string, string>) => {
  try {
    parseEnv(src);
    return [];
  } catch (e) {
    return (e as EnvValidationError).issues;
  }
};

describe('env (production refusals)', () => {
  it('a complete production config passes', () => {
    expect(issues({ ...base, NODE_ENV: 'production' })).toEqual([]);
  });
  it('refuses dev tools, test keys, http URLs, no DB TLS and no alert channel in production', () => {
    const got = issues({
      ...base,
      NODE_ENV: 'production',
      PAYMENT_DEV_TOOLS: 'true',
      PAYMENT_API_KEY_ID: 'upi_test_abcdefgh12',
      PAYMENT_PUBLIC_URL: 'http://pay.example.in',
      PAYMENT_DB_SSL: 'false',
      UPI_DEVICE_KEK: '',
    }).join('\n');
    for (const k of [
      'PAYMENT_DEV_TOOLS',
      'PAYMENT_API_KEY_ID',
      'PAYMENT_PUBLIC_URL',
      'PAYMENT_DB_SSL',
      'UPI_ALERT_SNS_TOPIC_ARN',
    ]) {
      expect(got).toContain(k);
    }
  });
  it('the webhook secret must differ from the key secret', () => {
    expect(issues({ ...base, PAYMENT_WEBHOOK_SECRET: base.PAYMENT_API_KEY_SECRET }).join()).toContain(
      'PAYMENT_WEBHOOK_SECRET',
    );
  });
  it('rejects a VPA that is not name@bank', () => {
    expect(issues({ ...base, UPI_VPA: 'not a vpa' }).join()).toContain('UPI_VPA');
  });
});

describe('crypto', () => {
  it('device secrets round-trip through AES-256-GCM and fail with another key', () => {
    const kek = randomBytes(32);
    const enc = encryptSecret(kek, 'device-secret');
    expect(decryptSecret(kek, enc)).toBe('device-secret');
    expect(() => decryptSecret(randomBytes(32), enc)).toThrow();
  });
  it('ids are prefixed and unguessable-length', () => {
    expect(randomId('order')).toMatch(/^order_[A-Za-z0-9]{16}$/);
    expect(new Set(Array.from({ length: 1000 }, () => randomId('pay'))).size).toBe(1000);
  });
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', undefined)).toBe(false);
  });
});
