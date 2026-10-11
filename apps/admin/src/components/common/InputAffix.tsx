import { Input, cn } from '@pk/ui';
import type * as React from 'react';

/** Input with a fixed prefix/suffix (₹, %, g, cm) that stays inside the field border. */
export function InputAffix({
  prefix,
  suffix,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { prefix?: string; suffix?: string }) {
  return (
    <div className="relative">
      {prefix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground"
        >
          {prefix}
        </span>
      )}
      <Input className={cn('tabular-nums', prefix && 'pl-8', suffix && 'pr-12', className)} {...props} />
      {suffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
