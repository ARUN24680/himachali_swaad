import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

/** Eyebrow + serif heading + optional lead, used by every storytelling section. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  as: Heading = 'h2',
  align = 'left',
  id,
  className,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  align?: 'left' | 'center';
  id?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'items-center text-center sm:flex-col sm:items-center',
        className,
      )}
    >
      <div className={cn('grid max-w-2xl gap-3', align === 'center' && 'justify-items-center')}>
        {eyebrow && (
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">{eyebrow}</p>
        )}
        <Heading
          id={id}
          className={cn(
            'font-serif font-medium text-balance text-foreground',
            Heading === 'h1' ? 'text-4xl leading-[1.1] md:text-5xl' : 'text-3xl leading-tight md:text-4xl',
          )}
        >
          {title}
        </Heading>
        {lead && <p className="text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
