/**
 * API error code registry (architecture/02-backend-api-spec.md). The only place codes and
 * their HTTP status are defined; backend AppError and frontend error handling both read this.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  INVALID_SIGNATURE: 400,
  OTP_INVALID: 400,
  UNAUTHENTICATED: 401,
  TOTP_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  OUT_OF_STOCK: 409,
  INSUFFICIENT_STOCK: 409,
  DUPLICATE: 409,
  ILLEGAL_TRANSITION: 409,
  STALE_STATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE: 409,
  VALIDATION_FAILED: 422,
  PINCODE_NOT_SERVICEABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  PAYMENT_INIT_FAILED: 502,
  UPSTREAM_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);
