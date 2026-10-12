import { formatINR } from '@pk/shared';
import { Badge, Skeleton, StatusBadge } from '@pk/ui';
import { CheckCircle2, ChevronRight, Clock, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { useT } from '@/i18n';
import { formatCalendarDate, formatShortDate } from '@/lib/dates';
import { usePartnerSettlements } from '@/modules/settlements';

/**
 * /desk/hisaab — the partner's FINALIZED / PAID settlement statements (Phase 9 §9.9, D-40).
 * Read-only; drafts never reach this endpoint. Nothing else financial is shown to partners.
 */
export default function HisaabPage() {
  const t = useT();
  const list = usePartnerSettlements();
  const period = (s: { periodStart: string; periodEnd: string }) =>
    `${formatShortDate(s.periodStart)} – ${formatCalendarDate(s.periodEnd)}`;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="grid gap-1">
        <h1 className="font-serif text-3xl font-semibold">{t('hisaab.title')}</h1>
        <p className="text-muted-foreground">{t('hisaab.subtitle')}</p>
      </div>
      {list.isPending ? (
        <div role="status" aria-label={t('hisaab.loading')} className="grid gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <div className="rounded-lg border border-border bg-card">
          <ErrorState
            title={t('common.errorTitle')}
            message={t('common.errorBody')}
            retryLabel={t('common.retry')}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        </div>
      ) : list.data.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState icon={Wallet} title={t('hisaab.emptyTitle')} description={t('hisaab.emptyBody')} />
        </div>
      ) : (
        <ul className="grid gap-3">
          {list.data.map((s) => (
            <li key={s.id}>
              <Link
                to={`/desk/hisaab/${s.id}`}
                aria-label={t('hisaab.open', { period: period(s) })}
                className="grid gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid gap-1">
                    <span className="font-serif text-xl font-semibold">{period(s)}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {t('hisaab.counts', { orders: s.ordersCount, jars: s.jarsCount })}
                    </span>
                  </span>
                  <StatusBadge
                    status={s.status}
                    label={s.status === 'PAID' ? t('hisaab.statusPaid') : t('hisaab.statusFinalized')}
                  />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <span className="grid">
                    <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      {t('hisaab.payout')}
                    </span>
                    <span className="text-2xl font-semibold tabular-nums">{formatINR(s.partnerPayoutPaise)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {s.partnerAcknowledgedAt ? (
                      <Badge tone="success">
                        <CheckCircle2 aria-hidden="true" className="size-3" />
                        {t('hisaab.acknowledged')}
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <Clock aria-hidden="true" className="size-3" />
                        {t('hisaab.pleaseCheck')}
                      </Badge>
                    )}
                    <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
