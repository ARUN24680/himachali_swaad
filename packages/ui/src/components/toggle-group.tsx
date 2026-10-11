'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Segmented single-choice control (e.g. 250 g / 500 g jar) on the Radix ToggleGroup primitive —
 * roving focus with arrow keys, `aria-pressed` per option. Items are 44px tall (Rules §1.1).
 */
export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn('inline-flex w-full items-stretch gap-1 rounded-lg border border-border bg-muted p-1', className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        'data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-float data-[state=on]:ring-1 data-[state=on]:ring-border',
        className,
      )}
      {...props}
    />
  );
}
