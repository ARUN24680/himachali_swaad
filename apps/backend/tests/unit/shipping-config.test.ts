import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgres://pk:pw@localhost:5433/pahadi_khatki',
  REDIS_URL: 'redis://localhost:6380',
  APP_ORIGINS: 'http://localhost:3000',
  COOKIE_DOMAIN: 'localhost',
  JWT_SECRET: 'x'.repeat(32),
  TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('shipping env (Phase 6)', () => {
  it('defaults to the sandbox outside production, refuses it in production', () => {
    const env = parseEnv(valid);
    expect(env.SHIPPING_PROVIDER).toBe('sandbox');
    expect(env.SHIPROCKET_API_URL).toBe('https://apiv2.shiprocket.in/v1/external/');
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/SHIPPING_PROVIDER/);
  });

  it('shiprocket needs the API user and a webhook token (≥ 24 chars)', () => {
    expect(() => parseEnv({ ...valid, SHIPPING_PROVIDER: 'shiprocket' })).toThrow(/SHIPROCKET_EMAIL/);
    expect(() =>
      parseEnv({
        ...valid,
        SHIPPING_PROVIDER: 'shiprocket',
        SHIPROCKET_EMAIL: 'api@pahadikhatki.in',
        SHIPROCKET_PASSWORD: 'secret-pass',
        SHIPROCKET_WEBHOOK_TOKEN: 'short',
      }),
    ).toThrow(/SHIPROCKET_WEBHOOK_TOKEN/);
    const env = parseEnv({
      ...valid,
      SHIPPING_PROVIDER: 'shiprocket',
      SHIPROCKET_EMAIL: 'api@pahadikhatki.in',
      SHIPROCKET_PASSWORD: 'secret-pass',
      SHIPROCKET_WEBHOOK_TOKEN: 't'.repeat(32),
    });
    expect(env.SHIPPING_PROVIDER).toBe('shiprocket');
  });
});
