import type * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Determinate progress bar on the native <progress> element (accessible by default, no inline
 * styles — Rules §1.2). Pass `value` 0–100 and an `aria-label`.
 */
export function Progress({ className, value, max = 100, ...props }: React.ComponentProps<'progress'>) {
  return (
    <progress
      data-slot="progress"
      value={value}
      max={max}
      className={cn(
        'block h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted',
        '[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-[width]',
        '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary',
        className,
      )}
      {...props}
    />
  );
}
