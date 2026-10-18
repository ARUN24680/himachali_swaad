import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@pk/ui';
import { ArrowRight, CookingPot, Soup, Sparkles, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FAQ_GROUPS } from '@/modules/content';

const IDEAS: { icon: ReactNode; title: string; line: string }[] = [
  {
    icon: <UtensilsCrossed />,
    title: 'With hot parathas or rotis',
    line: 'A spoonful on the side; let the oil soak in.',
  },
  { icon: <Soup />, title: 'With dal-chawal', line: 'Lifts the simplest home meal.' },
  { icon: <CookingPot />, title: 'On a festive thali', line: 'A small bowl next to the mains.' },
];

/** Picked from the real FAQ copy (single source: content module) so the teaser never drifts. */
const TEASER_QUESTIONS = [
  'How long does a jar last?',
  'How should I store it once opened?',
  'Do you offer cash on delivery?',
  'Do I need an account to order?',
];
const TEASER = FAQ_GROUPS.flatMap((g) => g.items).filter((item) => TEASER_QUESTIONS.includes(item.q));

/**
 * Replaces the sample testimonials (pre-launch: no real reviews yet, reviews are v2). Two useful,
 * claim-free blocks: serving ideas and the most-asked questions.
 */
export function EnjoySection() {
  return (
    <section aria-labelledby="enjoy-title" className="mx-auto max-w-6xl px-4 pt-4 pb-16 md:px-8 md:pb-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">At the table</p>
            <h2 id="enjoy-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
              How to enjoy it
            </h2>
          </div>
          <ul className="grid gap-3">
            {IDEAS.map((idea) => (
              <li
                key={idea.title}
                className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors duration-300 hover:border-primary/50 motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none [&_svg]:size-5"
                >
                  {idea.icon}
                </span>
                <div>
                  <h3 className="font-medium text-foreground">{idea.title}</h3>
                  <p className="text-sm text-muted-foreground">{idea.line}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
            Himachali pickles are bold — start with a little.
          </p>
        </div>

        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">Good to know</p>
            <h2 className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">Common questions</h2>
          </div>
          <Accordion type="single" collapsible className="rounded-lg border border-border bg-card px-4">
            {TEASER.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent className="text-base text-foreground/85">{item.text}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <Link
            href="/faq"
            className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Read all FAQs
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
