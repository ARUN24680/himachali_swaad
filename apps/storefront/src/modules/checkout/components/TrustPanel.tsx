import { Lock, ShieldCheck, Utensils } from 'lucide-react';
import Link from 'next/link';
import { PendingValue } from '@/components/common/PendingValue';
import { seller } from '@/config/site';

/** Trust + compliance strip under the summary: Razorpay, FSSAI licence (config/site.ts), policy links. */
export function TrustPanel() {
  return (
    <aside
      aria-label="Payment security and food safety"
      className="grid gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm"
    >
      <p className="flex items-start gap-2.5 text-foreground">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        Secure payment by Razorpay — we never see your card or UPI PIN.
      </p>
      <p className="flex items-start gap-2.5 text-foreground">
        <Utensils aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
        <span>
          FSSAI Lic. No.{' '}
          <PendingValue
            value={seller.fssaiLicenseNo}
            label="FSSAI licence number"
            className="font-medium tabular-nums"
          />
        </span>
      </p>
      <p className="flex items-start gap-2.5 text-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
        <span>
          Read our{' '}
          <Link href="/refund-cancellation" className="text-accent-foreground underline underline-offset-4">
            refund &amp; cancellation
          </Link>{' '}
          and{' '}
          <Link href="/shipping-policy" className="text-accent-foreground underline underline-offset-4">
            shipping
          </Link>{' '}
          policies.
        </span>
      </p>
    </aside>
  );
}
