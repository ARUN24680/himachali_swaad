import type { Metadata } from 'next';
import NotFound from '../not-found';

/**
 * Target of the pre-launch lock (`src/proxy.ts`): every locked URL is rewritten here with HTTP 404
 * and shows the root, product-neutral not-found UI (outside the `(site)` group, so no store header,
 * footer or links). It is a normal page rather than `notFound()` so it can carry its own neutral
 * metadata: a thrown `notFound()` keeps the root layout's head, which names the brand and product.
 */
const title = 'Page not found';
const description = 'This page is not available.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  applicationName: null,
  robots: { index: false, follow: false },
  openGraph: { type: 'website', title, description, siteName: undefined, images: [] },
  twitter: { card: 'summary', title, description, images: [] },
};

export default function Launch404() {
  return <NotFound />;
}
