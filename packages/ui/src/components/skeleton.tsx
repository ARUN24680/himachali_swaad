import type * as React from 'react';
import { cn } from '../lib/utils';

/** Loading placeholder — decorative; wrap groups in an element with role="status" + label. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
