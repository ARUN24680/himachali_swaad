import type { Metadata } from 'next';
import { ComingSoon } from '@/modules/teaser';

const title = 'Something is coming from the mountains';
const description = 'Born in the valleys of Himachal Pradesh. Coming soon.';

/** Public teaser — no brand or product in the title, description or share card. */
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  applicationName: null,
  alternates: { canonical: '/coming-soon' },
  openGraph: { type: 'website', title, description, siteName: undefined, locale: 'en_IN' },
  twitter: { card: 'summary_large_image', title, description },
};

export default function ComingSoonPage() {
  return (
    <main id="main" className="flex-1">
      <ComingSoon />
    </main>
  );
}
