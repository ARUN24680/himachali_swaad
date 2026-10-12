import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

/** Card-like section with a heading — one block per task on desk screens. */
export function DeskSection({
  title,
  aside,
  children,
  className,
  headingLevel = 2,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={cn('grid gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="font-serif text-xl font-semibold">{title}</Heading>
        {aside}
      </div>
      {children}
    </section>
  );
}
