import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgres://pk:pw@localhost:5433/pahadi_khatki',
  REDIS_URL: 'redis://localhost:6380',
  APP_ORIGINS: 'http://localhost:3000, http://localhost:5173',
  COOKIE_DOMAIN: 'localhost',
  JWT_SECRET: 'x'.repeat(32),
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

  it('treats an empty SENTRY_DSN as unset', () => {
    expect(parseEnv({ ...valid, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });
});
