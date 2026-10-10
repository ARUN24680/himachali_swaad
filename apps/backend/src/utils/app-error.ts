import { ERROR_CODES, type ErrorCode } from '@pk/shared';

/** Expected, client-safe error. HTTP status comes from the shared registry (architecture/02). */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = ERROR_CODES[code];
  }
}
