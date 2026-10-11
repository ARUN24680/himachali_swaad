import type { Metadata } from 'next';
import { JsonLd } from '@/components/common/JsonLd';
import { FAQ_GROUPS, FaqContent } from '@/modules/content';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Storage, shelf life, delivery, payment and refunds — answers to common questions.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  return (
    <>
      <FaqContent />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ_GROUPS.flatMap((g) => g.items).map((i) => ({
            '@type': 'Question',
            name: i.q,
            acceptedAnswer: { '@type': 'Answer', text: i.text },
          })),
        }}
      />
    </>
  );
}
