import { formatINR, type Movement, type MovementType } from '@pk/shared';
import { Badge, Button, StatusBadge, cn } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Boxes, History, PackageMinus, PackageOpen, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { AdjustStockDialog } from '../components/AdjustStockDialog';
import { expiryText, MOVEMENT_LABEL, SHELF_LABEL } from '../components/batchMeta';
import { useBatches, useBatchMovements } from '../hooks/useBatches';

type Filter = 'all' | MovementType;
const FILTERS: Filter[] = ['all', 'PRODUCTION', 'RESERVE', 'RELEASE', 'ADJUSTMENT', 'WASTAGE'];
const col = createColumnHelper<Movement>();

const Delta = ({ n }: { n: number }) => (
  <span className={cn('font-semibold tabular-nums', n >= 0 ? 'text-success' : 'text-destructive')}>
    {n >= 0 ? '+' : '−'}
    {Math.abs(n)}
  </span>
);

const columns = [
  col.accessor('createdAt', {
    header: 'When (IST)',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
  }),
  col.accessor('type', {
    header: 'Movement',
    cell: (c) => <span className="font-medium">{MOVEMENT_LABEL[c.getValue()]}</span>,
  }),
  col.accessor('quantityDelta', { header: 'Jars', meta: { align: 'right' }, cell: (c) => <Delta n={c.getValue()} /> }),
  col.accessor('balanceAfter', {
    header: 'Balance',
    meta: { align: 'right' },
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  col.accessor('reason', {
    header: 'Reason',
    cell: (c) => c.getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  col.accessor('actorName', {
    header: 'By',
    cell: (c) => c.getValue() ?? <span className="text-muted-foreground">System</span>,
  }),
];

/** /batches/:batchId/ledger — every inventory_movement of one batch (Phase 9 §9.6). */
export default function StockLedgerPage() {
  const { batchId } = useParams();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.find((f) => f === params.get('type')) ?? 'all';
  // No single-batch GET in the API: read it from the (cached) full list, empty batches included
  const batches = useBatches({ includeEmpty: 'true' });
  const batch = batches.data?.batches.find((b) => b.id === batchId);
  const movements = useBatchMovements(batchId ?? null);
  const [adjusting, setAdjusting] = useState(false);

  const all = movements.data ?? [];
  const rows = all.filter((m) => filter === 'all' || m.type === filter);
  const sumOf = (types: MovementType[]) =>
    all.filter((m) => types.includes(m.type)).reduce((n, m) => n + m.quantityDelta, 0);
  const sold = -sumOf(['RESERVE', 'RELEASE']);
  const lost = -sumOf(['WASTAGE']);
  const corrected = sumOf(['ADJUSTMENT']);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={
          <Link to="/batches" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Inventory
          </Link>
        }
        title={batch ? `Ledger · ${batch.batchCode}` : 'Stock ledger'}
        description={
          batch ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                {batch.product.title} · {batch.product.netWeightG} g · {batch.pickupLocation.name} · made{' '}
                {formatCalendarDate(batch.manufacturedAt)} · {formatINR(batch.costPerUnitPaise)}/jar
              </span>
              <StatusBadge
                status={batch.shelfStatus}
                label={`${SHELF_LABEL[batch.shelfStatus]} · ${expiryText(batch.daysToExpiry)}`}
              />
            </span>
          ) : undefined
        }
        actions={
          batch && (
            <Button variant="outline" onClick={() => setAdjusting(true)}>
              <SlidersHorizontal aria-hidden="true" />
              Adjust stock
            </Button>
          )
        }
      />
      <KpiGrid label="Batch stock">
        <KpiCard
          label="Jars left"
          icon={Boxes}
          loading={!batch}
          value={batch?.availableStock ?? 0}
          hint={batch ? `of ${batch.initialQuantity} produced` : undefined}
        />
        <KpiCard
          label="Sold / reserved"
          icon={PackageOpen}
          tone="info"
          loading={movements.isPending}
          value={sold}
          hint="Net of released reservations"
        />
        <KpiCard
          label="Wastage"
          icon={Trash2}
          tone={lost ? 'destructive' : 'default'}
          loading={movements.isPending}
          value={lost}
          hint="Broken, spoiled, expired"
        />
        <KpiCard
          label="Corrections"
          icon={PackageMinus}
          loading={movements.isPending}
          value={corrected >= 0 ? `+${corrected}` : `−${-corrected}`}
          hint="Manual count adjustments"
        />
      </KpiGrid>
      <TableCard
        label="Movements"
        controls={
          <FilterPills
            label="Movement type"
            value={filter}
            onChange={(v) =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (v === 'all') n.delete('type');
                else n.set('type', v);
                return n;
              })
            }
            options={FILTERS.map((f) => ({
              value: f,
              label: f === 'all' ? 'All' : MOVEMENT_LABEL[f],
              count: movements.data ? all.filter((m) => f === 'all' || m.type === f).length : undefined,
            }))}
          />
        }
      >
        {movements.isPending ? (
          <DataTableSkeleton rows={4} label="Loading ledger" />
        ) : movements.isError ? (
          <ErrorState
            title="Couldn’t load the ledger"
            message={movements.error.message}
            onRetry={() => void movements.refetch()}
            retrying={movements.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="No movements"
            description={filter === 'all' ? 'Nothing recorded for this batch yet.' : 'None of this type.'}
          />
        ) : (
          <DataTable
            label="Movements, newest first"
            columns={columns}
            data={rows}
            getRowId={(m) => String(m.id)}
            renderCard={(m) => (
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{MOVEMENT_LABEL[m.type]}</span>
                  <Delta n={m.quantityDelta} />
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {formatDateTime(m.createdAt)}
                    {m.actorName && ` · ${m.actorName}`}
                  </span>
                  <Badge tone="neutral">bal. {m.balanceAfter}</Badge>
                </div>
                {m.reason && <p className="text-sm">“{m.reason}”</p>}
              </div>
            )}
          />
        )}
      </TableCard>
      {adjusting && batch && (
        <AdjustStockDialog key={batch.id} batch={batch} open onOpenChange={(o) => !o && setAdjusting(false)} />
      )}
    </div>
  );
}
