import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './sentry-options';

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  initialised = true;
  Sentry.init(sentryOptions);
}

export function captureException(error: unknown): void {
  initSentry();
  Sentry.captureException(error);
}
