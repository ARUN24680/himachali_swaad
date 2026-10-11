import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalId = (re: RegExp) => z.preprocess(emptyToUndefined, z.string().regex(re).optional());

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  /** GA4 measurement id (G-XXXXXXX). Empty → GA4 never loads, even with consent. */
  NEXT_PUBLIC_GA4_ID: optionalId(/^G-[A-Z0-9]{4,16}$/),
  /** Meta Pixel id (digits). Empty → Pixel never loads, even with consent. */
  NEXT_PUBLIC_META_PIXEL_ID: optionalId(/^\d{6,20}$/),
});

// Explicit references so Next inlines NEXT_PUBLIC_* values into the client bundle
export const env = PublicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  NEXT_PUBLIC_GA4_ID: process.env.NEXT_PUBLIC_GA4_ID,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
});
