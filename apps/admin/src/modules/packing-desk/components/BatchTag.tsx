import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

/** Batch code stamp (Rules §1.4 batch tag) — big enough to match against the jar's dater stamp. */
export function BatchTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border border-tertiary/30 bg-tertiary/15 px-2 py-1 font-mono text-base font-semibold tracking-wide text-tertiary tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}
