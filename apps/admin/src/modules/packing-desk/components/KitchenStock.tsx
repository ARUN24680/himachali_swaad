import { StatusBadge, Skeleton } from '@pk/ui';
import { Boxes } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { useT, type DeskKey } from '@/i18n';
import { formatCalendarDate } from '@/lib/dates';
import { useBatches } from '@/modules/inventory';
import { BatchTag } from './BatchTag';

const NO_FILTERS = {};

/** Own kitchen's active batches: stock left + expiry badge (Phase 7 §7.8). API scopes to the partner's kitchen. */
export function KitchenStock() {
  const t = useT();
  const batches = useBatches(NO_FILTERS);

  if (batches.isPending)
    return (
      <div role="status" aria-label={t('batches.stockLoading')} className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  if (batches.isError)
    return (
      <ErrorState
        title={t('common.errorTitle')}
        message={t('common.errorBody')}
        onRetry={() => void batches.refetch()}
        retrying={batches.isFetching}
        retryLabel={t('common.retry')}
      />
    );
  if (batches.data.batches.length === 0)
    return <EmptyState icon={Boxes} title={t('batches.stockEmptyTitle')} description={t('batches.stockEmptyBody')} />;

  const expiryText = (d: number) =>
    d > 0
      ? t('batches.daysLeft', { count: d })
      : d === 0
        ? t('batches.expiresToday')
        : t('batches.expiredAgo', { count: -d });

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {batches.data.batches.map((b) => (
        <li key={b.id} className="grid gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BatchTag>{b.batchCode}</BatchTag>
            <StatusBadge
              status={b.shelfStatus}
              label={t(`batches.shelf.${b.shelfStatus}` as DeskKey)}
              className="text-sm"
            />
          </div>
          <p className="text-base font-semibold">
            {b.product.title} · {t('card.weight', { g: b.product.netWeightG })}
          </p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-xl font-bold tabular-nums">{t('batches.left', { count: b.availableStock })}</span>
            <span
              className={
                b.daysToExpiry <= 0 ? 'text-base font-semibold text-destructive' : 'text-base text-muted-foreground'
              }
            >
              {expiryText(b.daysToExpiry)}
            </span>
          </div>
          <p className="text-base text-muted-foreground">
            {t('batches.made', { date: formatCalendarDate(b.manufacturedAt) })}
          </p>
        </li>
      ))}
    </ul>
  );
}
