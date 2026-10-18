import type { Metadata } from 'next';
import { LegalDocument, grievancePolicy } from '@/modules/content';

export const metadata: Metadata = {
  title: grievancePolicy.title,
  description: grievancePolicy.description,
  alternates: { canonical: '/grievance' },
};

export default function Page() {
  return <LegalDocument doc={grievancePolicy} />;
}
