'use client';

import Script from 'next/script';
import { preconnect } from 'react-dom';
import type { PaymentController } from '../hooks/usePayment';
import { RAZORPAY_SCRIPT_SRC } from '../lib/razorpay';
import { MockPaymentDialog } from './MockPaymentDialog';

/**
 * Mounts what a payment needs on the page: the Razorpay script (lazy — after the page is idle, and
 * only on pages that can take a payment, Phase 5 §5.6) and the dev-only mock gateway dialog.
 * Preconnects to the Razorpay origins (audit R-22) so the checkout modal's own requests skip the
 * DNS/TLS handshake — only here, never site-wide, since only checkout/order pages open a payment.
 */
export function PaymentHost({ payment, loadRazorpay = true }: { payment: PaymentController; loadRazorpay?: boolean }) {
  if (loadRazorpay) {
    preconnect('https://checkout.razorpay.com');
    preconnect('https://api.razorpay.com');
  }
  return (
    <>
      {loadRazorpay && <Script src={RAZORPAY_SCRIPT_SRC} strategy="lazyOnload" />}
      <MockPaymentDialog payment={payment} />
    </>
  );
}
