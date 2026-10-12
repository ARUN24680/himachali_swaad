import { can, SHELF_STATUSES, type Batch, type BatchListQuery, type ShelfStatus } from '@pk/shared';
import { Button } from '@pk/ui';
import { AlarmClock, Boxes, CalendarCheck2, CircleSlash, PackageCheck, PackagePlus, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { useMe } from '@/hooks/useMe';
import { AdjustStockDialog } from '../components/AdjustStockDialog';
import { BatchesTable } from '../components/BatchesTable';
import { BatchFilters, type BatchFilterState } from '../components/BatchFilters';
import { CreateBatchModal } from '../components/CreateBatchModal';
import { ExpiryAlertsTable } from '../components/ExpiryAlertsTable';
import { MovementsSheet } from '../components/MovementsSheet';
import { useBatches, useBatchProductOptions, useExpiryAlerts } from '../hooks/useBatches';

const isShelfStatus = (v: string | null): v is ShelfStatus => SHELF_STATUSES.includes(v as ShelfStatus);

const sum = (list: Batch[], pred: (b: Batch) => boolean) => list.filter(pred).reduce((n, b) => n + b.availableStock, 0);

export default function BatchesListPage() {
  const [params, setParams] = useSearchParams();
  const filters: BatchFilterState = {
    productId: params.get('product'),
    status: isShelfStatus(params.get('status')) ? (params.get('status') as ShelfStatus) : null,
    includeEmpty: params.get('empty') === '1',
  };
  const query: BatchListQuery = {
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.includeEmpty ? { includeEmpty: 'true' as const } : {}),
  };
  const filtered = Object.keys(query).length > 0;

  // KPIs always describe the whole kitchen (unfiltered); the table follows the filters
  const overview = useBatches({});
  const list = useBatches(query);
  const productOptions = useBatchProductOptions();
  // Expiry alerts are an ADMIN endpoint (Phase 9 §9.6); partners keep the plain batch list
  const me = useMe();
  const isAdmin = me.data ? can(me.data.user.role, 'dashboard:revenue') : false;
  const alerts = useExpiryAlerts(isAdmin);
  const view: 'batches' | 'alerts' = isAdmin && params.get('view') === 'alerts' ? 'alerts' : 'batches';

  const [createOpen, setCreateOpen] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Batch | null>(null);
  const [adjustFor, setAdjustFor] = useState<Batch | null>(null);

  // Dialogs follow the freshest copy after refetches, falling back to the snapshot (e.g. a batch
  // that just hit 0 jars drops out of the default list)
  const fresh = (b: Batch | null) =>
    b
      ? (list.data?.batches.find((x) => x.id === b.id) ?? overview.data?.batches.find((x) => x.id === b.id) ?? b)
      : null;
  const ledgerBatch = fresh(ledgerFor);
  const adjustBatch = fresh(adjustFor);

  const kpi = useMemo(() => {
    const all = overview.data?.batches ?? [];
    return {
      active: all.filter((b) => b.availableStock > 0).length,
      sellable: sum(all, (b) => b.shelfStatus === 'FRESH' || b.shelfStatus === 'AGING'),
      agingBatches: all.filter((b) => b.shelfStatus === 'AGING' && b.availableStock > 0).length,
      agingJars: sum(all, (b) => b.shelfStatus === 'AGING'),
      blockedJars: sum(all, (b) => b.shelfStatus === 'NOT_SELLABLE' || b.shelfStatus === 'EXPIRED'),
      expiredJars: sum(all, (b) => b.shelfStatus === 'EXPIRED'),
    };
  }, [overview.data]);

  const showKitchen = useMemo(() => new Set(list.data?.batches.map((b) => b.pickupLocation.id)).size > 1, [list.data]);

  const setFilters = (next: Partial<BatchFilterState>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const merged = { ...filters, ...next };
        if (merged.productId) p.set('product', merged.productId);
        else p.delete('product');
        if (merged.status) p.set('status', merged.status);
        else p.delete('status');
        if (merged.includeEmpty) p.set('empty', '1');
        else p.delete('empty');
        return p;
      },
      { replace: true },
    );

  const kpiLoading = overview.isPending;
  const buffer = overview.data?.sellableBufferDays;
  const newBatchButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <PackagePlus aria-hidden="true" />
      Log batch
    </Button>
  );

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Inventory"
        title="Batches"
        description="Every jar traced to its kitchen batch. Oldest expiry first — pack from the top of the list."
        actions={newBatchButton}
      />

      <KpiGrid label="Stock summary">
        <KpiCard label="Active batches" icon={Boxes} loading={kpiLoading} value={kpi.active} hint="With jars left" />
        <KpiCard
          label="Sellable jars"
          icon={PackageCheck}
          tone="success"
          loading={kpiLoading}
          value={kpi.sellable}
          hint={buffer != null ? `≥ ${buffer} days of shelf life` : 'Fresh + sell first'}
        />
        <KpiCard
          label="Sell first"
          icon={AlarmClock}
          tone={kpi.agingJars > 0 ? 'warning' : 'default'}
          loading={kpiLoading}
          value={kpi.agingJars}
          hint={
            kpi.agingBatches > 0
              ? `Jars in ${kpi.agingBatches} ageing batch${kpi.agingBatches === 1 ? '' : 'es'}`
              : 'Nothing ageing'
          }
        />
        <KpiCard
          label="Not sellable"
          icon={CircleSlash}
          tone={kpi.blockedJars > 0 ? 'destructive' : 'default'}
          loading={kpiLoading}
          value={kpi.blockedJars}
          hint={kpi.expiredJars > 0 ? `${kpi.expiredJars} expired — log as wastage` : 'Too close to expiry to ship'}
        />
      </KpiGrid>

      <TableCard
        label="Batch list"
        controls={
          <>
            {isAdmin && (
              <FilterPills
                label="Inventory view"
                value={view}
                onChange={(v) =>
                  setParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      if (v === 'alerts') p.set('view', 'alerts');
                      else p.delete('view');
                      return p;
                    },
                    { replace: true },
                  )
                }
                options={[
                  { value: 'batches', label: 'Batches' },
                  { value: 'alerts', label: 'Expiry alerts', count: alerts.data?.length, alert: true },
                ]}
              />
            )}
            {view === 'batches' && (
              <BatchFilters
                value={filters}
                onChange={setFilters}
                products={productOptions.data}
                resultCount={list.data?.batches.length}
              />
            )}
            {view === 'batches' && list.isFetching && !list.isPending && (
              <span role="status" className="text-xs text-muted-foreground">
                Updating…
              </span>
            )}
          </>
        }
        footer={
          view === 'alerts'
            ? 'Batches whose sellable window (expiry minus the D-24 buffer) closes in the next 14 days.'
            : list.data && list.data.batches.length > 0
              ? `${list.data.batches.length} batch${list.data.batches.length === 1 ? '' : 'es'} · sellable means ≥ ${list.data.sellableBufferDays} days to expiry (D-24)`
              : undefined
        }
      >
        {view === 'alerts' ? (
          alerts.isPending ? (
            <DataTableSkeleton rows={3} label="Loading expiry alerts" />
          ) : alerts.isError ? (
            <ErrorState
              title="Couldn’t load expiry alerts"
              message={alerts.error.message}
              onRetry={() => void alerts.refetch()}
              retrying={alerts.isFetching}
            />
          ) : alerts.data.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title="Nothing close to expiry"
              description="No batch stops being sellable in the next 14 days."
            />
          ) : (
            <ExpiryAlertsTable alerts={alerts.data} />
          )
        ) : list.isPending ? (
          <ListSkeleton label="Loading batches" />
        ) : list.isError ? (
          <ErrorState
            title="Couldn’t load batches"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : list.data.batches.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No batches match"
              description="Try another product or status, or include empty batches."
              action={
                <Button
                  variant="outline"
                  onClick={() => setFilters({ productId: null, status: null, includeEmpty: false })}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Boxes}
              title="No batches with stock"
              description="Log the first batch after bottling — it takes about 20 seconds."
              action={newBatchButton}
            />
          )
        ) : (
          <BatchesTable
            batches={list.data.batches}
            showKitchen={showKitchen}
            onLedger={setLedgerFor}
            onAdjust={setAdjustFor}
          />
        )}
      </TableCard>

      <CreateBatchModal open={createOpen} onOpenChange={setCreateOpen} />
      <MovementsSheet
        batch={ledgerBatch}
        onOpenChange={(o) => !o && setLedgerFor(null)}
        onAdjust={(b) => {
          setLedgerFor(null);
          setAdjustFor(b);
        }}
      />
      {adjustBatch && (
        <AdjustStockDialog
          key={adjustBatch.id}
          batch={adjustBatch}
          open
          onOpenChange={(o) => !o && setAdjustFor(null)}
        />
      )}
    </div>
  );
}
