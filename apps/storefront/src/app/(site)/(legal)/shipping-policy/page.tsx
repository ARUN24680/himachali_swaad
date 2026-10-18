import type { Metadata } from 'next';
import { LegalDocument, shippingPolicy } from '@/modules/content';

export const metadata: Metadata = {
  title: shippingPolicy.title,
  description: shippingPolicy.description,
  alternates: { canonical: '/shipping-policy' },
};

export default function Page() {
  return <LegalDocument doc={shippingPolicy} />;
}
