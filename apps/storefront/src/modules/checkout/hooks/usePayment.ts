'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { site } from '@/config/site';
import { isApiError } from '@/lib/api-client';
import { checkoutApi } from '../api/checkoutApi';
import { readPrimaryHex, upiFirstConfig, waitForRazorpay } from '../lib/razorpay';

/** Everything needed to (re)open the payment window for one order — from create-order or order status. */
export interface PaymentSession {
  orderCode: string;
  razorpayOrderId: string;
  keyId: string;
  gateway: 'razorpay' | 'mock';
  amountPaise: number;
  /** ISO time the jar reservation ends; the modal's `timeout` counts down to it. */
  expiresAt: string;
  prefill?: { name: string; contact: string; email: string | null };
}

export type PaymentPhase =
  | { kind: 'idle' }
  /** Loading the Razorpay script / building the modal. */
  | { kind: 'opening' }
  /** Razorpay modal or the mock dialog is on screen. */
  | { kind: 'open' }
  | { kind: 'verifying' }
  /** "Payment not completed — retry" (modal dismissed or payment.failed). Same order, same reservation. */
  | { kind: 'failed'; reason: string | null }
  /** The gateway couldn't be opened, or the signature was rejected. */
  | { kind: 'error'; message: string };

export type MockOutcome = 'success' | 'failure' | 'close-browser';

/** Called once the order page should take over (paid, or paid-and-left for the webhook to confirm). */
type OnPaid = (orderCode: string) => void;

const secondsLeft = (iso: string) => Math.floor((Date.parse(iso) - Date.now()) / 1000);

/**
 * Payment launcher shared by checkout and the order page's retry (Phase 5 §5.6). One code path for
 * the real Razorpay modal and the dev-only mock gateway: success → POST /payments/verify → onPaid.
 */
export function usePayment(onPaid: OnPaid) {
  const [phase, setPhase] = useState<PaymentPhase>({ kind: 'idle' });
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [mockOpen, setMockOpen] = useState(false);
  const [mockBusy, setMockBusy] = useState<MockOutcome | null>(null);
  const [mockError, setMockError] = useState<string | null>(null);
  /** Guards against the handler and a late dismiss both firing (or a double verify). */
  const settled = useRef(false);
  const onPaidRef = useRef(onPaid);
  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  const verify = useCallback(
    async (s: PaymentSession, ids: { paymentId: string; signature: string; orderId?: string }) => {
      if (settled.current) return;
      settled.current = true;
      setPhase({ kind: 'verifying' });
      try {
        const res = await checkoutApi.verifyPayment({
          razorpayOrderId: ids.orderId ?? s.razorpayOrderId,
          razorpayPaymentId: ids.paymentId,
          razorpaySignature: ids.signature,
        });
        onPaidRef.current(res.orderCode);
      } catch (err) {
        if (isApiError(err, 'INVALID_SIGNATURE')) {
          settled.current = false;
          setPhase({
            kind: 'error',
            message:
              "We couldn't confirm this payment with the bank. If money was debited, it is refunded automatically — please contact us with your order code.",
          });
          return;
        }
        // Network / server hiccup: the payment.captured webhook still confirms the order — the order
        // page polls and shows "Confirming your payment…" until it does.
        onPaidRef.current(s.orderCode);
      }
    },
    [],
  );

  const openRazorpay = useCallback(
    async (s: PaymentSession) => {
      setPhase({ kind: 'opening' });
      let Razorpay;
      try {
        Razorpay = await waitForRazorpay();
      } catch {
        setPhase({
          kind: 'error',
          message: "The payment window didn't load. Check your connection (or turn off an ad blocker) and try again.",
        });
        return;
      }
      const timeout = secondsLeft(s.expiresAt);
      if (timeout < 10) {
        setPhase({ kind: 'failed', reason: 'Your jar reservation has ended.' });
        return;
      }
      let lastFailure: string | null = null;
      const rzp = new Razorpay({
        key: s.keyId,
        order_id: s.razorpayOrderId,
        amount: s.amountPaise,
        currency: 'INR',
        name: site.name,
        description: `Order ${s.orderCode}`,
        prefill: s.prefill
          ? { name: s.prefill.name, contact: s.prefill.contact, email: s.prefill.email ?? undefined }
          : undefined,
        theme: { color: readPrimaryHex() },
        timeout,
        config: upiFirstConfig(),
        modal: {
          escape: true,
          confirm_close: true,
          ondismiss: () => {
            if (!settled.current) setPhase({ kind: 'failed', reason: lastFailure });
          },
        },
        handler: (resp) =>
          void verify(s, {
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
            orderId: resp.razorpay_order_id,
          }),
      });
      rzp.on('payment.failed', (resp) => {
        lastFailure = resp.error?.description ?? 'The payment was declined.';
        // Razorpay keeps its modal open so the customer can try another method; the page underneath
        // already shows the retry state in case they close it.
        if (!settled.current) setPhase({ kind: 'failed', reason: lastFailure });
      });
      setPhase({ kind: 'open' });
      rzp.open();
    },
    [verify],
  );

  /** Open (or reopen) payment for this order. Retrying reuses the same gateway order while it is valid. */
  const start = useCallback(
    (s: PaymentSession) => {
      settled.current = false;
      setSession(s);
      if (s.gateway === 'mock') {
        setMockError(null);
        setMockOpen(true);
        setPhase({ kind: 'open' });
        return;
      }
      void openRazorpay(s);
    },
    [openRazorpay],
  );

  const pickMock = useCallback(
    async (outcome: MockOutcome) => {
      if (!session) return;
      setMockBusy(outcome);
      setMockError(null);
      try {
        const res = await checkoutApi.simulatePayment({
          razorpayOrderId: session.razorpayOrderId,
          outcome: outcome === 'failure' ? 'failure' : 'success',
          ...(outcome === 'close-browser' ? { skipClientVerify: true } : {}),
        });
        if (outcome === 'failure') {
          setMockOpen(false);
          setPhase({ kind: 'failed', reason: 'Test payment declined.' });
        } else if (outcome === 'close-browser') {
          // Nothing calls verify — only the webhook confirms this order.
          settled.current = true;
          setMockOpen(false);
          onPaidRef.current(session.orderCode);
        } else if (res.razorpaySignature) {
          setMockOpen(false);
          await verify(session, {
            paymentId: res.razorpayPaymentId,
            signature: res.razorpaySignature,
            orderId: res.razorpayOrderId,
          });
        } else {
          setMockError('The mock gateway returned no signature.');
        }
      } catch (err) {
        setMockError(isApiError(err) ? err.message : 'Mock payment failed. Try again.');
      } finally {
        setMockBusy(null);
      }
    },
    [session, verify],
  );

  /** Mock dialog closed without choosing → same retry state as dismissing Razorpay. */
  const closeMock = useCallback(() => {
    setMockOpen(false);
    if (!settled.current) setPhase({ kind: 'failed', reason: null });
  }, []);

  const reset = useCallback(() => {
    settled.current = false;
    setSession(null);
    setMockOpen(false);
    setPhase({ kind: 'idle' });
  }, []);

  return {
    phase,
    session,
    start,
    reset,
    /** Busy = the customer should not be able to start another payment right now. */
    busy: phase.kind === 'opening' || phase.kind === 'verifying' || phase.kind === 'open',
    mock: { open: mockOpen, busy: mockBusy, error: mockError, pick: pickMock, close: closeMock },
  };
}

export type PaymentController = ReturnType<typeof usePayment>;
