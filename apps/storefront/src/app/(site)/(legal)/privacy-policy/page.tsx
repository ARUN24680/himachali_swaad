import type { Metadata } from 'next';
import { LegalDocument, privacyPolicy } from '@/modules/content';

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.description,
  alternates: { canonical: '/privacy-policy' },
};

export default function Page() {
  return <LegalDocument doc={privacyPolicy} />;
}
