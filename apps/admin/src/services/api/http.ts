import { isErrorCode, type ErrorCode } from '@pk/shared';
import { env } from '@/lib/env';

/** Client-side failure codes that never come from the API envelope. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'BAD_RESPONSE';

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

  get retryAfterSeconds(): number | undefined {
    const v = this.details?.retryAfterSeconds;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : undefined;
  }
}

export const isApiError = (err: unknown, code?: ClientErrorCode): err is ApiRequestError =>
  err instanceof ApiRequestError && (code === undefined || err.code === code);

/**
 * Production answer for an ADMIN whose session has no TOTP yet (D-19, Phase 10 §10.1): 403 FORBIDDEN
 * with `details.reason = 'TOTP_ENROLLMENT_REQUIRED'`. KITCHEN_PARTNER sessions never get it.
 */
export const isTotpEnrollmentRequired = (err: unknown): err is ApiRequestError =>
  isApiError(err, 'FORBIDDEN') && err.details?.reason === 'TOTP_ENROLLMENT_REQUIRED';

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Extra request headers (e.g. `Idempotency-Key` for mark-packed, Phase 7). */
  headers?: Record<string, string>;
  /**
   * When the session can't be recovered, call the global auth-failure handler (clear cache →
   * /login?next=…). Default true. Callers that render their own signed-out UI (useMe/AuthGuard) pass false.
   */
  redirectOnAuthFailure?: boolean;
}

/**
 * Endpoints whose 401 is an answer, not an expired session — never trigger a refresh for them.
 * (/auth/me, /auth/logout-all, 2FA and change-password DO refresh: they need a live session.)
 */
const NO_REFRESH = ['/auth/refresh', '/auth/staff/login', '/auth/logout', '/auth/otp/send', '/auth/otp/verify'];

// ── Auth-failure hook (wired in main.tsx so this file stays free of router/query imports) ──
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

interface ApiResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  payload: unknown;
}

async function rawRequest(path: string, { method = 'GET', body, signal, headers }: HttpOptions): Promise<ApiResponse> {
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetch(`${env.VITE_API_URL}/api/v1${path}`, {
      method,
      credentials: 'include', // httpOnly cookie sessions (D-20) — tokens never reach JS
      headers: {
        ...headers,
        ...(body === undefined
          ? { accept: 'application/json' }
          : { 'content-type': 'application/json', accept: 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestSignal,
    });
    // Read the body under the same deadline: receiving headers alone must not leave auth pending.
    let payload: unknown;
    try {
      payload = await res.json();
    } catch (err) {
      if (requestSignal.aborted) throw err;
      throw new ApiRequestError({
        code: 'BAD_RESPONSE',
        message: 'Something went wrong. Please try again.',
        status: res.status,
      });
    }
    return { ok: res.ok, status: res.status, headers: res.headers, payload };
  } catch (err) {
    if (signal?.aborted || isApiError(err)) throw err;
    throw new ApiRequestError({
      code: 'NETWORK_ERROR',
      message: timeout.aborted
        ? 'The server is taking too long to respond. Please try again.'
        : 'Could not reach the server. Check your connection and try again.',
      status: 0,
    });
  }
}

async function parse<T>(res: ApiResponse): Promise<T> {
  const envelope = res.payload as {
    success?: boolean;
    data?: T;
    error?: { code?: unknown; message?: unknown; details?: Record<string, unknown> } | null;
    requestId?: string;
  };
  if (res.ok && envelope.success === true) return envelope.data as T;

  const retryHeader = Number(res.headers.get('retry-after'));
  throw new ApiRequestError({
    code: isErrorCode(envelope.error?.code) ? envelope.error.code : 'BAD_RESPONSE',
    message:
      typeof envelope.error?.message === 'string' ? envelope.error.message : 'Something went wrong. Please try again.',
    status: res.status,
    details:
      envelope.error?.details ??
      (Number.isFinite(retryHeader) && retryHeader > 0 ? { retryAfterSeconds: retryHeader } : undefined),
    requestId: envelope.requestId,
  });
}

/** `network`: the refresh call never got an answer (offline) — that is NOT a dead session. */
type RefreshOutcome = 'refreshed' | 'race' | 'failed' | 'network';
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** Single-flight: every request that hits 401 at the same moment shares ONE POST /auth/refresh. */
function refreshSession(): Promise<RefreshOutcome> {
  refreshInFlight ??= (async (): Promise<RefreshOutcome> => {
    try {
      await parse(await rawRequest('/auth/refresh', { method: 'POST', body: {} }));
      return 'refreshed';
    } catch (err) {
      // `race`: another tab rotated the token first and already set fresh cookies — just retry
      if (isApiError(err) && err.details?.reason === 'race') return 'race';
      if (isApiError(err, 'NETWORK_ERROR')) return 'network';
      return 'failed';
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// ── 2FA-required hook (wired in main.tsx): route the admin to /account to enrol, once per burst ──
let onTotpRequired: (() => void) | null = null;
export function setTotpRequiredHandler(handler: (() => void) | null) {
  onTotpRequired = handler;
}
let lastTotpRequiredAt = 0;
function notifyTotpRequired() {
  const now = Date.now();
  if (now - lastTotpRequiredAt < 2000) return;
  lastTotpRequiredAt = now;
  onTotpRequired?.();
}

let lastAuthFailureAt = 0;
function notifyAuthFailure() {
  // Many parallel queries fail together when a session dies — redirect once
  const now = Date.now();
  if (now - lastAuthFailureAt < 2000) return;
  lastAuthFailureAt = now;
  onAuthFailure?.();
}

/**
 * Envelope-aware request. On 401 it refreshes the session once (shared across concurrent calls) and
 * retries the original request; if the session can't be recovered it hands off to the auth-failure handler.
 * A 403 TOTP_ENROLLMENT_REQUIRED (ADMIN without 2FA, production) hands off to the 2FA-required handler.
 */
export async function http<T>(path: string, options: HttpOptions = {}): Promise<T> {
  try {
    return await request<T>(path, options);
  } catch (err) {
    // Every admin query/mutation fails the same way until TOTP is set up → one global hand-off
    if (isTotpEnrollmentRequired(err)) notifyTotpRequired();
    throw err;
  }
}

async function request<T>(path: string, options: HttpOptions): Promise<T> {
  const { redirectOnAuthFailure = true } = options;
  const res = await rawRequest(path, options);
  if (res.status !== 401 || NO_REFRESH.some((p) => path.startsWith(p))) return parse<T>(res);

  const outcome = await refreshSession();
  // Lost the connection mid-refresh: report "offline" (the desk can run from cache), never "signed out"
  if (outcome === 'network')
    throw new ApiRequestError({ code: 'NETWORK_ERROR', message: 'You seem to be offline.', status: 0 });
  if (outcome !== 'failed') {
    const retried = await rawRequest(path, options);
    if (retried.status !== 401) return parse<T>(retried);
    if (redirectOnAuthFailure) notifyAuthFailure();
    return parse<T>(retried);
  }
  if (redirectOnAuthFailure) notifyAuthFailure();
  return parse<T>(res);
}
