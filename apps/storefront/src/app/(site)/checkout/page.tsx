import type { Metadata } from 'next';
import { CheckoutView } from '@/modules/checkout';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

/** Thin route (D-44): single-screen prepaid checkout lives in modules/checkout. */
export default function CheckoutPage() {
  return <CheckoutView />;
}
