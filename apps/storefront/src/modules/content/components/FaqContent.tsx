import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@pk/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SectionHeading } from '@/components/common/SectionHeading';

export const FAQ_GROUPS: { title: string; items: { q: string; a: ReactNode; text: string }[] }[] = [
  {
    title: 'Storage & shelf life',
    items: [
      {
        q: 'How long does a jar last?',
        text: 'Each product page shows its shelf life and the best-before date of the batch currently shipping. The same dates are printed on every jar.',
        a: 'Each product page shows its shelf life and the best-before date of the batch currently shipping. The same dates are printed on every jar.',
      },
      {
        q: 'How should I store it once opened?',
        text: 'Always use a clean, dry spoon, close the lid tightly and keep the jar in a cool, dry place away from sunlight. Keep the pieces under the oil layer. Follow any extra instructions on the label.',
        a: 'Always use a clean, dry spoon, close the lid tightly and keep the jar in a cool, dry place away from sunlight. Keep the pieces under the oil layer. Follow any extra instructions on the label.',
      },
      {
        q: 'What do the batch code and dates mean?',
        text: 'Every batch gets a code like PK-2610-CHK250-01 along with its manufacture and best-before dates, so each jar can be traced to the day it was made. We only ship jars with a healthy shelf life left.',
        a: 'Every batch gets a code like PK-2610-CHK250-01 along with its manufacture and best-before dates, so each jar can be traced to the day it was made. We only ship jars with a healthy shelf life left.',
      },
    ],
  },
  {
    title: 'The pickles',
    items: [
      {
        q: 'Are these pickles vegetarian?',
        text: 'No. Every Pahadi Khatki product is non-vegetarian and carries the brown non-veg mark.',
        a: 'No. Every Pahadi Khatki product is non-vegetarian and carries the brown non-veg mark.',
      },
      {
        q: 'How spicy are they?',
        text: 'Each product page shows a spice level from 1 to 5 where available. Himachali pickles are bold — start with a little.',
        a: 'Each product page shows a spice level from 1 to 5 where available. Himachali pickles are bold — start with a little.',
      },
      {
        q: 'Do you add preservatives?',
        text: 'No added preservatives — mustard oil, salt and spices keep the pickle. Full ingredients and allergens are listed on each product page.',
        a: 'No added preservatives — mustard oil, salt and spices keep the pickle. Full ingredients and allergens are listed on each product page.',
      },
    ],
  },
  {
    title: 'Orders, payment & delivery',
    items: [
      {
        q: 'Do you offer cash on delivery?',
        text: 'Not at the moment. We accept prepaid orders only — UPI, cards and netbanking.',
        a: 'Not at the moment. We accept prepaid orders only — UPI, cards and netbanking.',
      },
      {
        q: 'Do I need an account to order?',
        text: 'No. You can check out as a guest. Signing in with your mobile number is optional and lets you see past orders and saved addresses.',
        a: 'No. You can check out as a guest. Signing in with your mobile number is optional and lets you see past orders and saved addresses.',
      },
      {
        q: 'Do you deliver to my pincode?',
        text: 'Enter your pincode on any product page to check delivery and the estimated time.',
        a: (
          <>
            Enter your pincode on any <Link href="/products">product page</Link> to check delivery and the estimated
            time.
          </>
        ),
      },
      {
        q: 'My jar arrived damaged. What now?',
        text: 'Sorry about that! Contact us with your order code and photos and we will replace or refund it as per our refund policy.',
        a: (
          <>
            Sorry about that! Contact us with your order code and photos and we will replace or refund it — see our{' '}
            <Link href="/refund-cancellation">refund &amp; cancellation policy</Link>.
          </>
        ),
      },
      {
        q: 'Can I return a jar I didn’t like?',
        text: 'Food can’t be returned once delivered for hygiene reasons, but damaged or wrong items are always replaced or refunded.',
        a: 'Food can’t be returned once delivered for hygiene reasons, but damaged or wrong items are always replaced or refunded.',
      },
    ],
  },
];

export function FaqContent() {
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-4 py-10 md:px-8 md:py-14">
      <SectionHeading
        as="h1"
        eyebrow="Help"
        title="Frequently asked questions"
        lead={
          <>
            Can&rsquo;t find your answer?{' '}
            <Link href="/contact" className="font-medium text-accent-foreground underline underline-offset-4">
              Contact us
            </Link>
            .
          </>
        }
      />
      {FAQ_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title} className="grid gap-2">
          <h2 className="font-serif text-2xl font-medium text-foreground">{group.title}</h2>
          <Accordion type="multiple" className="rounded-lg border border-border bg-card px-4">
            {group.items.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent className="text-base text-foreground/85 [&_a]:font-medium [&_a]:text-accent-foreground [&_a]:underline [&_a]:underline-offset-4">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
    </div>
  );
}
