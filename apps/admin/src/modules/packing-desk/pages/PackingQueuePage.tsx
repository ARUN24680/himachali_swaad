import type { PartnerOrderCard } from '@pk/shared';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@pk/ui';
import { useMutationState } from '@tanstack/react-query';
import { CheckCheck, PackageCheck, PartyPopper, Printer, Truck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { useT } from '@/i18n';
import { A4Bar } from '../components/A4Bar';
import { ManifestList } from '../components/ManifestList';
import { OrderCard, type OrderCardMode } from '../components/OrderCard';
import { OrderListSkeleton } from '../components/OrderListSkeleton';
import { PackIssues } from '../components/PackIssues';
import { QueueHero } from '../components/QueueHero';
import { MARK_PACKED_KEY, type MarkPackedVars } from '../hooks/useMarkPacked';
import { useNow } from '../hooks/useNow';
import { usePartnerOrders, type OrderTab } from '../hooks/usePartnerOrders';
import { useDeskUiStore } from '../store/desk-ui.store';
import { selectPendingCodes, useOutboxStore } from '../store/outbox.store';

const TABS = { pack: 'AWAITING_PACKING', packed: 'PACKED', pickup: 'PICKUP_SCHEDULED' } as const satisfies Record<
  string,
  OrderTab
>;
type TabId = keyof typeof TABS;
const isTab = (v: string | null): v is TabId => v === 'pack' || v === 'packed' || v === 'pickup';

const byAge = (a: PartnerOrderCard, b: PartnerOrderCard) =>
  (a.confirmedAt ?? '9999').localeCompare(b.confirmedAt ?? '9999') || a.orderCode.localeCompare(b.orderCode);

/** Cards that just got Mark Packed: the cache already dropped them, so read them from the mutation. */
function useExitingCards(current: PartnerOrderCard[]): PartnerOrderCard[] {
  const leaving = useDeskUiStore((s) => s.leaving);
  const pending = useMutationState({
    filters: { mutationKey: MARK_PACKED_KEY },
    select: (m) => m.state.variables as MarkPackedVars | undefined,
  });
  const seen = new Set(current.map((o) => o.orderCode));
  const out = new Map<string, PartnerOrderCard>();
  for (const v of pending) {
    if (v && leaving.includes(v.order.orderCode) && !seen.has(v.order.orderCode)) out.set(v.order.orderCode, v.order);
  }
  return [...out.values()];
}

function ToPackTab() {
  const t = useT();
  const now = useNow();
  const orders = usePartnerOrders('AWAITING_PACKING');
  const pendingCodes = useOutboxStore(useShallow(selectPendingCodes));
  const { a4Mode, a4Selected, setA4Mode, toggleA4, stopLeaving } = useDeskUiStore();

  // Packed offline, not synced yet → already off the partner's to-do list
  const visible = (orders.data?.orders ?? []).filter((o) => !pendingCodes.includes(o.orderCode));
  const exiting = useExitingCards(visible);
  const cards = [
    ...visible.map((order) => ({ order, exiting: false })),
    ...exiting.map((order) => ({ order, exiting: true })),
  ].sort((a, b) => byAge(a.order, b.order));
  const canA4 = visible.some((o) => o.labelReady);

  return (
    <div className={cn('grid gap-4', a4Mode && 'pb-56 md:pb-40')}>
      {orders.isPending ? (
        <OrderListSkeleton label={t('queue.loading')} />
      ) : orders.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t('common.errorBody')}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
          retryLabel={t('common.retry')}
        />
      ) : cards.length === 0 ? (
        <EmptyState icon={PartyPopper} title={t('queue.emptyTitle')} description={t('queue.emptyBody')} />
      ) : (
        <>
          {canA4 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base text-muted-foreground">{a4Mode ? t('a4.hint') : null}</p>
              <Button
                type="button"
                variant={a4Mode ? 'secondary' : 'outline'}
                onClick={() => setA4Mode(!a4Mode)}
                aria-pressed={a4Mode}
                className="ml-auto text-base"
              >
                {a4Mode ? <CheckCheck aria-hidden="true" /> : <Printer aria-hidden="true" />}
                {a4Mode ? t('a4.done') : t('a4.start')}
              </Button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map(({ order, exiting: isExiting }) => (
              <OrderCard
                key={order.orderCode}
                order={order}
                mode="pack"
                now={now}
                exiting={isExiting}
                onExited={() => stopLeaving(order.orderCode)}
                selectable={a4Mode && !isExiting}
                selected={a4Selected.includes(order.orderCode)}
                onToggleSelect={() => toggleA4(order.orderCode)}
              />
            ))}
          </div>
        </>
      )}
      {a4Mode && <A4Bar />}
    </div>
  );
}

