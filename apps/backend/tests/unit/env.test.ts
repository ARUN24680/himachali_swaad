import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgres://pk:pw@localhost:5433/pahadi_khatki',
  REDIS_URL: 'redis://localhost:6380',
  APP_ORIGINS: 'http://localhost:3000, http://localhost:5173',
  COOKIE_DOMAIN: 'localhost',
  JWT_SECRET: 'x'.repeat(32),
  TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('parseEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.PORT).toBe(4000);
    expect(env.PROCESS_NAME).toBe('pk-api');
    expect(env.APP_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.TRUST_PROXY).toBe(false);
  });

  it('fails with a readable message listing every missing variable', () => {
    const run = () => parseEnv({});
    expect(run).toThrow(EnvValidationError);
    try {
      run();
    } catch (err) {
      const message = (err as Error).message;
      for (const key of ['DATABASE_URL', 'REDIS_URL', 'APP_ORIGINS', 'COOKIE_DOMAIN', 'JWT_SECRET']) {
        expect(message).toContain(key);
      }
    }
  });

  it('rejects invalid values without echoing them', () => {
    const secret = 'too-short-secret';
    try {
      parseEnv({ ...valid, JWT_SECRET: secret, DATABASE_URL: 'mysql://nope', DB_POOL_MAX: '0' });
      expect.unreachable();
    } catch (err) {
      const e = err as EnvValidationError;
      expect(e.issues.some((i) => i.startsWith('JWT_SECRET'))).toBe(true);
      expect(e.issues.some((i) => i.startsWith('DATABASE_URL'))).toBe(true);
      expect(e.issues.some((i) => i.startsWith('DB_POOL_MAX'))).toBe(true);
      expect(e.message).not.toContain(secret);
    }
  });

  it('forbids the mock OTP provider in production and requires MSG91 credentials', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production', OTP_PROVIDER: 'mock' })).toThrow(/OTP_PROVIDER/);
    expect(() => parseEnv({ ...valid, OTP_PROVIDER: 'msg91' })).toThrow(/MSG91_AUTH_KEY/);
    expect(() => parseEnv({ ...valid, TOTP_ENC_KEY: 'c2hvcnQ=' })).toThrow(/TOTP_ENC_KEY/);
  });

  it('OTP_DEV_STAFF_BYPASS_PHONES: empty by default, E.164 only, refused in production', () => {
    expect(parseEnv(valid).OTP_DEV_STAFF_BYPASS_PHONES).toEqual([]);
    expect(
      parseEnv({ ...valid, OTP_DEV_STAFF_BYPASS_PHONES: ' +919000000101 , +919000000102' }).OTP_DEV_STAFF_BYPASS_PHONES,
    ).toEqual(['+919000000101', '+919000000102']);
    expect(() => parseEnv({ ...valid, OTP_DEV_STAFF_BYPASS_PHONES: '9000000101' })).toThrow(
      /OTP_DEV_STAFF_BYPASS_PHONES/,
    );
    const prod = {
      ...valid,
      NODE_ENV: 'production',
      OTP_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: 'k',
      MSG91_OTP_TEMPLATE_ID: 't',
    };
    const prodIssues = (extra: Record<string, string>) => {
      try {
        parseEnv({ ...prod, ...extra });
        return [];
      } catch (err) {
        return (err as EnvValidationError).issues;
      }
    };
    expect(
      prodIssues({ OTP_DEV_STAFF_BYPASS_PHONES: '+919000000101' }).some((i) =>
        i.startsWith('OTP_DEV_STAFF_BYPASS_PHONES'),
      ),
    ).toBe(true);
    expect(
      prodIssues({ OTP_DEV_STAFF_BYPASS_PHONES: '' }).some((i) => i.startsWith('OTP_DEV_STAFF_BYPASS_PHONES')),
    ).toBe(false);
  });

  it('DEFAULT_OTP: allows 6-digit OTP outside production, rejects invalid formats, and refuses in production', () => {
    expect(parseEnv({ ...valid, DEFAULT_OTP: '123456' }).DEFAULT_OTP).toBe('123456');
    expect(() => parseEnv({ ...valid, DEFAULT_OTP: '1234' })).toThrow(/DEFAULT_OTP/);
    expect(() => parseEnv({ ...valid, DEFAULT_OTP: 'abcdef' })).toThrow(/DEFAULT_OTP/);

    const prodIssues = (overrides: Record<string, string>) => {
      try {
        parseEnv({
          ...valid,
          NODE_ENV: 'production',
          OTP_PROVIDER: 'msg91',
          MSG91_AUTH_KEY: 'k',
          MSG91_OTP_TEMPLATE_ID: 't',
          STORAGE_DRIVER: 's3',
          AWS_REGION: 'ap-south-1',
          AWS_ACCESS_KEY_ID: 'k',
          AWS_SECRET_ACCESS_KEY: 's',
          AWS_S3_BUCKET_NAME: 'b',
          ...overrides,
        });
        return [];
      } catch (err) {
        return (err as EnvValidationError).issues;
      }
    };
    expect(prodIssues({ DEFAULT_OTP: '123456' }).some((i) => i.startsWith('DEFAULT_OTP'))).toBe(true);
  });

  it('treats an empty SENTRY_DSN as unset', () => {
    expect(parseEnv({ ...valid, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });
});

describe('parseEnv — storage & revalidation (Phase 3)', () => {
  it('defaults to local storage outside production and refuses it in production', () => {
    expect(parseEnv(valid).STORAGE_DRIVER).toBe('local');
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        OTP_PROVIDER: 'msg91',
        MSG91_AUTH_KEY: 'k',
        MSG91_OTP_TEMPLATE_ID: 't',
      }),
    ).toThrow(/STORAGE_DRIVER/);
  });

  it('requires every R2 variable for the r2 driver', () => {
    expect(() =>
      parseEnv({ ...valid, STORAGE_DRIVER: 'r2', R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com' }),
    ).toThrow(/R2_ENDPOINT/);
  });

  it('requires the revalidate URL and secret together', () => {
    expect(() => parseEnv({ ...valid, STOREFRONT_REVALIDATE_URL: 'http://localhost:3000/api/revalidate' })).toThrow(
      /REVALIDATE_SECRET/,
    );
  });
});
