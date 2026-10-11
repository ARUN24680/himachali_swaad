import type * as React from 'react';
import { cn } from '../lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full min-w-0 rounded-lg border border-input bg-background px-3.5 py-2.5 text-base text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}
