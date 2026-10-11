import type { ErrorCode } from '@pk/shared';
import { isErrorCode } from '@pk/shared/errors';
import { env } from '@/lib/env';

/** Client-side failure codes that never come from the API envelope. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'BAD_RESPONSE';

/** Thrown for every non-success response. `code` is the API error code (doc 02) or a client code. */
export class ApiRequestError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(opts: {
    code: ClientErrorCode;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = 'ApiRequestError';
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }

  /** Seconds to wait for RATE_LIMITED, from `details.retryAfterSeconds` (or the Retry-After header). */
  get retryAfterSeconds(): number | undefined {
    const v = this.details?.retryAfterSeconds;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : undefined;
  }
}

export const isApiError = (err: unknown, code?: ClientErrorCode): err is ApiRequestError =>
  err instanceof ApiRequestError && (code === undefined || err.code === code);

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  /** Extra request headers, e.g. `Idempotency-Key` for checkout (Phase 5 §5.4). */
  headers?: Record<string, string>;
}

/**
 * Envelope-aware fetch to the backend (Rules §2.2). Sessions are httpOnly cookies (D-20), so every
 * call sends `credentials: 'include'` and the client never sees a token.
 */
export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, signal, headers }: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError({ code: 'NETWORK_ERROR', message: 'You seem to be offline.', status: 0 });
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ApiRequestError({
      code: 'BAD_RESPONSE',
      message: 'Something went wrong. Please try again.',
      status: res.status,
    });
  }

  const envelope = payload as {
    success?: boolean;
    data?: T;
    error?: { code?: unknown; message?: unknown; details?: Record<string, unknown> } | null;
    requestId?: string;
  };
  if (res.ok && envelope.success === true) return envelope.data as T;

  const retryHeader = Number(res.headers.get('retry-after'));
  const details =
    envelope.error?.details ??
    (Number.isFinite(retryHeader) && retryHeader > 0 ? { retryAfterSeconds: retryHeader } : undefined);
  throw new ApiRequestError({
    code: isErrorCode(envelope.error?.code) ? envelope.error.code : 'BAD_RESPONSE',
    message:
      typeof envelope.error?.message === 'string' ? envelope.error.message : 'Something went wrong. Please try again.',
    status: res.status,
    details,
    requestId: envelope.requestId,
  });
}
