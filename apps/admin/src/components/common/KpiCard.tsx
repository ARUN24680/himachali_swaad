import { Skeleton, cn } from '@pk/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'default' | 'success' | 'warning' | 'destructive' | 'info';

const HINT_TONE: Record<Tone, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
};
const ICON_TONE: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  info: 'bg-info/15 text-info',
};

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}

/** Tier 2 of the Nexus layout: one pure summary stat (no actions inside). Use inside <KpiGrid>. */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', loading }: KpiCardProps) {
  return (
    <div
      data-testid="kpi-card"
      className="grid min-w-0 content-start gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm md:p-5"
    >
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
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-28" />
        </>
      ) : (
        <>
          <p className="truncate font-sans text-2xl font-semibold tabular-nums md:text-3xl">{value}</p>
          {hint && <p className={cn('line-clamp-2 text-xs', HINT_TONE[tone])}>{hint}</p>}
        </>
      )}
    </div>
  );
}

/** Tier 2 grid: 1 column on phones, 2×2 on tablets, 4 across on desktop. */
export function KpiGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      data-testid="kpi-grid"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4"
    >
      {children}
    </section>
  );
}
