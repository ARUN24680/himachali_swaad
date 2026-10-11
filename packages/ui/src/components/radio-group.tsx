'use client';

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid gap-2', className)} {...props} />;
}

/**
 * Large tappable option card (≥ 44px) — faster than a dropdown for short lists on phones.
 * Arrow keys move between options (Radix roving focus).
 */
export function RadioCard({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        'relative flex min-h-11 w-full items-center gap-3 rounded-lg border border-input bg-background px-3.5 py-2.5 text-left text-sm text-foreground transition-colors outline-none hover:bg-accent',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'data-[state=checked]:border-ring data-[state=checked]:bg-accent data-[state=checked]:ring-1 data-[state=checked]:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background',
        className,
      )}
      {...props}
    />
  );
}

/** Explicit selection dot for a RadioCard (place it inside the card). */
export function RadioDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4.5 shrink-0 place-items-center rounded-full border-2 border-input in-data-[state=checked]:border-ring',
        className,
      )}
    >
      <span className="size-2 scale-0 rounded-full bg-ring transition-transform in-data-[state=checked]:scale-100 motion-reduce:transition-none" />
    </span>
  );
}
