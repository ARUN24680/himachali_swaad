import type { Metadata } from 'next';
import { LegalDocument, refundPolicy } from '@/modules/content';

export const metadata: Metadata = {
  title: refundPolicy.title,
  description: refundPolicy.description,
  alternates: { canonical: '/refund-cancellation' },
};

export default function Page() {
  return <LegalDocument doc={refundPolicy} />;
}
