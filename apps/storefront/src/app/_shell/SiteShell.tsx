import type { ReactNode } from 'react';
import { JsonLd } from '@/components/common/JsonLd';
import { organizationJsonLd } from '@/lib/seo';
import { AccountMenu } from '@/modules/account';
import { ConsentPreferencesButton } from '@/modules/analytics';
import { CartButton, CartRoot } from '@/modules/cart';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

/**
 * Store chrome: skip link, header, main landmark, footer (legal links + seller details), cart drawer
 * and Organization JSON-LD. Composes feature modules, so it lives under `app/` (components/ must not import modules, D-44). Used by `app/(site)/layout.tsx` and the root `not-found.tsx` (which
 * renders outside any route group). Bare routes like `/coming-soon` don't use it.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <SiteHeader account={<AccountMenu />} cart={<CartButton />} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter consentControl={<ConsentPreferencesButton />} />
      <CartRoot />
      <JsonLd data={organizationJsonLd()} />
    </>
  );
}
