import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Redis } from 'ioredis';
import { vi } from 'vitest';
import { buildApp, type AppDeps, type AuthConfig } from '../../src/app';
import type { Db } from '../../src/config/db';
import type { ErrorReporter } from '../../src/config/sentry';
import { MockOtpProvider } from '../../src/integrations/sms/otp-provider';
import { createLocalDiskStorage } from '../../src/integrations/storage/local-disk';
import type { StorefrontRevalidator } from '../../src/integrations/storefront/revalidate';
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

export const TEST_API_URL = 'http://localhost:4000';

/** Records every revalidate call so tests can assert the storefront cache tag was purged. */
export const spyRevalidator = (): StorefrontRevalidator & { revalidate: ReturnType<typeof vi.fn> } => ({
  revalidate: vi.fn(async () => undefined),
});

export const testStorage = () =>
  createLocalDiskStorage({
    dir: join(tmpdir(), `pk-test-uploads-${randomBytes(4).toString('hex')}`),
    apiBaseUrl: TEST_API_URL,
    secret: 'test-storage-secret',
  });

export async function buildTestApp(base: { db: Db; redis: Redis }, overrides: Partial<AppDeps> = {}) {
  return buildApp({
    logger: silentLogger(),
    reporter: fakeReporter(),
    origins: [TEST_ORIGIN],
    auth: testAuthConfig(),
    storage: testStorage(),
    revalidator: spyRevalidator(),
    ...base,
    ...overrides,
  });
}

/** Headers a browser on an allowed origin sends with a mutating request. */
export const fromBrowser = (extra: Record<string, string> = {}) => ({ origin: TEST_ORIGIN, ...extra });
