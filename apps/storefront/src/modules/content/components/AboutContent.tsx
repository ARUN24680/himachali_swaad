import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, Droplets, Leaf, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { MountainRidges } from '@/components/common/MountainRidges';

const VALUES = [
  {
    icon: <Droplets />,
    title: 'Mustard oil, never shortcuts',
    body: 'Cold-pressed mustard oil is both the cooking medium and the preservative — just as it has always been in the hills.',
  },
  {
    icon: <Leaf />,
    title: 'No added preservatives',
    body: 'Salt, spice, oil and time. If our grandmothers wouldn’t recognise an ingredient, it doesn’t go in the jar.',
  },
  {
    icon: <ScanLine />,
    title: 'Honest about every batch',
    body: 'Each jar carries a batch code, manufacture date and best-before date, and we show the batch that’s shipping right now.',
  },
];

export function AboutContent() {
  return (
    <>
      <section
        aria-labelledby="about-title"
        className="relative isolate overflow-hidden bg-secondary text-secondary-foreground"
      >
        <div className="mx-auto grid max-w-3xl gap-5 px-4 pt-14 pb-36 text-center md:px-8 md:pt-20 md:pb-48">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Our story</p>
          <h1 id="about-title" className="font-serif text-4xl leading-tight font-medium text-balance md:text-5xl">
            A Himachal kitchen, a jar at a time
          </h1>
          <p className="text-base leading-relaxed text-secondary-foreground/85 md:text-lg">
            Pahadi Khatki began with recipes that were never written down — the meat pickles Himachali families make
            before winter closes the passes.
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-32 md:h-48" aria-hidden="true">
          <MountainRidges />
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl gap-5 px-4 py-14 text-lg leading-relaxed text-foreground/90 md:px-8 md:py-20">
        <p>
          In the hills, a good pickle is a way of keeping the season. Chicken, mutton or river fish is cleaned, cooked
          down with garlic, ginger and sun-dried red chillies, then sealed under a layer of hot mustard oil. Done right,
          it keeps its bite — its <em>khatak</em> — for months.
        </p>
        <p>
          We make our pickles the same way, in small batches in a Himachal kitchen. Our kitchen partner cooks, matures,
          seals and packs every jar by hand; the batch you order from is the batch you see on the product page.
        </p>
        <p>
          Small batches mean we sometimes run out. We would rather tell you a jar is sold out than ship one we
          wouldn&rsquo;t serve at home.
        </p>
      </section>

      <section aria-labelledby="values-title" className="mx-auto max-w-6xl px-4 pb-16 md:px-8 md:pb-24">
        <h2 id="values-title" className="sr-only">
          What we stand for
        </h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {VALUES.map((v) => (
            <li key={v.title} className="grid gap-3 rounded-lg border border-border bg-card p-6">
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5.5"
              >
                {v.icon}
              </span>
              <h3 className="font-serif text-xl font-medium text-foreground">{v.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{v.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex justify-center">
          <Link href="/products" className={cn(buttonVariants({ size: 'lg' }))}>
            Taste the Mountains
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
