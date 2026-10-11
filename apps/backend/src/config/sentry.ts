import * as Sentry from '@sentry/node';

/** Non-PII identifiers only (request id, route, order code, job id). */
export type ErrorContext = { requestId?: string; route?: string } & Record<string, string | undefined>;

/** Unknown errors are reported here; injected into the app so tests can assert on it. */
export interface ErrorReporter {
  /** Returns the event id when the error was sent. */
  capture: (err: unknown, context: ErrorContext) => string | undefined;
}

export function initSentry(opts: { dsn?: string; environment: string; release?: string }): ErrorReporter {
  if (!opts.dsn) return { capture: () => undefined };

  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    release: opts.release,
    // No PII to Sentry (Rules §2.2): phone, address, OTP and tokens live in bodies, headers and cookies
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
  });

  return {
    capture: (err, context) => Sentry.captureException(err, { tags: { route: context.route }, extra: { ...context } }),
  };
}

export const flushSentry = (timeoutMs = 2_000) => Sentry.flush(timeoutMs);
