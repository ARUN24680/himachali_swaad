'use client';

import { Button } from '@pk/ui';
import { Cookie } from 'lucide-react';
import Link from 'next/link';
import { useConsentStore } from '../store/consent.store';

/**
 * First-visit consent notice (DPDP Act 2023). "Accept all" and "Reject all" get equal weight — no
 * dark patterns. Not a modal: the shop stays usable, nothing optional loads until a choice is made.
 */
export function ConsentBanner() {
  const hydrated = useConsentStore((s) => s.hydrated);
  const decidedAt = useConsentStore((s) => s.decidedAt);
  const decide = useConsentStore((s) => s.decide);
  const openPreferences = useConsentStore((s) => s.setPreferencesOpen);

  if (!hydrated || decidedAt !== null) return null;

  return (
    <section
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 sm:px-4 sm:pb-4"
    >
      <div className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-float sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
        <div className="flex gap-3">
          <span
            aria-hidden="true"
            className="hidden size-10 shrink-0 place-items-center rounded-full bg-muted text-accent-foreground sm:grid [&_svg]:size-5"
          >
            <Cookie />
          </span>
          <div className="grid gap-1">
            <h2 id="consent-title" className="font-sans text-base font-semibold">
              Your privacy, your choice
            </h2>
            <p className="text-sm text-muted-foreground">
              We use essential storage to run your cart. With your permission we&rsquo;d also use analytics and
              marketing cookies (Google Analytics, Meta) to improve the shop and our ads.{' '}
              <Link
                href="/privacy-policy#cookies"
                className="font-medium text-accent-foreground underline underline-offset-4"
              >
                Read our cookie policy
              </Link>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
          <Button variant="secondary" onClick={() => decide({ analytics: true, marketing: true })}>
            Accept all
          </Button>
          <Button variant="secondary" onClick={() => decide({ analytics: false, marketing: false })}>
            Reject all
          </Button>
          <Button variant="ghost" className="col-span-2" onClick={() => openPreferences(true)}>
            Choose cookies
          </Button>
        </div>
      </div>
    </section>
  );
}
