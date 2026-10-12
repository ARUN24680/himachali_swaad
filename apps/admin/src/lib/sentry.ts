import * as Sentry from '@sentry/react';
import { env } from './env';

export function initSentry(): void {
  if (!env.VITE_SENTRY_DSN) return;
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: env.VITE_RELEASE,
    tracesSampleRate: 0,
    dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
  });
}
