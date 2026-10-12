import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

interface TableCardProps {
  /** Controls bar: segmented status pills (left) + search / filters (right). */
  controls?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  label: string;
}

/**
 * Tier 3 of the Nexus layout (Phase 9 §9.1): ONE card — controls bar → table / card list.
 * The body bleeds to the card edges (negative margin) so tables and lists never get a second
 * padded wrapper ("no nested wrapper padding"); a wide table scrolls inside its own container.
 */
export function TableCard({ controls, footer, children, className, label }: TableCardProps) {
  return (
    <section
      aria-label={label}
      data-testid="table-card"
      className={cn(
        'min-w-0 space-y-4 overflow-hidden rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm',
        className,
      )}
    >
      {controls && (
        <div
          data-slot="controls-bar"
          className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:[&>*:last-child:not(:first-child)]:ml-auto"
        >
          {controls}
        </div>
      )}
      <div data-slot="table-card-body" className={cn('-mx-5 -mb-5 min-w-0', controls && 'border-t border-border')}>
        {children}
        {footer && <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">{footer}</div>}
      </div>
    </section>
  );
}
