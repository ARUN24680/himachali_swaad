import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const PublicEnvSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  VITE_SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  // Phase 10 §10.3: git SHA set by the deploy, matches the uploaded source maps
  VITE_RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
});

/** Validated at startup — a missing VITE_API_URL fails loudly instead of calling `undefined/api`. */
export const env = PublicEnvSchema.parse(import.meta.env);
