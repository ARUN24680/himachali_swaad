import { Skeleton } from '@pk/ui';
import { Truck } from 'lucide-react';
import { useT } from '@/i18n';
import { formatCutoffHour } from './deskFormat';

/**
 * "🏔️ Aaj ke orders — N pack karne hain" (Phase 7 §7.5) on a Deep Pine band with the courier
 * pickup cut-off (D-36) — the two numbers a partner needs before anything else.
 */
export function QueueHero({ toPack, cutoffHourIst }: { toPack: number | null; cutoffHourIst: number | null }) {
  const t = useT();
  return (
    <section className="grid gap-4 rounded-lg bg-secondary p-5 text-secondary-foreground sm:grid-cols-[1fr_auto] sm:items-center">
      <h1 className="grid gap-1">
        <span className="text-base font-medium text-secondary-foreground/80">{t('queue.eyebrow')}</span>
        <span className="sr-only"> — </span>
        {toPack === null ? (
          <Skeleton className="h-9 w-48 bg-secondary-foreground/15" />
        ) : (
          <span className="font-serif text-3xl leading-tight font-semibold lining-nums sm:text-4xl" aria-live="polite">
            {t('queue.count', { count: toPack })}
          </span>
        )}
      </h1>
      {cutoffHourIst !== null && (
        <div className="flex items-center gap-3 rounded-md border border-secondary-foreground/20 px-4 py-3">
          <Truck aria-hidden="true" className="size-6 shrink-0 text-primary" />
          <div className="grid">
            <span className="text-sm text-secondary-foreground/80">{t('queue.cutoff')}</span>
            <span className="text-xl font-bold text-primary tabular-nums">{formatCutoffHour(cutoffHourIst)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
