import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../lib/utils';

export const alertVariants = cva(
  'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        info: 'border-info/30 bg-info/10 text-info',
        success: 'border-success/30 bg-success/10 text-success',
        neutral: 'border-border bg-muted text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface AlertProps extends React.ComponentProps<'div'>, VariantProps<typeof alertVariants> {}

/**
 * Inline message. Errors default to role="alert" so screen readers announce them; pass `role`
 * explicitly to override (e.g. role="status" for success).
 */
export function Alert({ className, tone, role, ...props }: AlertProps) {
  const resolvedRole = role ?? (tone === 'destructive' || tone === 'warning' ? 'alert' : 'status');
  return <div data-slot="alert" role={resolvedRole} className={cn(alertVariants({ tone }), className)} {...props} />;
}
