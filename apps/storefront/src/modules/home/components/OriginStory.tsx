import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { MountainRidges } from '@/components/common/MountainRidges';

const STEPS = [
  {
    title: 'Cooked slow',
    body: 'Meat is cleaned, marinated and slow-cooked with hand-pounded spices in our Himachal kitchen.',
  },
  { title: 'Matured in oil', body: 'Each batch rests in mustard oil until the masala has soaked all the way through.' },
  {
    title: 'Sealed & coded',
    body: 'Jars are sealed, labelled with batch code and dates, and packed by the same hands.',
  },
  { title: 'Shipped prepaid', body: 'Tracked courier from the hills to your door, anywhere we deliver in India.' },
];

/** Origin story band — editorial deep-pine block on desktop, stacked on phones. */
export function OriginStory() {
  return (
    <section aria-labelledby="origin-title" className="px-4 md:px-8">
      <div className="relative isolate mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-xl bg-secondary px-6 pt-12 pb-28 text-secondary-foreground md:grid-cols-2 md:px-12 md:pt-16 md:pb-32">
        <div className="grid content-start gap-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Our origin</p>
          <h2 id="origin-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            &ldquo;Khatki&rdquo; is what the hills call a pickle with bite.
          </h2>
          <p className="leading-relaxed text-secondary-foreground/85">
            In Himachal, winters are long and nothing is wasted. Meat was cooked down with mustard oil, garlic and
            sun-dried chillies so it would last until the passes opened again. We make our pickles the same way — in a
            small kitchen in the hills, a few jars at a time.
          </p>
          <Link
            href="/about"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'w-fit border-secondary-foreground/30 text-secondary-foreground hover:bg-secondary-foreground/10',
            )}
          >
            Read our story
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ol className="grid gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-full border border-primary/50 font-serif text-lg text-primary tabular-nums"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-sans text-base font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-secondary-foreground/80">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 opacity-60" aria-hidden="true">
          <MountainRidges showSun={false} className="[&_path:last-child]:fill-secondary" />
        </div>
      </div>
    </section>
  );
}
