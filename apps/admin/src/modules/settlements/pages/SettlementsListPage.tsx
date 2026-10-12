import { formatINR, type SettlementSummary } from '@pk/shared';
import { Badge, Button, StatusBadge } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, FilePlus2, HandCoins, Hourglass, Landmark, SearchX } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatCalendarDate } from '@/lib/dates';
import { GenerateSettlementDialog } from '../components/SettlementDialogs';
import { periodLabel } from '../components/labels';
import { Money } from '../components/SettlementBreakdown';
import { useSettlements } from '../hooks/useSettlements';

type Filter = 'all' | SettlementSummary['status'];
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'PAID', label: 'Paid' },
];
const col = createColumnHelper<SettlementSummary>();

function AckCell({ s }: { s: SettlementSummary }) {
  if (s.status === 'DRAFT') return <span className="text-muted-foreground">—</span>;
  return s.partnerAcknowledgedAt ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden="true" className="size-3" />
      {formatCalendarDate(s.partnerAcknowledgedAt.slice(0, 10))}
    </Badge>
  ) : (
    <Badge tone="warning">
      <Clock aria-hidden="true" className="size-3" />
      Pending
    </Badge>
  );
}

const columns = [
  col.display({
    id: 'period',
    header: 'Period',
    cell: ({ row: { original: s } }) => (
      <span className="grid">
        <span className="font-medium whitespace-nowrap">{periodLabel(s)}</span>
        <span className="text-xs text-muted-foreground">Split {s.partnerSplitBp / 100}%</span>
      </span>
    ),
  }),
  col.accessor('ordersCount', {
    header: 'Orders',
    meta: { align: 'right' },
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  col.accessor('jarsCount', {
    header: 'Jars',
    meta: { align: 'right' },
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  col.accessor('netProfitPaise', {
    header: 'Net profit',
    meta: { align: 'right' },
    cell: (c) => <Money paise={c.getValue()} />,
  }),
  col.accessor('partnerPayoutPaise', {
    header: 'Partner payout',
    meta: { align: 'right' },
    cell: (c) => <Money paise={c.getValue()} className="font-semibold" />,
  }),
  col.accessor('status', {
    header: 'Status',
    cell: ({ row: { original: s } }) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={s.status} />
        {s.status === 'DRAFT' && s.warningsCount > 0 && (
          <Badge tone="warning">
            <AlertTriangle aria-hidden="true" className="size-3" />
            {s.warningsCount}
            <span className="sr-only"> warnings</span>
          </Badge>
        )}
      </span>
    ),
  }),
  col.display({ id: 'ack', header: 'Partner ack', cell: ({ row }) => <AckCell s={row.original} /> }),
];

/** /settlements (Phase 9 §9.9, D-40/D-41): ADMIN generates, finalizes and pays partner statements. */
export default function SettlementsListPage() {
  const list = useSettlements();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.find((f) => f.value === params.get('status'))?.value ?? 'all';
  const [generating, setGenerating] = useState(false);
  const all = list.data ?? [];
  const rows = all.filter((s) => filter === 'all' || s.status === filter);
  const finalizedUnpaid = all.filter((s) => s.status === 'FINALIZED');
  const year = new Date().getFullYear().toString();
  const paidThisYear = all.filter((s) => s.status === 'PAID' && s.paidAt?.startsWith(year));
  const sum = (xs: SettlementSummary[], f: (s: SettlementSummary) => number) => xs.reduce((n, s) => n + f(s), 0);

  const generateButton = (
    <Button onClick={() => setGenerating(true)}>
      <FilePlus2 aria-hidden="true" />
      Generate settlement
    </Button>
  );

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Finance"
        title="Settlements"
        description="Transparent profit sharing with the kitchen partner — GST-exclusive, to the paisa, read-only once finalized."
        actions={generateButton}
      />
      <KpiGrid label="Settlement summary">
        <KpiCard
          label="Drafts"
          icon={Hourglass}
          tone={all.some((s) => s.status === 'DRAFT' && s.warningsCount) ? 'warning' : 'default'}
          loading={list.isPending}
          value={all.filter((s) => s.status === 'DRAFT').length}
          hint="Review, fix warnings, finalize"
        />
        <KpiCard
          label="Payout due"
          icon={HandCoins}
          tone={finalizedUnpaid.length ? 'warning' : 'default'}
          loading={list.isPending}
          value={formatINR(sum(finalizedUnpaid, (s) => s.partnerPayoutPaise))}
          hint={`${finalizedUnpaid.length} finalized, not paid`}
        />
        <KpiCard
          label={`Paid in ${year}`}
          icon={Landmark}
          tone="success"
          loading={list.isPending}
          value={formatINR(sum(paidThisYear, (s) => s.partnerPayoutPaise))}
          hint={`${paidThisYear.length} statement${paidThisYear.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          label="Awaiting partner ack"
          icon={Clock}
          loading={list.isPending}
          value={all.filter((s) => s.status !== 'DRAFT' && !s.partnerAcknowledgedAt).length}
          hint="Partner confirms in the desk app"
        />
      </KpiGrid>
      <TableCard
        label="Settlement list"
        controls={
          <FilterPills
            label="Settlement status"
            value={filter}
            onChange={(v) =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (v === 'all') n.delete('status');
                else n.set('status', v);
                return n;
              })
            }
            options={FILTERS.map((f) => ({
              ...f,
              count: list.data ? all.filter((s) => f.value === 'all' || s.status === f.value).length : undefined,
            }))}
          />
        }
      >
        {list.isPending ? (
          <DataTableSkeleton rows={4} label="Loading settlements" />
        ) : list.isError ? (
          <ErrorState
            title="Couldn’t load settlements"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : rows.length === 0 ? (
          all.length ? (
            <EmptyState icon={SearchX} title="Nothing in this status" />
          ) : (
            <EmptyState
              icon={HandCoins}
              title="No settlements yet"
              description="Generate the first one once orders from a period are delivered."
              action={generateButton}
            />
          )
        ) : (
          <DataTable
            label="Settlements"
            columns={columns}
            data={rows}
            getRowId={(s) => s.id}
            getRowHref={(s) => `/settlements/${s.id}`}
            rowLabel={(s) => `Open settlement ${periodLabel(s)}`}
            renderCard={(s) => (
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{periodLabel(s)}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {s.ordersCount} orders · {s.jarsCount} jars · net <Money paise={s.netProfitPaise} />
                </p>
                <div className="flex items-center justify-between gap-2">
                  <AckCell s={s} />
                  <span className="text-sm">
                    Payout <Money paise={s.partnerPayoutPaise} className="font-semibold" />
                  </span>
                </div>
              </div>
            )}
          />
        )}
      </TableCard>
      {generating && <GenerateSettlementDialog onOpenChange={setGenerating} />}
    </div>
  );
}
