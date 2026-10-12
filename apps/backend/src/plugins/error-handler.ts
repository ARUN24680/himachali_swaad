import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ErrorReporter } from '../config/sentry';
import { AppError } from '../utils/app-error';
import { fail } from '../utils/response';

/**
 * Every error leaves the API as the standard envelope. Expected errors keep their code;
 * anything unknown becomes INTERNAL_ERROR, is reported to Sentry, and never leaks its message or stack.
 */
export function registerErrorHandler(
  app: FastifyInstance,
  reporter: ErrorReporter,
  /** Phase 10 §10.3: counts 5xx for the "error spike" ops alert. Must never throw. */
  onServerError?: () => void,
): void {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof AppError) {
      if (err.code === 'RATE_LIMITED' && err.details?.retryAfterSeconds) {
        reply.header('retry-after', String(err.details.retryAfterSeconds));
      }
      return reply
        .status(err.statusCode)
        .send(
          fail(request.id, { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }),
        );
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const issues = err.validation.map((v) => ({ path: v.instancePath, message: v.message }));
      return reply
        .status(400)
        .send(
          fail(request.id, { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: { issues } }),
        );
    }

    // Fastify's own client errors (malformed JSON, body too large, unsupported media type)
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send(fail(request.id, { code: 'VALIDATION_ERROR', message: err.message }));
    }

    onServerError?.();
    const sentryEventId = reporter.capture(err, { requestId: request.id, route: request.routeOptions.url });
    request.log.error({ err, sentryEventId }, 'unhandled error');
    return reply.status(500).send(
      fail(request.id, {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
        ...(sentryEventId ? { details: { sentryEventId } } : {}),
      }),
    );
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(fail(request.id, { code: 'NOT_FOUND', message: 'Route not found' })),
  );
}
