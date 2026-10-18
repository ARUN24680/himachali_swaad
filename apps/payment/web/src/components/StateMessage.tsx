import { Card, cn } from '@pk/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type StateTone = 'success' | 'warning' | 'destructive' | 'neutral';

const toneClass: Record<StateTone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

interface StateMessageProps {
  icon: LucideIcon;
  tone: StateTone;
  title: string;
  children?: ReactNode;
  /** Order code + amount line, so the customer can compare with their UPI app. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Announce this state when it replaces the pay screen. */
  live?: boolean;
}

/** Centered full-state card used for paid / time-up / expired / error states. */
export function StateMessage({ icon: Icon, tone, title, children, meta, actions, live }: StateMessageProps) {
  return (
    <Card
      role={live ? 'status' : undefined}
      className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-8 text-center md:px-10 md:py-12"
    >
      <span className={cn('flex size-16 items-center justify-center rounded-full border', toneClass[tone])}>
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-medium text-balance text-foreground md:text-3xl">{title}</h1>
      {children && <div className="mt-3 space-y-2 text-pretty text-muted-foreground">{children}</div>}
      {meta && (
        <div className="mt-5 w-full rounded-md bg-muted px-4 py-3 text-sm text-foreground tabular-nums">{meta}</div>
      )}
      {actions && <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:min-w-64">{actions}</div>}
    </Card>
  );
}
