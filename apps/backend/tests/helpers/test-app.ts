import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { vi } from 'vitest';
import { buildApp, type AppDeps, type AuthConfig } from '../../src/app';
import type { Db } from '../../src/config/db';
import type { ErrorReporter } from '../../src/config/sentry';
import { MockOtpProvider } from '../../src/integrations/sms/otp-provider';
import { silentLogger } from './test-logger';

export const TEST_ORIGIN = 'http://localhost:3000';
export const TEST_JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';

export const fakeReporter = (): ErrorReporter & { capture: ReturnType<typeof vi.fn> } => ({
  capture: vi.fn(() => 'evt_test_123'),
});

export function testAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig & { otpProvider: MockOtpProvider } {
  return {
    jwtSecret: TEST_JWT_SECRET,
    totpKey: randomBytes(32),
    otpProvider: new MockOtpProvider(),
    cookies: { secure: false, accessTtlSec: 900, refreshTtlSec: 30 * 24 * 3600 },
    ...overrides,
  } as AuthConfig & { otpProvider: MockOtpProvider };
}

export async function buildTestApp(base: { db: Db; redis: Redis }, overrides: Partial<AppDeps> = {}) {
  return buildApp({
    logger: silentLogger(),
    reporter: fakeReporter(),
    origins: [TEST_ORIGIN],
    auth: testAuthConfig(),
    ...base,
    ...overrides,
  });
}

/** Headers a browser on an allowed origin sends with a mutating request. */
export const fromBrowser = (extra: Record<string, string> = {}) => ({ origin: TEST_ORIGIN, ...extra });
