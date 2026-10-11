import { Skeleton, cn } from '@pk/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'default' | 'success' | 'warning' | 'destructive';

const HINT_TONE: Record<Tone, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};
const ICON_TONE: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}

/** Tier 2 of the Nexus layout: one stat. Use inside <KpiGrid>. */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', loading }: KpiCardProps) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground md:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
        <span
          aria-hidden="true"
          className={cn('grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', ICON_TONE[tone])}
        >
          <Icon />
        </span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-24" />
        </>
      ) : (
        <>
          <p className="font-sans text-2xl font-semibold tabular-nums md:text-3xl">{value}</p>
          {hint && <p className={cn('line-clamp-2 text-xs', HINT_TONE[tone])}>{hint}</p>}
        </>
      )}
    </div>
  );
}

export function KpiGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {children}
    </section>
  );
}
