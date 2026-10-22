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
  /**
   * D-19 / Phase 10: ADMIN must have TOTP enrolled to use the admin API. Always on in production;
   * dev/test default off so seeded admins work without an authenticator.
   */
  ADMIN_TOTP_REQUIRED: z.enum(['true', 'false']).optional(),
  /**
   * Dev-only (D-57 note): comma-separated E.164 phones of STAFF users allowed to sign in through the
   * customer phone-OTP flow, for local storefront testing. The OTP itself is still verified. Refused
   * in production.
   */
  OTP_DEV_STAFF_BYPASS_PHONES: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^\+91[6-9]\d{9}$/, 'E.164 Indian mobile'))),
  MSG91_AUTH_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  MSG91_OTP_TEMPLATE_ID: z.preprocess(emptyToUndefined, z.string().optional()),

  /** Public base URL of this API (local image uploads, links in messages). */
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  /** Container-to-container API address for the shipping sandbox; never sent to browsers. */
  API_INTERNAL_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /**
   * File storage (D-11, D-58): `local` = dev/test disk stand-in, `s3` = AWS S3 (one bucket: public
   * `products/…` images + `private/…` documents), `r2` = Cloudflare R2 (two buckets).
   */
  STORAGE_DRIVER: z.enum(['local', 's3', 'r2']).default('local'),
  LOCAL_UPLOADS_DIR: z.string().min(1).default('.uploads'),
  R2_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  R2_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_PUBLIC_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** CDN / custom domain serving the public bucket, e.g. https://img.pahadikhatki.in */
  R2_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /** PRIVATE bucket for invoices / labels (D-11) — readers get 5-min signed URLs. */
  R2_PRIVATE_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
  LOCAL_PRIVATE_UPLOADS_DIR: z.string().min(1).default('.uploads-private'),
  /** AWS S3 (STORAGE_DRIVER=s3, D-58). The IAM user needs s3:PutObject / GetObject on the bucket. */
  AWS_REGION: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[a-z]{2}(-[a-z]+)+-\d$/, 'e.g. ap-south-1')
      .optional(),
  ),
  AWS_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  AWS_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  AWS_S3_BUCKET_NAME: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9.-]{1,61}[A-Za-z0-9]$/, 'not a valid S3 bucket name')
      .optional(),
  ),
  /** CDN in front of the bucket (CloudFront / custom domain). Empty = the bucket's own S3 URL. */
  AWS_S3_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),

  /** create-order calls per IP per 10 min (architecture/02 §9 = 10). Raised only for CI e2e, never above 100. */
  CHECKOUT_IP_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * Payments (Phase 5): `mock` = dev/CI stand-in (refused in production), `razorpay` = real API,
   * `direct_upi` = our own apps/payment service (D-59; same API, customer goes to its pay page).
   */
  PAYMENT_GATEWAY: z.enum(['mock', 'razorpay', 'direct_upi']).default('mock'),
  RAZORPAY_KEY_ID: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^rzp_(test|live)_\w+$/)
      .optional(),
  ),
  RAZORPAY_KEY_SECRET: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  /** Separate from the key secret (Razorpay dashboard → Webhooks). */
  RAZORPAY_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  /** Direct UPI service REST base, server-to-server (e.g. https://pay.pahadikhatki.in/v1). */
  DIRECT_UPI_API_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /** Where customers are sent to pay (e.g. https://pay.pahadikhatki.in). */
  DIRECT_UPI_PUBLIC_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /** = the service's PAYMENT_API_KEY_ID / PAYMENT_API_KEY_SECRET / PAYMENT_WEBHOOK_SECRET. */
  DIRECT_UPI_KEY_ID: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^upi_(test|live)_[A-Za-z0-9]{8,}$/)
      .optional(),
  ),
  DIRECT_UPI_KEY_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  DIRECT_UPI_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),

  /**
   * Logistics (Phase 6): `sandbox` = in-API Shiprocket stand-in at /api/v1/dev/shiprocket (dev/CI,
   * refused in production), `shiprocket` = the real API with an API user (Settings → API).
   */
  SHIPPING_PROVIDER: z.enum(['sandbox', 'shiprocket']).default('sandbox'),
  SHIPROCKET_API_URL: z.url().default('https://apiv2.shiprocket.in/v1/external/'),
  SHIPROCKET_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
  SHIPROCKET_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(6).optional()),
  /** Security token set on the Shiprocket webhook (sent back as `x-api-key`). */
  SHIPROCKET_WEBHOOK_TOKEN: z.preprocess(emptyToUndefined, z.string().min(24).optional()),
  /**
   * Web Push for the partner PWA (Phase 7, D-16) — `npx web-push generate-vapid-keys`. Unset →
   * push disabled, partner alerts fall back to WhatsApp. Subject = mailto: or https: contact.
   */
  VAPID_PUBLIC_KEY: z.preprocess(emptyToUndefined, z.string().min(40).optional()),
  VAPID_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(20).optional()),
  VAPID_SUBJECT: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^(mailto:|https:\/\/)/)
      .optional(),
  ),
  /**
   * Customer / staff messages (Phase 8, D-38): `mock` = Redis outbox + /api/v1/dev/messages (dev/CI,
   * refused in production). `cloud` = WhatsApp Cloud API; `msg91` = MSG91 Flow SMS (TRAI DLT).
   */
  WHATSAPP_PROVIDER: z.enum(['mock', 'cloud']).default('mock'),
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
  WHATSAPP_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(20).optional()),
  /** Meta app secret — verifies X-Hub-Signature-256 on /webhooks/whatsapp. */
  WHATSAPP_APP_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  /** Our token for Meta's GET verification challenge. */
  WHATSAPP_VERIFY_TOKEN: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  WHATSAPP_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v21.0'),
  SMS_PROVIDER: z.enum(['mock', 'msg91']).default('mock'),
  /** JSON { "<template>": "<MSG91 flow id>" } for the critical templates (DLT approved). */
  MSG91_SMS_TEMPLATES: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform((v, ctx) => {
        try {
          return z.record(z.string(), z.string().min(1)).parse(JSON.parse(v));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'must be a JSON object of template → flow id' });
          return z.NEVER;
        }
      })
      .optional(),
  ),
  /** Admin alert recipients (comma-separated E.164) + e-mail fallback (Phase 8 §8.6). */
  ADMIN_ALERT_PHONES: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^\+91[6-9]\d{9}$/, 'E.164 Indian mobile'))),
  ADMIN_ALERT_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
  /** Public storefront origin used in message links (/track?code=…). */
  STOREFRONT_PUBLIC_URL: z.url().default('http://localhost:3000'),
  /** Language of customer messages until the checkout records a preference. */
  CUSTOMER_MESSAGE_LANGUAGE: z.enum(['en', 'hi']).default('en'),
  /** BullMQ concurrency for the orders/documents/payments/notify queues (cron stays 1). */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),

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
  if (env.NODE_ENV === 'production' && env.ADMIN_TOTP_REQUIRED === 'false') {
    ctx.addIssue({
      code: 'custom',
      path: ['ADMIN_TOTP_REQUIRED'],
      message: 'ADMIN 2FA cannot be turned off in production',
    });
  }
  if (env.NODE_ENV === 'production' && env.OTP_DEV_STAFF_BYPASS_PHONES.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['OTP_DEV_STAFF_BYPASS_PHONES'],
      message: 'the staff OTP bypass is dev-only and must be empty in production',
    });
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
  if (
    env.STORAGE_DRIVER === 's3' &&
    (!env.AWS_REGION || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET_NAME)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['AWS_S3_BUCKET_NAME'],
      message: 'AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET_NAME are required for s3',
    });
  }
  if (env.STORAGE_DRIVER === 'r2' && !env.R2_PRIVATE_BUCKET) {
    ctx.addIssue({
      code: 'custom',
      path: ['R2_PRIVATE_BUCKET'],
      message: 'R2_PRIVATE_BUCKET is required for r2 (invoices)',
    });
  }
  if (env.NODE_ENV === 'production' && env.CHECKOUT_IP_LIMIT !== 10) {
    ctx.addIssue({ code: 'custom', path: ['CHECKOUT_IP_LIMIT'], message: 'CHECKOUT_IP_LIMIT is a test-only override' });
  }
  if (env.NODE_ENV === 'production' && env.PAYMENT_GATEWAY === 'mock') {
    ctx.addIssue({
      code: 'custom',
      path: ['PAYMENT_GATEWAY'],
      message: 'mock payment gateway is not allowed in production',
    });
  }
  if (
    env.PAYMENT_GATEWAY === 'razorpay' &&
    (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['RAZORPAY_KEY_ID'],
      message: 'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required for razorpay',
    });
  }
  if (
    env.PAYMENT_GATEWAY === 'direct_upi' &&
    (!env.DIRECT_UPI_API_URL ||
      !env.DIRECT_UPI_PUBLIC_URL ||
      !env.DIRECT_UPI_KEY_ID ||
      !env.DIRECT_UPI_KEY_SECRET ||
      !env.DIRECT_UPI_WEBHOOK_SECRET)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['DIRECT_UPI_API_URL'],
      message:
        'DIRECT_UPI_API_URL, DIRECT_UPI_PUBLIC_URL, DIRECT_UPI_KEY_ID, DIRECT_UPI_KEY_SECRET and DIRECT_UPI_WEBHOOK_SECRET are required for direct_upi',
    });
  }
  if (env.DIRECT_UPI_KEY_SECRET && env.DIRECT_UPI_KEY_SECRET === env.DIRECT_UPI_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['DIRECT_UPI_WEBHOOK_SECRET'],
      message: 'the webhook secret must differ from the key secret',
    });
  }
  if (env.NODE_ENV === 'production' && env.PAYMENT_GATEWAY === 'direct_upi') {
    for (const key of ['DIRECT_UPI_API_URL', 'DIRECT_UPI_PUBLIC_URL'] as const) {
      if (!env[key]?.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'must be https:// in production' });
      }
    }
    if (env.DIRECT_UPI_KEY_ID?.startsWith('upi_test_')) {
      ctx.addIssue({ code: 'custom', path: ['DIRECT_UPI_KEY_ID'], message: 'use a upi_live_ key in production' });
    }
  }
  if (env.RAZORPAY_KEY_SECRET && env.RAZORPAY_KEY_SECRET === env.RAZORPAY_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['RAZORPAY_WEBHOOK_SECRET'],
      message: 'the webhook secret must differ from the key secret',
    });
  }
  if (env.NODE_ENV === 'production' && env.SHIPPING_PROVIDER === 'sandbox') {
    ctx.addIssue({
      code: 'custom',
      path: ['SHIPPING_PROVIDER'],
      message: 'the Shiprocket sandbox is not allowed in production',
    });
  }
  if (
    env.SHIPPING_PROVIDER === 'shiprocket' &&
    (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD || !env.SHIPROCKET_WEBHOOK_TOKEN)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['SHIPROCKET_EMAIL'],
      message: 'SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD and SHIPROCKET_WEBHOOK_TOKEN are required for shiprocket',
    });
  }
  if (env.NODE_ENV === 'production' && (env.WHATSAPP_PROVIDER === 'mock' || env.SMS_PROVIDER === 'mock')) {
    ctx.addIssue({
      code: 'custom',
      path: ['WHATSAPP_PROVIDER'],
      message: 'mock message providers are not allowed in production',
    });
  }
  if (
    env.WHATSAPP_PROVIDER === 'cloud' &&
    (!env.WHATSAPP_PHONE_NUMBER_ID ||
      !env.WHATSAPP_ACCESS_TOKEN ||
      !env.WHATSAPP_APP_SECRET ||
      !env.WHATSAPP_VERIFY_TOKEN)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['WHATSAPP_PHONE_NUMBER_ID'],
      message:
        'WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are required for cloud',
    });
  }
  if (env.SMS_PROVIDER === 'msg91' && (!env.MSG91_AUTH_KEY || !env.MSG91_SMS_TEMPLATES)) {
    ctx.addIssue({
      code: 'custom',
      path: ['MSG91_SMS_TEMPLATES'],
      message: 'MSG91_AUTH_KEY and MSG91_SMS_TEMPLATES are required for msg91 SMS',
    });
  }
  const vapid = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT].filter(Boolean).length;
  if (vapid !== 0 && vapid !== 3) {
    ctx.addIssue({
      code: 'custom',
      path: ['VAPID_PUBLIC_KEY'],
      message: 'set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT together',
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
