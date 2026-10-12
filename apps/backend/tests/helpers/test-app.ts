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
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { createMockGateway, type MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import { createStaticDirectory } from '../../src/integrations/shipping/pincode-directory';
import type { JobName, JobPayloads, JobQueue } from '../../src/jobs/queues';
import type { StorefrontRevalidator } from '../../src/integrations/storefront/revalidate';
import { silentLogger } from './test-logger';
import { TEST_COURIER_TOKEN, unreachableShiprocket } from './shiprocket';
import { createWebPushSender } from '../../src/integrations/push/web-push';

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

export const testPrivateStorage = () =>
  createLocalPrivateStorage({
    dir: join(tmpdir(), `pk-test-private-${randomBytes(4).toString('hex')}`),
    apiBaseUrl: TEST_API_URL,
    secret: 'test-private-secret',
  });

export const testGateway = (redis: Redis): MockPaymentGateway =>
  createMockGateway({ redis, keySecret: 'test-key-secret', webhookSecret: 'test-webhook-secret' });

export interface RecordedJob {
  name: JobName;
  data: unknown;
  jobId: string | undefined;
}

/** JobQueue that records instead of enqueuing; `ids()` = distinct job ids (BullMQ dedups by id). */
export function recordingJobs(): JobQueue & { jobs: RecordedJob[]; ids: () => string[]; clear: () => void } {
  const jobs: RecordedJob[] = [];
  return {
    jobs,
    async add<N extends JobName>(name: N, data: JobPayloads[N], jobId?: string) {
      jobs.push({ name, data, jobId });
    },
    ids: () => [...new Set(jobs.map((j) => j.jobId ?? ''))],
    clear: () => {
      jobs.length = 0;
    },
  };
}

export const TEST_PINCODES = { '175101': { city: 'Kullu', state: 'Himachal Pradesh' } };

export async function buildTestApp(base: { db: Db; redis: Redis }, overrides: Partial<AppDeps> = {}) {
  return buildApp({
    privateStorage: testPrivateStorage(),
    gateway: testGateway(base.redis),
    jobs: recordingJobs(),
    pincodeDirectory: createStaticDirectory(TEST_PINCODES),
    mockWebhookDelayMs: 0,
    allowDraftInvoice: true,
    logger: silentLogger(),
    reporter: fakeReporter(),
    origins: [TEST_ORIGIN],
    auth: testAuthConfig(),
    storage: testStorage(),
    revalidator: spyRevalidator(),
    capi: { enabled: false, send: vi.fn(async () => undefined) },
    shiprocket: unreachableShiprocket(),
    courierWebhookToken: TEST_COURIER_TOKEN,
    push: createWebPushSender({}),
    ...base,
    ...overrides,
  });
}

/** Headers a browser on an allowed origin sends with a mutating request. */
export const fromBrowser = (extra: Record<string, string> = {}) => ({ origin: TEST_ORIGIN, ...extra });
