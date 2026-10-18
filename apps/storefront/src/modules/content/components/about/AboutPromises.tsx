import { Ban, Droplets, Leaf, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';

const PROMISES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Droplets />,
    title: 'Mustard oil, never shortcuts',
    body: 'Cold-pressed mustard oil is both the cooking medium and the preservative — just as it has always been in the hills.',
  },
  {
    icon: <Leaf />,
    title: 'No added preservatives',
    body: 'Salt, spice, oil and time. If a hill kitchen wouldn’t use an ingredient, it doesn’t go in the jar.',
  },
  {
    icon: <ScanLine />,
    title: 'Honest about every batch',
    body: 'Each jar carries a batch code, manufacture date and best-before date, and we show the batch that’s shipping right now.',
  },
];

/** Same list as the home page's "never in the jar" strip — keep the two in step. */
const NEVER = ['Sodium benzoate', 'Vinegar', 'Synthetic colour'];

/** Values: heading + "never in the jar" chips on the left, three promises as scannable rows on the right. */
export function AboutPromises() {
  return (
    <section aria-labelledby="promises-title" className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="grid content-start gap-3 lg:col-span-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">What we stand for</p>
          <h2 id="promises-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            Three promises in every jar
          </h2>
          <p className="text-base text-muted-foreground">…and what never goes in it.</p>
          <ul aria-label="Never in the jar" className="mt-2 flex flex-wrap gap-2">
            {NEVER.map((n) => (
              <li
                key={n}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"
              >
                <Ban className="size-3.5 text-tertiary" aria-hidden="true" />
                <span className="sr-only">No </span>
                {n}
              </li>
            ))}
          </ul>
        </div>

        <ul className="grid divide-y divide-border rounded-2xl border border-border bg-card lg:col-span-8">
          {PROMISES.map((p) => (
            <li key={p.title} className="group flex gap-4 p-5 sm:gap-5 sm:p-6">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none [&_svg]:size-5"
              >
                {p.icon}
              </span>
              <div className="grid gap-1">
                <h3 className="font-serif text-lg font-medium text-foreground md:text-xl">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
