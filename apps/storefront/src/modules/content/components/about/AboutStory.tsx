import { cn } from '@pk/ui';
import Image from 'next/image';
import type { ReactNode } from 'react';

interface Chapter {
  id: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  quote: ReactNode;
  image: { src: string; alt: string };
}

/** The original three paragraphs, unchanged in meaning, split into two image + pull-quote pairs. */
const CHAPTERS: Chapter[] = [
  {
    id: 'story-tradition',
    eyebrow: 'The tradition',
    title: 'In the hills, a pickle keeps the season.',
    body: (
      <>
        Chicken, mutton or river fish is cleaned, cooked down with garlic, ginger and sun-dried red chillies, then
        sealed under a layer of hot mustard oil.
      </>
    ),
    quote: (
      <>
        Done right, it keeps its bite — its <em>khatak</em> — for months.
      </>
    ),
    image: {
      src: '/home/pickle-texture.webp',
      alt: 'Close-up of slow-cooked meat pickle pieces glistening with spice and mustard oil',
    },
  },
  {
    id: 'story-kitchen',
    eyebrow: 'Our kitchen',
    title: 'Made the same way, in small batches.',
    body: (
      <>
        We make our pickles in small batches in a Himachal kitchen. Our kitchen partner cooks, matures, seals and packs
        every jar by hand — and the batch you order from is the batch you see on the product page.
      </>
    ),
    quote: (
      <>
        Small batches mean we sometimes run out. We would rather tell you a jar is sold out than ship one we
        wouldn&rsquo;t serve at home.
      </>
    ),
    image: {
      src: '/home/jar-lifestyle-culinary.webp',
      alt: 'Pahadi Khatki pickle served in a bronze bowl beside the jar',
    },
  },
];

/**
 * Editorial story: two chapters, each a photo paired with a short paragraph and a pull-quote.
 * Images alternate sides from 768 px; on phones the photo leads at a shorter 3:2 crop so the text
 * is never more than a thumb-scroll away.
 */
export function AboutStory() {
  return (
    <section aria-label="Our story" className="mx-auto grid max-w-6xl gap-12 px-4 py-12 md:gap-16 md:px-8 md:py-16">
      {CHAPTERS.map((c, i) => (
        <article
          key={c.id}
          aria-labelledby={c.id}
          className="grid items-center gap-6 md:grid-cols-12 md:gap-10 lg:gap-16"
        >
          <div
            className={cn(
              'relative aspect-3/2 overflow-hidden rounded-2xl bg-muted md:col-span-5 md:aspect-4/5',
              i % 2 === 1 && 'md:order-2 md:col-start-8',
            )}
          >
            <Image
              src={c.image.src}
              alt={c.image.alt}
              fill
              sizes="(min-width: 1152px) 440px, (min-width: 768px) 40vw, 100vw"
              className="object-cover object-[center_40%] md:object-center"
            />
          </div>

          <div className={cn('grid gap-5 md:col-span-7 lg:col-span-6', i % 2 === 0 && 'lg:col-start-7')}>
            <div className="grid gap-3">
              <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">
                <span className="font-mono tabular-nums" aria-hidden="true">
                  0{i + 1}
                </span>
                <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
                {c.eyebrow}
              </p>
              <h2
                id={c.id}
                className="font-serif text-3xl leading-tight font-medium text-balance text-foreground md:text-4xl"
              >
                {c.title}
              </h2>
            </div>
            <p className="max-w-prose text-base leading-relaxed text-pretty text-foreground/85 md:text-lg">{c.body}</p>
            <blockquote className="relative max-w-prose border-l-2 border-primary pl-5">
              <p className="font-serif text-xl leading-snug text-balance text-foreground italic md:text-2xl">
                {c.quote}
              </p>
            </blockquote>
          </div>
        </article>
      ))}
    </section>
  );
}
