import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';
import { hmacHex, paymentSignature } from '../../src/integrations/razorpay/gateway';
import { createRazorpayGateway } from '../../src/integrations/razorpay/razorpay';

const valid = {
  DATABASE_URL: 'postgres://pk:pw@localhost:5433/pahadi_khatki',
  REDIS_URL: 'redis://localhost:6380',
  APP_ORIGINS: 'http://localhost:3000',
  COOKIE_DOMAIN: 'localhost',
  JWT_SECRET: 'x'.repeat(32),
  TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const rzp = {
  RAZORPAY_KEY_ID: 'rzp_test_abc123',
  RAZORPAY_KEY_SECRET: 'key-secret-1',
  RAZORPAY_WEBHOOK_SECRET: 'hook-secret-1',
};

describe('payment env (Phase 5)', () => {
  it('defaults to the mock gateway outside production, refuses it in production', () => {
    expect(parseEnv(valid).PAYMENT_GATEWAY).toBe('mock');
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        OTP_PROVIDER: 'msg91',
        MSG91_AUTH_KEY: 'k',
        MSG91_OTP_TEMPLATE_ID: 't',
      }),
    ).toThrow(/PAYMENT_GATEWAY/);
  });
  it('razorpay needs all three secrets, and the webhook secret must differ', () => {
    expect(() => parseEnv({ ...valid, PAYMENT_GATEWAY: 'razorpay' })).toThrow(/RAZORPAY_KEY_ID/);
    expect(parseEnv({ ...valid, PAYMENT_GATEWAY: 'razorpay', ...rzp }).RAZORPAY_KEY_ID).toBe('rzp_test_abc123');
    expect(() =>
      parseEnv({ ...valid, PAYMENT_GATEWAY: 'razorpay', ...rzp, RAZORPAY_WEBHOOK_SECRET: rzp.RAZORPAY_KEY_SECRET }),
    ).toThrow(/webhook secret must differ/);
  });
  it('r2 storage needs a private bucket for invoices', () => {
    const r2 = {
      STORAGE_DRIVER: 'r2',
      R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'a',
      R2_SECRET_ACCESS_KEY: 'b',
      R2_PUBLIC_BUCKET: 'pub',
      R2_PUBLIC_BASE_URL: 'https://img.example.com',
    };
    expect(() => parseEnv({ ...valid, ...r2 })).toThrow(/R2_PRIVATE_BUCKET/);
    expect(parseEnv({ ...valid, ...r2, R2_PRIVATE_BUCKET: 'priv' }).R2_PRIVATE_BUCKET).toBe('priv');
  });
});

describe('Razorpay signatures', () => {
  const gw = createRazorpayGateway({ keyId: 'rzp_test_x', keySecret: 'key-secret', webhookSecret: 'hook-secret' });
  it('checkout signature = HMAC_SHA256(order_id|payment_id, key secret)', () => {
    const sig = paymentSignature('key-secret', 'order_1', 'pay_1');
    expect(sig).toBe(hmacHex('key-secret', 'order_1|pay_1'));
    expect(gw.verifyPaymentSignature('order_1', 'pay_1', sig)).toBe(true);
    expect(gw.verifyPaymentSignature('order_1', 'pay_2', sig)).toBe(false);
    expect(gw.verifyPaymentSignature('order_1', 'pay_1', sig.slice(0, 10))).toBe(false);
  });
  it('webhook signature uses the webhook secret over the raw bytes', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    expect(gw.verifyWebhookSignature(body, hmacHex('hook-secret', body))).toBe(true);
    expect(gw.verifyWebhookSignature(body, hmacHex('key-secret', body))).toBe(false);
    expect(gw.verifyWebhookSignature(Buffer.from('{"event": "payment.captured"}'), hmacHex('hook-secret', body))).toBe(
      false,
    );
  });
  it('API errors never echo secrets', async () => {
    const failing = createRazorpayGateway({
      keyId: 'rzp_test_x',
      keySecret: 'super-secret-value',
      webhookSecret: 'w',
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'bad' } }), { status: 400 }),
    });
    await expect(failing.createOrder({ amountPaise: 100, receipt: 'r', notes: {} })).rejects.toThrow(
      /razorpay 400: bad/,
    );
    await failing.createOrder({ amountPaise: 100, receipt: 'r', notes: {} }).catch((e: Error) => {
      expect(e.message).not.toContain('super-secret-value');
    });
  });
});
