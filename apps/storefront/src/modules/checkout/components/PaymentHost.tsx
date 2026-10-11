'use client';

import Script from 'next/script';
import type { PaymentController } from '../hooks/usePayment';
import { RAZORPAY_SCRIPT_SRC } from '../lib/razorpay';
import { MockPaymentDialog } from './MockPaymentDialog';

/**
 * Mounts what a payment needs on the page: the Razorpay script (lazy — after the page is idle, and
 * only on pages that can take a payment, Phase 5 §5.6) and the dev-only mock gateway dialog.
 */
export function PaymentHost({ payment, loadRazorpay = true }: { payment: PaymentController; loadRazorpay?: boolean }) {
  return (
    <>
      {loadRazorpay && <Script src={RAZORPAY_SCRIPT_SRC} strategy="lazyOnload" />}
      <MockPaymentDialog payment={payment} />
    </>
  );
}
