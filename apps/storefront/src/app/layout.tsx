import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import { JsonLd } from '@/components/common/JsonLd';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { site } from '@/config/site';
import { env } from '@/lib/env';
import { organizationJsonLd } from '@/lib/seo';
import { AccountMenu } from '@/modules/account';
import { ConsentPreferencesButton, ConsentRoot } from '@/modules/analytics';
import { CartButton, CartRoot } from '@/modules/cart';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import '@/styles/globals.css';

// Self-hosted at build time by next/font — no runtime request to Google (Rules §1.4)
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: { type: 'website', siteName: site.name, locale: site.locale },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Browser chrome colour must be a literal; keep in sync with --background in packages/ui globals.css
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f5ef' }, // pk-allow-color
    { media: '(prefers-color-scheme: dark)', color: '#0e1411' }, // pk-allow-color
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <QueryProvider>
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
            <ConsentRoot />
          </QueryProvider>
        </ThemeProvider>
        <JsonLd data={organizationJsonLd()} />
      </body>
    </html>
  );
}
