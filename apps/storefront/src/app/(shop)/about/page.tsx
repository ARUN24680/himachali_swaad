import type { Metadata } from 'next';
import { AboutContent } from '@/modules/content';

export const metadata: Metadata = {
  title: 'Our story',
  description: 'Himachali meat pickles made the old way — small batches, mustard oil, no added preservatives.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return <AboutContent />;
}
