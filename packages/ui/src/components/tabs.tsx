'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

export const Tabs = TabsPrimitive.Root;

/** Pill-style segmented tabs; scrolls horizontally inside itself on narrow screens. */
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex max-w-full items-center gap-1.5 overflow-x-auto', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-secondary data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('outline-none', className)} {...props} />;
}
