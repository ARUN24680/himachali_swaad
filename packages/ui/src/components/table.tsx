import type * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Data table. The wrapper owns horizontal scrolling so a wide table never makes the page
 * overflow (Rules §1.1). Give it an `aria-label` / caption for screen readers.
 */
export function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div data-slot="table-container" className={cn('relative w-full overflow-x-auto', containerClassName)}>
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('bg-muted/50 [&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors hover:bg-accent/50 data-[state=selected]:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-11 px-4 text-left align-middle text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('px-4 py-3 align-middle', className)} {...props} />;
}

export function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  );
}
