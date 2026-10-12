import { Button, Skeleton } from '@pk/ui';
import { AlertTriangle, RotateCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Friendly empty state with an icon, explanation and an optional next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-12 text-center md:py-16">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-muted text-accent-foreground [&_svg]:size-6"
      >
        <Icon />
      </span>
      <div className="grid max-w-sm gap-1">
        <h2 className="font-serif text-xl font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Inline error for a failed query, with retry. */
export function ErrorState({
  title = 'Couldn’t load this',
  message,
  onRetry,
  retrying,
  retryLabel = 'Try again',
}: {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** Translated label for the retry button (Packing Desk i18n). */
  retryLabel?: string;
}) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 px-4 py-12 text-center md:py-16">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-destructive/15 text-destructive [&_svg]:size-6"
      >
        <AlertTriangle />
      </span>
      <div className="grid max-w-sm gap-1">
        <h2 className="font-serif text-xl font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{message ?? 'Check your connection and try again.'}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} disabled={retrying}>
          <RotateCw className={retrying ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** Skeleton rows for a list/table while the first page loads. */
export function ListSkeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="size-12 shrink-0 rounded-md" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-6 w-16 sm:block" />
          <Skeleton className="hidden h-6 w-20 md:block" />
        </div>
      ))}
    </div>
  );
}
