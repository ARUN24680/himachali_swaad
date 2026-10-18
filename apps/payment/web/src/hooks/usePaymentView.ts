import { useCallback, useEffect, useState } from 'react';
import { type FetchFailure, fetchPaymentView, type PaymentView } from '../lib/api';

/** Poll interval while waiting for the bank alert. */
const POLL_MS = 3_000;
/** After expiresAt we keep checking this long — a payment made just in time can still be matched. */
export const LATE_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_BACKOFF_MS = 20_000;
const ERROR_BACKOFF_MS = 6_000;

export interface PaymentViewState {
  view: PaymentView | null;
  /** Last failure; cleared on the next good response. */
  failure: FetchFailure | null;
  /** server clock − client clock, ms */
  skewMs: number;
  loading: boolean;
}

function nextDelay(view: PaymentView | null, failure: FetchFailure | null, skewMs: number): number | null {
  if (failure === 'not_found') return null;
  if (failure === 'rate_limited') return RATE_LIMIT_BACKOFF_MS;
  if (failure === 'error') return view ? ERROR_BACKOFF_MS : null; // first load fails → manual retry
  if (!view || view.status !== 'created') return null;
  const now = Date.now() + skewMs;
  return now < Date.parse(view.expiresAt) + LATE_WINDOW_MS ? POLL_MS : null;
}

/**
 * Loads the payment and polls every 3 s while it is still `created` (and up to 5 min past expiry).
 * Checks again immediately when the tab becomes visible — the customer is usually coming back from
 * their UPI app at that moment.
 */
export function usePaymentView(orderId: string | null) {
  const [state, setState] = useState<PaymentViewState>({
    view: null,
    failure: orderId ? null : 'not_found',
    skewMs: 0,
    loading: Boolean(orderId),
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!orderId) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let stopped = false;
    // Local mirror so scheduling never depends on a stale render.
    let view: PaymentView | null = null;
    let skewMs = 0;

    const tick = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      clearTimeout(timer);
      let failure: FetchFailure | null = null;
      try {
        const res = await fetchPaymentView(orderId, ctrl.signal);
        if (res.ok) {
          view = res.view;
          skewMs = res.skewMs;
        } else {
          failure = res.failure;
        }
      } catch {
        return; // aborted on unmount
      } finally {
        inFlight = false;
      }
      setState({ view, failure, skewMs, loading: false });
      const delay = nextDelay(view, failure, skewMs);
      if (delay === null) stopped = true;
      else timer = setTimeout(() => void tick(), delay);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      ctrl.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [orderId, attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, failure: null }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
