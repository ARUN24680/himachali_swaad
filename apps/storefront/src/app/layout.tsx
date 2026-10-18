import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import { site } from '@/config/site';
import { env } from '@/lib/env';
import { ConsentRoot } from '@/modules/analytics';
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

/**
 * Root: document, fonts, theme, query client and cookie consent only. Store chrome (header, footer,
 * cart, Organization JSON-LD) lives in `(site)/layout.tsx` via `SiteShell`, so bare routes such as
 * the public `/coming-soon` teaser ship none of it — not even in the RSC payload.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <QueryProvider>
            {children}
            <ConsentRoot />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
