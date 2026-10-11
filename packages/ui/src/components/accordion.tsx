'use client';

import { ChevronDown } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

/** Disclosure list (FAQ, product facts) on the Radix Accordion primitive — keyboard + ARIA built in. */
export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-b border-border last:border-b-0', className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex min-h-12 flex-1 items-center justify-between gap-4 rounded-md py-3 text-left text-base font-medium text-foreground transition-colors outline-none hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none!"
      {...props}
    >
      <div className={cn('pt-0 pb-4 leading-relaxed', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
