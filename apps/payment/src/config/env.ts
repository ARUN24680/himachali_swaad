import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');
const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

/**
 * Every variable is prefixed PAYMENT_ / UPI_: the service reads the same root .env as the backend
 * and must not pick up the backend's PORT or DATABASE_URL.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  PAYMENT_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  PAYMENT_HOST: z.string().default('0.0.0.0'),
  PAYMENT_TRUST_PROXY: bool('false'),

  /** Its own database (e.g. pk_payment) — never the store's. */
  PAYMENT_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PAYMENT_DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  PAYMENT_DB_SSL: bool('false'),

  /** Where customers open the pay page, e.g. https://pay.pahadikhatki.in */
  PAYMENT_PUBLIC_URL: z.url().default('http://localhost:4100'),
  /** Storefront base; the pay page returns to <url>/order/<orderCode>. Never taken from the request. */
  PAYMENT_STOREFRONT_URL: z.url().default('http://localhost:3000'),

  /** Basic-auth credentials the store backend uses (its DIRECT_UPI_KEY_ID / DIRECT_UPI_KEY_SECRET). */
  PAYMENT_API_KEY_ID: z.string().regex(/^upi_(test|live)_[A-Za-z0-9]{8,}$/, 'e.g. upi_live_3fK9q2Lm'),
  PAYMENT_API_KEY_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** HMAC key for webhooks to the store (its DIRECT_UPI_WEBHOOK_SECRET). Must differ from the key secret. */
  PAYMENT_WEBHOOK_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** The store's webhook endpoint: <api>/api/v1/webhooks/razorpay (Razorpay-compatible events). */
  PAYMENT_WEBHOOK_URL: z.url(),

  /** Business current-account VPA that receives the money. */
  UPI_VPA: z.string().regex(/^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/, 'not a UPI id (name@bank)'),
  UPI_PAYEE_NAME: z.string().trim().min(2).max(50),
  /** Amount stays reserved this long after the store's reservation ends, so a late payment still matches. */
  UPI_LATE_GRACE_MINUTES: z.coerce.number().int().min(0).max(120).default(30),
  /** Used when the store does not send its reservation end. */
  UPI_DEFAULT_HOLD_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

  /** Channel 1 — bank alert e-mails via SES receiving → SNS (HTTPS subscription). */
  UPI_ALERT_SNS_TOPIC_ARN: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/)
      .optional(),
  ),
  /** The address bank alerts are forwarded to (SES recipient). Other recipients are rejected. */
  UPI_ALERT_EMAIL_RECIPIENT: z.preprocess(emptyToUndefined, z.email().optional()),
  /** DKIM signing domains accepted as "the bank", e.g. hdfcbank.net,icicibank.com */
  UPI_BANK_EMAIL_DOMAINS: csv,

  /** Channel 2 — Android observer. base64 of 32 bytes, encrypts device secrets at rest. */
  UPI_DEVICE_KEK: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be base64 of exactly 32 bytes')
      .optional(),
  ),
  /** SMS sender ids accepted (suffix match, case-insensitive), e.g. HDFCBK,ICICIT */
  UPI_BANK_SMS_SENDERS: csv,

  /** /dev/* simulator routes. Refused in production. */
  PAYMENT_DEV_TOOLS: bool('false'),
});

const EnvSchemaChecked = EnvSchema.superRefine((env, ctx) => {
  const prod = env.NODE_ENV === 'production';
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

  if (env.PAYMENT_API_KEY_SECRET === env.PAYMENT_WEBHOOK_SECRET) {
    issue('PAYMENT_WEBHOOK_SECRET', 'the webhook secret must differ from the key secret');
  }
  if (env.UPI_ALERT_SNS_TOPIC_ARN && (!env.UPI_ALERT_EMAIL_RECIPIENT || env.UPI_BANK_EMAIL_DOMAINS.length === 0)) {
    issue('UPI_ALERT_EMAIL_RECIPIENT', 'e-mail alerts need UPI_ALERT_EMAIL_RECIPIENT and UPI_BANK_EMAIL_DOMAINS');
  }
  if (env.UPI_DEVICE_KEK && env.UPI_BANK_SMS_SENDERS.length === 0) {
    issue('UPI_BANK_SMS_SENDERS', 'the Android observer needs UPI_BANK_SMS_SENDERS');
  }
  if (!prod) return;

  if (env.PAYMENT_DEV_TOOLS) issue('PAYMENT_DEV_TOOLS', 'dev tools are not allowed in production');
  if (env.PAYMENT_API_KEY_ID.startsWith('upi_test_')) issue('PAYMENT_API_KEY_ID', 'use a upi_live_ key in production');
  for (const key of ['PAYMENT_PUBLIC_URL', 'PAYMENT_STOREFRONT_URL', 'PAYMENT_WEBHOOK_URL'] as const) {
    if (!env[key].startsWith('https://')) issue(key, 'must be https:// in production');
  }
  if (!env.PAYMENT_DB_SSL) issue('PAYMENT_DB_SSL', 'database TLS is required in production');
  if (!env.UPI_ALERT_SNS_TOPIC_ARN && !env.UPI_DEVICE_KEK) {
    issue('UPI_ALERT_SNS_TOPIC_ARN', 'configure at least one alert channel (SES e-mail or Android observer)');
  }
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Throws EnvValidationError listing every bad/missing var. Values are never echoed. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchemaChecked.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  return result.data;
}

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
