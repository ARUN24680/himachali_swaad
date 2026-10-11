import { Label, cn } from '@pk/ui';
import type { ReactNode } from 'react';

/**
 * Label + control + hint/error, wired for screen readers: the control gets `aria-describedby` and
 * `aria-invalid` from `controlProps(id)`. Errors replace the hint and are announced (role=alert).
 */
export function FormField({
  id,
  label,
  optional = false,
  required = false,
  hint,
  error,
  aside,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  optional?: boolean;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Right-aligned content on the label row (e.g. "Auto-filled"). */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <div className="flex min-h-5 items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
          )}
        </Label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** Spread onto the control inside a FormField with the same id. */
export function fieldAria(id: string, error: string | undefined, hasHint: boolean) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}
