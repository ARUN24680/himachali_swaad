import { Label, cn } from '@pk/ui';
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface FormFieldProps {
  label: ReactNode;
  /** The control — receives id, aria-invalid and aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  className?: string;
  /** Extra trailing content on the label row (e.g. a counter). */
  aside?: ReactNode;
}

/** Label + control + hint/error with the a11y wiring done once. */
export function FormField({ label, children, hint, error, optional, className, aside }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        ...(error ? { 'aria-invalid': true } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })
    : children;
  const controlId = (isValidElement(children) && (children.props.id as string | undefined)) || id;

  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={controlId}>
          {label}
          {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
        </Label>
        {aside}
      </div>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
