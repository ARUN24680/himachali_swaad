import { CheckoutSkeleton } from '@/modules/checkout';

/** Checkout loading shell — the same skeleton the view shows while the cart hydrates (audit §3.5). */
export default function Loading() {
  return <CheckoutSkeleton />;
}
