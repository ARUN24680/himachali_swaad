/** Read-only client for GET /pay/api/orders/:id (the only API the pay page talks to). */

export type PayStatus = 'created' | 'paid' | 'expired';

export interface PaymentView {
  orderId: string;
  orderCode: string;
  /** Exact amount the customer must pay (order total minus a 0–99 paise matching offset). */
  payablePaise: number;
  /** Order total; payablePaise ≤ amountPaise. */
  amountPaise: number;
  status: PayStatus;
  expiresAt: string;
  payeeName: string;
  payeeVpa: string;
  upiUri: string;
  qrDataUrl: string;
  returnUrl: string;
}

export type FetchFailure = 'not_found' | 'rate_limited' | 'error';

export type FetchResult =
  | { ok: true; view: PaymentView; /** server clock − client clock, ms */ skewMs: number }
  | { ok: false; failure: FetchFailure };

const ORDER_PATH = /^\/pay\/(order_[A-Za-z0-9]{16})\/?$/;

/** The order id comes only from the path the server already validated — never from the query string. */
export function orderIdFromLocation(pathname: string): string | null {
  return ORDER_PATH.exec(pathname)?.[1] ?? null;
}

const STATUSES: readonly PayStatus[] = ['created', 'paid', 'expired'];

function isPaymentView(v: unknown): v is PaymentView {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const str = (k: string) => typeof o[k] === 'string';
  const int = (k: string) => Number.isSafeInteger(o[k]);
  return (
    ['orderId', 'orderCode', 'expiresAt', 'payeeName', 'payeeVpa', 'upiUri', 'qrDataUrl', 'returnUrl'].every(str) &&
    int('payablePaise') &&
    int('amountPaise') &&
    STATUSES.includes(o.status as PayStatus) &&
    !Number.isNaN(Date.parse(o.expiresAt as string))
  );
}

export async function fetchPaymentView(orderId: string, signal: AbortSignal): Promise<FetchResult> {
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`/pay/api/orders/${encodeURIComponent(orderId)}`, {
      signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    if (signal.aborted) throw err;
    return { ok: false, failure: 'error' };
  }
  if (res.status === 404) return { ok: false, failure: 'not_found' };
  if (res.status === 429) return { ok: false, failure: 'rate_limited' };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, failure: 'error' };
  }
  const env = body as { success?: unknown; data?: unknown; error?: { code?: unknown } | null; timestamp?: unknown };
  if (env?.error?.code === 'NOT_FOUND') return { ok: false, failure: 'not_found' };
  if (env?.error?.code === 'RATE_LIMITED') return { ok: false, failure: 'rate_limited' };
  if (!res.ok || env?.success !== true || !isPaymentView(env.data)) return { ok: false, failure: 'error' };

  // Server clock offset so the countdown matches the jar reservation even if the phone clock is off.
  const serverTime = typeof env.timestamp === 'string' ? Date.parse(env.timestamp) : Number.NaN;
  const midpoint = sentAt + (Date.now() - sentAt) / 2;
  const skewMs = Number.isNaN(serverTime) ? 0 : Math.round(serverTime - midpoint);
  return { ok: true, view: env.data, skewMs };
}

/** Redirect only to an http(s) URL that came from the server response. */
export function goTo(returnUrl: string): void {
  try {
    const url = new URL(returnUrl);
    if (url.protocol === 'https:' || url.protocol === 'http:') window.location.assign(url.href);
  } catch {
    /* malformed URL from server — stay on the page */
  }
}
