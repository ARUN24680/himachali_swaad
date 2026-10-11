import { Badge, cn } from '@pk/ui';
import { CircleDashed } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Renders a seller/policy fact, or a clearly visible "Pending" marker when it hasn't been decided yet
 * (src/config/site.ts). Business identifiers are never guessed.
 */
export function PendingValue({
  value,
  label,
  children,
  className,
}: {
  value: string | null;
  /** What is pending, for screen readers ("GSTIN pending"). */
  label: string;
  /** Custom rendering of a present value (e.g. a mailto link). */
  children?: (value: string) => ReactNode;
  className?: string;
}) {
  if (value !== null) return <span className={className}>{children ? children(value) : value}</span>;
  return (
    <Badge tone="warning" className={cn('w-fit align-middle', className)} data-pending={label}>
      <CircleDashed aria-hidden="true" className="size-3" />
      Pending<span className="sr-only">: {label} not yet published</span>
    </Badge>
  );
}
