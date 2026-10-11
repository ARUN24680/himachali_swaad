import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

/**
 * Empty / error state block: icon medallion, serif title, helper text and an optional action.
 * `tone="error"` announces itself (role=alert) so screen-reader users hear failures.
 */
export function StateMessage({
  icon,
  title,
  description,
  action,
  tone = 'empty',
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'empty' | 'error';
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'mx-auto grid max-w-md justify-items-center gap-3 px-4 py-12 text-center',
        '[&_svg]:size-7',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-1 grid size-16 place-items-center rounded-full border',
          tone === 'error'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-border bg-muted text-accent-foreground',
        )}
      >
        {icon}
      </span>
      <h2 className="font-serif text-2xl font-medium text-foreground">{title}</h2>
      {description && <p className="text-pretty text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
