import type { Metadata } from 'next';
import { ContactContent } from '@/modules/content';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Customer care phone, email, WhatsApp, registered address and grievance officer.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return <ContactContent />;
}
