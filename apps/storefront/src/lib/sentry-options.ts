import type { init } from '@sentry/nextjs';
import { env } from './env';

/** Shared by client, server and edge Sentry init — no PII (Rules §2.2). */
export const sentryOptions: Parameters<typeof init>[0] = {
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
};
