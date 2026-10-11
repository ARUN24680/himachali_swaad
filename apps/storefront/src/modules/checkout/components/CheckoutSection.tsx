import { cn } from '@pk/ui';
import type { ReactNode } from 'react';

/** Numbered checkout card ("1 Contact", "2 Delivery address" …). */
export function CheckoutSection({
  step,
  title,
  aside,
  className,
  children,
}: {
  step: number;
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = `checkout-step-${step}`;
  return (
    <section aria-labelledby={id} className={cn('rounded-lg border border-border bg-card p-4 sm:p-6', className)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-4">
        <h2 id={id} className="flex items-center gap-3 font-serif text-xl font-medium text-foreground">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-sans text-sm font-semibold text-primary-foreground tabular-nums"
          >
            {step}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
