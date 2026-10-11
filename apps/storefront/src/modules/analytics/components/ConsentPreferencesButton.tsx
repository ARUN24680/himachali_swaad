'use client';

import { cn } from '@pk/ui';
import { openConsentPreferences } from '../store/consent.store';

/** Footer link-style button — consent stays editable from every page (DPDP: withdraw as easily as given). */
export function ConsentPreferencesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openConsentPreferences}
      className={cn(
        'inline-flex min-h-11 items-center rounded-sm text-left outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      Cookie preferences
    </button>
  );
}
