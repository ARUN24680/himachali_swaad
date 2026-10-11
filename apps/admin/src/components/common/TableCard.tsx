import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

interface TableCardProps {
  /** Controls bar: tabs, search, filters. */
  controls?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  label: string;
}

/** Tier 3 of the Nexus layout: one card holding the controls bar + data table / list. */
export function TableCard({ controls, footer, children, className, label }: TableCardProps) {
  return (
    <section
      aria-label={label}
      className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground', className)}
    >
      {controls && (
        <div className="flex flex-col gap-3 border-b border-border p-3 md:flex-row md:items-center md:justify-between md:p-4">
          {controls}
        </div>
      )}
      {children}
      {footer && <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{footer}</div>}
    </section>
  );
}
