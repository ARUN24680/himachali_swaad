import { Droplets, Flame, Leaf, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from '@/components/common/SectionHeading';

const PILLARS: {
  icon: ReactNode;
  tag: string;
  title: string;
  body: string;
}[] = [
  {
    icon: <Droplets className="size-5" />,
    tag: 'Purity First',
    title: 'Cold-Pressed Mustard Oil',
    body: 'Every jar is cooked and preserved in pure cold-pressed mustard oil — the time-tested Himalayan secret that keeps pickle naturally fresh for months.',
  },
  {
    icon: <Leaf className="size-5" />,
    tag: '100% Clean',
    title: 'Zero Artificial Preservatives',
    body: 'No sodium benzoate, no vinegar dilutions, no synthetic colours. Just coarse mountain salt, whole spices, mustard oil, and natural maturation.',
  },
  {
    icon: <Flame className="size-5" />,
    tag: 'Stone-Ground',
    title: 'Hand-Pounded Pahadi Spices',
    body: 'Whole coriander seeds, wild cumin, mountain fenugreek, and crushed dried red chillies roasted over low heat to lock in deep earthy aroma.',
  },
  {
    icon: <ScanLine className="size-5" />,
    tag: 'Transparency',
    title: 'Every Jar Batch-Coded',
    body: 'Each glass jar carries its verifiable batch number, bottling date, and expiry. We only dispatch fresh stock with maximum shelf life.',
  },
];

export function PillarsSection() {
  return (
    <section aria-labelledby="pillars-title" className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
      <SectionHeading
        id="pillars-title"
        eyebrow="The Himalayan Standard"
        title="Four Pillars of Authentic Craft"
        lead="What goes into every Pahadi Khatki jar — and what never will."
        align="center"
      />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((p, i) => (
          <div
            key={p.title}
            className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-float"
          >
            {/* Top decorative accent line */}
            <div
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground shadow-sm">
                  {p.icon}
                </span>
                <span className="font-mono text-xs font-semibold text-muted-foreground tabular-nums">0{i + 1}</span>
              </div>

              <span className="mt-4 inline-block text-[11px] font-semibold tracking-wider text-accent-foreground uppercase">
                {p.tag}
              </span>
              <h3 className="mt-1 font-serif text-lg font-medium text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
