import { Button } from '@pk/ui';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

/** Whole-screen loading / error state used before the shell can render (guards, boot). */
export function FullPageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-background px-4 text-muted-foreground">
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>{label}…</span>
      </div>
    </div>
  );
}

interface FullPageErrorProps {
  title: string;
  message: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  actions?: ReactNode;
}

export function FullPageError({ title, message, onRetry, retrying, actions }: FullPageErrorProps) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div
        role="alert"
        className="grid w-full max-w-md gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground"
      >
        <span className="grid size-11 place-items-center rounded-full bg-warning/15 text-warning [&_svg]:size-5">
          <AlertTriangle aria-hidden="true" />
        </span>
        <div className="grid gap-1.5">
          <h1 className="font-serif text-2xl font-medium">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRetry && (
            <Button onClick={onRetry} disabled={retrying}>
              <RotateCw className={retrying ? 'animate-spin' : undefined} aria-hidden="true" />
              Try again
            </Button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
