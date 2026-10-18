import type { Metadata } from 'next';
import { LegalDocument, termsOfService } from '@/modules/content';

export const metadata: Metadata = {
  title: termsOfService.title,
  description: termsOfService.description,
  alternates: { canonical: '/terms' },
};

export default function Page() {
  return <LegalDocument doc={termsOfService} />;
}
