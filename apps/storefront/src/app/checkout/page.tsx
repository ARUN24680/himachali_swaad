import { buttonVariants } from '@pk/ui';
import { Hammer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StateMessage } from '@/components/common/StateMessage';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

/** Placeholder — the single-page checkout (Razorpay, prepaid) is Phase 5. */
export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <StateMessage
        icon={<Hammer />}
        title="Checkout is almost ready"
        description="We're putting the finishing touches on secure prepaid checkout. Your cart is saved on this device."
        action={
          <Link href="/products" className={buttonVariants({ variant: 'outline' })}>
            Keep browsing
          </Link>
        }
      />
    </div>
  );
}
