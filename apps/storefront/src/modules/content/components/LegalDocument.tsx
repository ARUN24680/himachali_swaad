import { CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { policy } from '@/config/site';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export interface LegalDoc {
  title: string;
  description: string;
  intro: ReactNode;
  sections: LegalSection[];
}

/**
 * Long-form policy layout: sticky table of contents on desktop, readable 65ch measure, anchor links.
 * Copy is a working draft grounded in our decisions log — facts tied to open questions render "Pending".
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <header className="grid max-w-3xl gap-3 border-b border-border pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">Policies</p>
        <h1 className="font-serif text-4xl leading-tight font-medium text-foreground md:text-5xl">{doc.title}</h1>
        <div className="text-base leading-relaxed text-muted-foreground md:text-lg">{doc.intro}</div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-4" />
          Last updated: <PendingValue value={policy.lastUpdated} label="Last updated date" />
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-14">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-foreground uppercase">On this page</p>
          <ol className="grid gap-0.5 border-l border-border text-sm">
            {doc.sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px flex min-h-11 items-center border-l-2 border-transparent pl-3 text-muted-foreground outline-none hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                >
                  <span className="mr-2 tabular-nums">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid max-w-[68ch] gap-10">
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
              <h2 id={`${s.id}-title`} className="mb-3 font-serif text-2xl font-medium text-foreground">
                <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                {s.title}
              </h2>
              <div className="grid gap-3 leading-relaxed text-foreground/90 [&_a]:font-medium [&_a]:text-accent-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
