import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const STEPS = [
  { title: 'Slow-simmered', line: 'Fresh meat, stone-ground spices, cooked low until tender.' },
  { title: 'Matured in mustard oil', line: 'Rested so the spice soaks into every piece.' },
  { title: 'Sealed & batch-coded', line: 'Glass jars, airtight lids, checked by hand.' },
  { title: 'Shipped from the hills', line: 'Packed leak-proof and sent across India.' },
];

/**
 * Story band: photo and text share one row (image aligned to the text block, no floating gap), the
 * CTA follows the paragraph, and the four craft steps become a compact vertical timeline.
 */
export function OriginStory() {
  return (
    <section aria-labelledby="origin-title" className="px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-2xl bg-secondary text-secondary-foreground lg:grid-cols-2">
        <div className="relative aspect-4/3 sm:aspect-video lg:aspect-auto lg:min-h-full">
          <Image
            src="/home/jar-lifestyle-culinary.webp"
            alt="Pahadi Khatki pickle served in a bronze kansa bowl beside the jar"
            fill
            sizes="(min-width: 1152px) 576px, (min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-secondary/60 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-secondary/40"
          />
        </div>

        <div className="grid content-center gap-5 p-6 sm:p-8 lg:p-12">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Our story</p>
          <h2 id="origin-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            &ldquo;Khatki&rdquo; is what the mountains call a pickle with bite.
          </h2>
          <p className="text-base leading-relaxed text-secondary-foreground/85">
            Hill families cooked meat down in mustard oil with garlic and sun-dried chillies to last the long Himachal
            winters. We keep that tradition — no shortcuts, no chemicals, just honest hill food.
          </p>
          <Link
            href="/about"
            className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
          >
            Read our story
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            />
          </Link>

          <ol aria-label="How a jar is made" className="mt-1 grid">
            {STEPS.map((s, i) => (
              <li key={s.title} className="group relative flex gap-4 pb-4 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute top-8 bottom-0 left-3.5 w-px bg-secondary-foreground/20 group-last:hidden"
                />
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground"
                >
                  {i + 1}
                </span>
                <div className="grid gap-0.5 pt-0.5">
                  <h3 className="text-sm font-semibold text-secondary-foreground">{s.title}</h3>
                  <p className="text-sm text-secondary-foreground/75">{s.line}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
