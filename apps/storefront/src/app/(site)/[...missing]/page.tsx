import { notFound } from 'next/navigation';

/**
 * Unmatched store URLs land here so they get `(site)/not-found.tsx` inside the store chrome. The
 * root `app/not-found.tsx` stays product-neutral because Next ships it with every page's payload,
 * including the `/coming-soon` teaser.
 */
export default function MissingPage() {
  notFound();
}
