import { Droplets, Leaf, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from '@/components/common/SectionHeading';

const PILLARS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Droplets />,
    title: 'Cold-pressed mustard oil',
    body: 'Every jar is cooked and preserved in pungent cold-pressed mustard oil — the oil Himachali kitchens trust to keep a pickle good for months.',
  },
  {
    icon: <Leaf />,
    title: 'No added preservatives',
    body: 'Salt, spice, mustard oil and patience do the work — the old way of keeping meat through a mountain winter.',
  },
  {
    icon: <ScanLine />,
    title: 'Every jar batch-coded',
    body: 'Each batch carries its own code, manufacture date and best-before. We only ship jars with plenty of shelf life left.',
  },
];

export function PillarsSection() {
  return (
    <section aria-labelledby="pillars-title" className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
      <SectionHeading
        id="pillars-title"
        eyebrow="Our promise"
        title="Three pillars of purity"
        lead="What goes into a Pahadi Khatki jar — and what never does."
        align="center"
      />
      <ol className="mt-10 grid gap-5 md:mt-14 md:grid-cols-3 md:gap-6">
        {PILLARS.map((p, i) => (
          <li key={p.title} className="relative grid gap-3 rounded-lg border border-border bg-card p-6 md:p-7">
            <span
              aria-hidden="true"
              className="absolute top-5 right-6 font-serif text-4xl text-muted-foreground tabular-nums"
            >
              0{i + 1}
            </span>
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5.5"
            >
              {p.icon}
            </span>
            <h3 className="font-serif text-xl font-medium text-foreground">{p.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
