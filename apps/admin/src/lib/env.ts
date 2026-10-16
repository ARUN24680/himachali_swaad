import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const PublicEnvSchema = z.object({
  // Blank means same-origin /api/v1 (Vite proxy locally, reverse proxy in Docker).
  VITE_API_URL: z
    .preprocess(emptyToUndefined, z.url().optional())
    .transform((value) => value?.replace(/\/+$/, '') ?? ''),
  VITE_STOREFRONT_URL: z.preprocess(emptyToUndefined, z.string().optional()).default('http://localhost:3000'),
  VITE_SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  VITE_SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  // Phase 10 §10.3: git SHA set by the deploy, matches the uploaded source maps
  VITE_RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
});

/** Validate explicit API URLs; an omitted URL uses the current origin. */
export const env = PublicEnvSchema.parse(import.meta.env);
