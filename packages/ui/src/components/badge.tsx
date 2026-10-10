import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../lib/utils';

/** Tones map 1:1 to semantic tokens (Rules §1.4). Order/batch statuses go through StatusBadge. */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'border-success/30 bg-success/15 text-success',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        info: 'border-info/30 bg-info/15 text-info',
        destructive: 'border-destructive/30 bg-destructive/15 text-destructive',
        neutral: 'border-border bg-muted text-muted-foreground',
        batch: 'border-tertiary/30 bg-tertiary/15 font-medium tracking-[0.06em] text-tertiary uppercase tabular-nums',
        primary: 'border-transparent bg-primary text-primary-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