function StatusList({ status, mode, empty }: { status: OrderTab; mode: OrderCardMode; empty: 'packed' | 'pickup' }) {
  const t = useT();
  const now = useNow();
  const orders = usePartnerOrders(status);
  if (orders.isPending) return <OrderListSkeleton label={t('queue.loading')} />;
  if (orders.isError)
    return (
      <ErrorState
        title={t('common.errorTitle')}
        message={t('common.errorBody')}
        onRetry={() => void orders.refetch()}
        retrying={orders.isFetching}
        retryLabel={t('common.retry')}
      />
    );
  if (orders.data.orders.length === 0)
    return empty === 'packed' ? (
      <EmptyState icon={PackageCheck} title={t('queue.emptyPackedTitle')} description={t('queue.emptyPackedBody')} />
    ) : (
      <EmptyState icon={Truck} title={t('queue.emptyPickupTitle')} description={t('queue.emptyPickupBody')} />
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {orders.data.orders.map((order) => (
        <OrderCard key={order.orderCode} order={order} mode={mode} now={now} />
      ))}
    </div>
  );
}

/** Header count: server's to-pack total minus orders packed offline that haven't synced yet. */
function Hero() {
  const orders = usePartnerOrders('AWAITING_PACKING');
  const pendingCodes = useOutboxStore(useShallow(selectPendingCodes));
  const queued = orders.data?.orders.filter((o) => pendingCodes.includes(o.orderCode)).length ?? 0;
  return (
    <QueueHero
      toPack={orders.data ? Math.max(0, orders.data.toPack - queued) : null}
      cutoffHourIst={orders.data?.cutoffHourIst ?? null}
    />
  );
}

/** /desk — today's packing queue + packed + pickup (Phase 7 §7.5–7.6). */
export default function PackingQueuePage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = isTab(raw) ? raw : 'pack';
  const setA4Mode = useDeskUiStore((s) => s.setA4Mode);

  return (
    <div className="grid gap-4">
      <Hero />
      <PackIssues />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setA4Mode(false);
          setParams(v === 'pack' ? {} : { tab: v }, { replace: true });
        }}
        className="grid gap-4"
      >
        <TabsList aria-label={t('queue.tabsLabel')} className="grid grid-cols-3 sm:flex">
          <TabsTrigger
            value="pack"
            className="h-auto min-h-12 justify-center px-2 py-1.5 text-center text-base leading-tight whitespace-normal sm:px-4"
          >
            {t('queue.tabToPack')}
          </TabsTrigger>
          <TabsTrigger
            value="packed"
            className="h-auto min-h-12 justify-center px-2 py-1.5 text-center text-base leading-tight whitespace-normal sm:px-4"
          >
            {t('queue.tabPacked')}
          </TabsTrigger>
          <TabsTrigger
            value="pickup"
            className="h-auto min-h-12 justify-center px-2 py-1.5 text-center text-base leading-tight whitespace-normal sm:px-4"
          >
            {t('queue.tabPickup')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pack">
          <ToPackTab />
        </TabsContent>
        <TabsContent value="packed">
          <StatusList status={TABS.packed} mode="packed" empty="packed" />
        </TabsContent>
        <TabsContent value="pickup" className="grid gap-4">
          <ManifestList />
          <StatusList status={TABS.pickup} mode="pickup" empty="pickup" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
