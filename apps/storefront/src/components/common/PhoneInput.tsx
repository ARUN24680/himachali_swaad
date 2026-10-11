'use client';

import { cn } from '@pk/ui';
import type * as React from 'react';
import { toNationalDigits } from '@/lib/phone';

/**
 * Indian mobile input: fixed +91 prefix, 10 national digits, numeric keypad. Accepts pasted
 * "+91 98765-43210" / "098765 43210". The value is the 10 digits; callers add +91 for E.164.
 */
export function PhoneInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onValueChange: (digits: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex h-11 w-full items-stretch overflow-hidden rounded-lg border border-input bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 has-disabled:opacity-50 has-aria-invalid:border-destructive',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex items-center border-r border-border bg-muted px-3 text-base font-medium text-muted-foreground tabular-nums md:text-sm"
      >
        +91
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        maxLength={16}
        value={value}
        onChange={(e) => onValueChange(toNationalDigits(e.target.value))}
        className="w-full min-w-0 bg-transparent px-3.5 text-base tracking-wide text-foreground tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
        {...props}
      />
    </div>
  );
}
