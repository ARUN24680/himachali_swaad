import { Ban, Droplets, Flame, Leaf, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';

const PILLARS: { icon: ReactNode; title: string; line: string }[] = [
  {
    icon: <Droplets />,
    title: 'Cold-pressed mustard oil',
    line: 'The Himalayan way to cook a pickle — and keep it fresh for months.',
  },
  {
    icon: <Leaf />,
    title: 'No added preservatives',
    line: 'Just coarse salt, whole spices, mustard oil and time.',
  },
  {
    icon: <Flame />,
    title: 'Hand-pounded Pahadi spices',
    line: 'Coriander, wild cumin, fenugreek and red chilli, roasted low and slow.',
  },
  {
    icon: <ScanLine />,
    title: 'Every jar batch-coded',
    line: 'Batch number, bottling date and best-before printed on each jar.',
  },
];

const NEVER = ['Sodium benzoate', 'Vinegar', 'Synthetic colour'];

/**
 * "Why us" — four short, scannable lines instead of four text-heavy cards, plus a "never in the jar"
 * strip so the "what goes in / what never will" promise reads at a glance.
 */
export function PillarsSection() {
  return (
    <section aria-labelledby="pillars-title" className="border-y border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:px-8 md:py-16 lg:grid-cols-12 lg:gap-12">
        <div className="grid content-start gap-3 lg:col-span-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">
            The Himalayan standard
          </p>
          <h2 id="pillars-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            What goes into every jar
          </h2>
          <p className="text-base text-muted-foreground">…and what never will.</p>
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

        <ol className="grid gap-x-10 sm:grid-cols-2 lg:col-span-8">
          {PILLARS.map((p, i) => (
            <li
              key={p.title}
              className="group flex gap-4 border-t border-border py-5 first:border-t-0 first:pt-0 sm:nth-2:border-t-0 sm:nth-2:pt-0"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-accent-foreground ring-1 ring-border transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary motion-reduce:transition-none [&_svg]:size-5"
              >
                {p.icon}
              </span>
              <div className="grid gap-1">
                <h3 className="flex items-baseline gap-2 font-serif text-lg font-medium text-foreground">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums" aria-hidden="true">
                    0{i + 1}
                  </span>
                  {p.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
