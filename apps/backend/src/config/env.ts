import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PROCESS_NAME: z.string().min(1).default('pk-api'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  SLOW_QUERY_MS: z.coerce.number().int().min(1).default(200),

  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  APP_ORIGINS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  COOKIE_DOMAIN: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** base64 of 32 random bytes — AES-256-GCM key for ADMIN TOTP secrets. `openssl rand -base64 32` */
  TOTP_ENC_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'must be base64 of exactly 32 bytes (openssl rand -base64 32)',
    ),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  OTP_PROVIDER: z.enum(['mock', 'msg91']).default('mock'),
  MSG91_AUTH_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  MSG91_OTP_TEMPLATE_ID: z.preprocess(emptyToUndefined, z.string().optional()),

  /** Public base URL of this API (local image uploads, links in messages). */
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  /** Product images (D-11): `local` = dev/test disk stand-in, `r2` = Cloudflare R2 public bucket. */
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_UPLOADS_DIR: z.string().min(1).default('.uploads'),
  R2_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  R2_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_PUBLIC_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** CDN / custom domain serving the public bucket, e.g. https://img.pahadikhatki.in */
  R2_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /** Storefront on-demand revalidation (POST /api/revalidate). Unset → product edits wait for cache expiry. */
  STOREFRONT_REVALIDATE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  REVALIDATE_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),

  /** Meta Conversions API (Phase 4 §4.8). Unset → relay disabled. */
  META_PIXEL_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
  META_CAPI_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  META_CAPI_TEST_EVENT_CODE: z.preprocess(emptyToUndefined, z.string().optional()),

  SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
});

const EnvSchemaChecked = EnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.OTP_PROVIDER === 'mock') {
    ctx.addIssue({ code: 'custom', path: ['OTP_PROVIDER'], message: 'mock OTP provider is not allowed in production' });
  }
  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
    ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'local storage is not allowed in production' });
  }
  if (
    env.STORAGE_DRIVER === 'r2' &&
    (!env.R2_ENDPOINT ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_PUBLIC_BUCKET ||
      !env.R2_PUBLIC_BASE_URL)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['R2_ENDPOINT'],
      message:
        'R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET and R2_PUBLIC_BASE_URL are required for r2',
    });
  }
  if (Boolean(env.STOREFRONT_REVALIDATE_URL) !== Boolean(env.REVALIDATE_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['REVALIDATE_SECRET'],
      message: 'set STOREFRONT_REVALIDATE_URL and REVALIDATE_SECRET together',
    });
  }
  if (env.OTP_PROVIDER === 'msg91' && (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID)) {
    ctx.addIssue({
      code: 'custom',
      path: ['MSG91_AUTH_KEY'],
      message: 'MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required for msg91',
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Parses and validates env vars. Throws EnvValidationError listing every bad/missing var. Values are never echoed. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchemaChecked.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new EnvValidationError(issues);
  }
  return result.data;
}

/** Boot-time loader: prints a readable error and exits instead of starting with bad config. */
export function loadEnvOrExit(source: Record<string, string | undefined> = process.env): Env {
  try {
    return parseEnv(source);
  } catch (err) {
    if (err instanceof EnvValidationError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
