'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Visual track is 24px tall; the ::before pad grows the hit area to 44px (Rules §1.1)
        'peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-input bg-muted transition-colors outline-none before:absolute before:-inset-2.5 before:content-[""]',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-secondary data-[state=checked]:bg-secondary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4.5 translate-x-0.5 rounded-full bg-card shadow-float ring-1 ring-border transition-transform data-[state=checked]:translate-x-5.5 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}
