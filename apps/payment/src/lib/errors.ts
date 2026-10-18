export const ERROR_STATUS = {
  BAD_REQUEST_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_SIGNATURE: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  AMOUNTS_EXHAUSTED: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Expected failure with a stable code. Messages are customer/store safe — never secrets or alert text. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
  get status(): number {
    return ERROR_STATUS[this.code];
  }
}
