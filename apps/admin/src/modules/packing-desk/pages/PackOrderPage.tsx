import { PACKING_CHECKLIST_KEYS, type PackingChecklist, type PackingChecklistKey } from '@pk/shared';
import { Badge, Button, Checkbox, Progress, Skeleton, cn } from '@pk/ui';
import { ArrowLeft, PackageSearch, WifiOff } from 'lucide-react';
import { useId } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { useT, type DeskKey } from '@/i18n';
import { DeskSection } from '../components/DeskSection';
import { LabelButtons } from '../components/LabelButtons';
import { OrderItems } from '../components/OrderCard';
import { useMarkPacked } from '../hooks/useMarkPacked';
import { useOnline } from '../hooks/useOnline';
import { usePartnerOrders } from '../hooks/usePartnerOrders';
import { newIdempotencyKey } from '../offline/idempotency';
import { useChecklistStore } from '../store/checklist.store';

const NO_TICKS: readonly PackingChecklistKey[] = [];

function ChecklistRow({
  item,
  checked,
  onChange,
}: {
  item: PackingChecklistKey;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <li>
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-16 cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors',
          checked ? 'border-success/40 bg-success/10' : 'border-input bg-background hover:bg-accent',
        )}
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          aria-describedby={`${id}-help`}
          className="mt-0.5 size-6"
        />
        <span className="grid gap-1">
          <span className="text-lg leading-snug font-semibold">{t(`pack.check.${item}` as DeskKey)}</span>
          <span id={`${id}-help`} className="text-base text-muted-foreground">
            {t(`pack.check.${item}Help` as DeskKey)}
          </span>
        </span>
      </label>
    </li>
  );
}

/**
 * /desk/pack/:orderCode — one order, one job (Phase 7 §7.4–7.7): pick the right jars, print the
 * label, tick the 6 SOP steps (saved on the phone), then Mark Packed. Optimistic: we go straight
 * back to the queue where the card slides out; offline taps are queued and synced later.
 */
export default function PackOrderPage() {
  const t = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const { orderCode = '' } = useParams();
  const orders = usePartnerOrders('AWAITING_PACKING');
  const order = orders.data?.orders.find((o) => o.orderCode === orderCode);
  const done = useChecklistStore((s) => s.byOrder[orderCode]?.done ?? NO_TICKS);
  const toggle = useChecklistStore((s) => s.toggle);
  const markPacked = useMarkPacked();

  const total = PACKING_CHECKLIST_KEYS.length;
  const count = PACKING_CHECKLIST_KEYS.filter((k) => done.includes(k)).length;
  const complete = count === total;

  const back = (
    <Link
      to="/desk"
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-base font-medium text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t('pack.back')}
    </Link>
  );

  if (orders.isPending) {
    return (
      <div role="status" aria-label={t('queue.loading')} className="grid gap-4">
        {back}
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (orders.isError) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState
          title={t('common.errorTitle')}
          message={t('common.errorBody')}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="grid gap-4">
        {back}
        <EmptyState icon={PackageSearch} title={t('pack.notFoundTitle')} description={t('pack.notFoundBody')} />
      </div>
    );
  }

  const submit = () => {
    if (!complete || markPacked.isPending) return;
    const checklist = Object.fromEntries(PACKING_CHECKLIST_KEYS.map((k) => [k, true])) as PackingChecklist;
    markPacked.mutate({ order, key: newIdempotencyKey(), checklist });
    void navigate('/desk');
  };

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4 pb-40 md:pb-28">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="grid gap-0.5">
          <span className="text-sm font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t('card.order')}
          </span>
          <span className="sr-only">{t('pack.title', { code: order.orderCode })}</span>
          <span aria-hidden="true" className="font-sans text-3xl font-bold whitespace-nowrap tabular-nums">
            #{order.orderCode}
          </span>
        </h1>
        <Badge tone={order.labelReady ? 'success' : 'warning'} className="mt-1 text-sm">
          {order.labelReady ? t('card.labelReady') : t('card.labelPending')}
        </Badge>
      </header>

      <DeskSection title={t('pack.pickTitle')}>
        <OrderItems order={order} large />
      </DeskSection>

      <DeskSection title={t('pack.labelTitle')}>
        <LabelButtons
          target={{ kind: 'order', code: order.orderCode }}
          disabledReason={order.labelReady ? undefined : 'label.notReady'}
        />
      </DeskSection>

      <DeskSection
        title={t('pack.checklistTitle')}
        aside={
          <span className="text-base font-semibold tabular-nums" aria-live="polite">
            {t('pack.progress', { done: count, total })}
          </span>
        }
      >
        <Progress value={(count / total) * 100} aria-label={t('pack.progress', { done: count, total })} />
        <ul className="grid gap-3">
          {PACKING_CHECKLIST_KEYS.map((key) => (
            <ChecklistRow
              key={key}
              item={key}
              checked={done.includes(key)}
              onChange={(v) => toggle(order.orderCode, key, v)}
            />
          ))}
        </ul>
      </DeskSection>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card p-3 shadow-float md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-2xl gap-2">
          {!online && (
            <p className="flex items-center gap-2 text-base text-muted-foreground">
              <WifiOff aria-hidden="true" className="size-5 shrink-0" />
              {t('pack.offlineNote')}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="h-14 w-full text-lg"
            disabled={!complete || markPacked.isPending}
            aria-describedby={complete ? undefined : 'mark-packed-hint'}
            onClick={submit}
          >
            {t('pack.markPacked')}
          </Button>
          {!complete && (
            <p id="mark-packed-hint" className="text-center text-base text-muted-foreground">
              {t('pack.markPackedHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
