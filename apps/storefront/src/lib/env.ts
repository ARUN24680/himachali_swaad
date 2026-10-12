/**
 * Public env (NEXT_PUBLIC_* only — shipped to the browser). Validated without zod on purpose: this
 * module is imported by client components, and zod would add ~90 KB to every page's first-load JS.
 * Server-only secrets are read where they are used (e.g. REVALIDATE_SECRET in app/api/revalidate).
 */
const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());

function requiredUrl(name: string, value: string | undefined): string {
  const v = blank(value);
  if (!v || !URL.canParse(v)) throw new Error(`Invalid environment variable ${name}: expected a URL`);
  return v;
}

function optional(name: string, value: string | undefined, valid: (v: string) => boolean): string | undefined {
  const v = blank(value);
  if (v !== undefined && !valid(v)) throw new Error(`Invalid environment variable ${name}`);
  return v;
}

// Explicit references so Next inlines NEXT_PUBLIC_* values into the client bundle
export const env = {
  NEXT_PUBLIC_API_URL: requiredUrl('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
  NEXT_PUBLIC_SITE_URL: requiredUrl('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL),
  NEXT_PUBLIC_SENTRY_DSN: optional('NEXT_PUBLIC_SENTRY_DSN', process.env.NEXT_PUBLIC_SENTRY_DSN, URL.canParse),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: blank(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT),
  NEXT_PUBLIC_RELEASE: blank(process.env.NEXT_PUBLIC_RELEASE), // git SHA (Phase 10 §10.3)
  /** GA4 measurement id (G-XXXXXXX). Empty → GA4 never loads, even with consent. */
  NEXT_PUBLIC_GA4_ID: optional('NEXT_PUBLIC_GA4_ID', process.env.NEXT_PUBLIC_GA4_ID, (v) =>
    /^G-[A-Z0-9]{4,16}$/.test(v),
  ),
  /** Meta Pixel id (digits). Empty → Pixel never loads, even with consent. */
  NEXT_PUBLIC_META_PIXEL_ID: optional('NEXT_PUBLIC_META_PIXEL_ID', process.env.NEXT_PUBLIC_META_PIXEL_ID, (v) =>
    /^\d{6,20}$/.test(v),
  ),
} as const;
