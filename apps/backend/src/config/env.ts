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

  SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
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
  const result = EnvSchema.safeParse(source);
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
