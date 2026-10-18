import { CookingPot, Droplets, Hourglass, PackageCheck } from 'lucide-react';
import type { ReactNode } from 'react';

/** The four verbs from the story copy ("cooks, matures, seals and packs") — no durations or counts. */
const STEPS: { icon: ReactNode; title: string; line: string }[] = [
  {
    icon: <CookingPot />,
    title: 'Cooked down',
    line: 'Meat or fish, cleaned and cooked with garlic, ginger and sun-dried red chillies.',
  },
  {
    icon: <Hourglass />,
    title: 'Matured',
    line: 'Rested so the spice soaks into every piece.',
  },
  {
    icon: <Droplets />,
    title: 'Sealed in mustard oil',
    line: 'A layer of hot mustard oil seals the jar — the hill way of keeping a pickle.',
  },
  {
    icon: <PackageCheck />,
    title: 'Batch-coded & packed',
    line: 'Batch code, manufacture and best-before dates on every jar, packed by hand.',
  },
];

/**
 * Compact timeline: a vertical rail on phones, a horizontal rail with four stops from 1024 px.
 * 2×2 at tablet width. Sits on the same muted band as the home "What goes into every jar" section for rhythm.
 */
export function AboutProcess() {
  return (
    <section id="process" aria-labelledby="process-title" className="scroll-mt-20 border-y border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:gap-10 md:px-8 md:py-16">
        <div className="grid max-w-2xl gap-3">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">From pot to parcel</p>
          <h2 id="process-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            How a jar is made
          </h2>
        </div>

        <ol className="grid gap-0 md:grid-cols-2 md:gap-x-8 md:gap-y-8 lg:grid-cols-4 lg:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="group relative flex gap-4 pb-7 last:pb-0 md:pb-0 lg:block">
              {/* Rail: vertical on phones, none in the 2×2 tablet grid, horizontal from lg (runs to the next stop) */}
              <span
                aria-hidden="true"
                className="absolute top-12 bottom-0 left-5.5 w-px bg-border group-last:hidden md:hidden lg:top-5.5 lg:right-[-1.5rem] lg:bottom-auto lg:left-12 lg:block lg:h-px lg:w-auto lg:group-last:hidden"
              />
              <span
                aria-hidden="true"
                className="relative grid size-11 shrink-0 place-items-center rounded-full bg-card text-accent-foreground ring-1 ring-border transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary motion-reduce:transition-none [&_svg]:size-5"
              >
                {s.icon}
              </span>
              <div className="grid gap-1 pt-1 lg:mt-4 lg:pt-0">
                <h3 className="flex items-baseline gap-2 font-serif text-lg font-medium text-foreground">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    <span className="sr-only">Step </span>0{i + 1}
                  </span>
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
