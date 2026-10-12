import { formatINR, type AdminOrderRow } from '@pk/shared';
import { StatusBadge } from '@pk/ui';
import { createColumnHelper, type SortingState } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';
import { DataTable, type DataTablePagination } from '@/components/common/DataTable';
import { formatDateTime } from '@/lib/dates';

const col = createColumnHelper<AdminOrderRow>();

function OpsIssueIcon({ row }: { row: AdminOrderRow }) {
  if (!row.opsIssue) return null;
  return (
    <span title="Needs attention" className="inline-flex text-destructive">
      <AlertTriangle aria-hidden="true" className="size-4" />
      <span className="sr-only">Needs attention</span>
    </span>
  );
}

const columnsFor = (hrefFor: (code: string) => string) => [
  col.accessor('orderCode', {
    header: 'Order',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        <Link
          to={hrefFor(row.original.orderCode)}
          className="font-mono text-sm font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.original.orderCode}
        </Link>
        <OpsIssueIcon row={row.original} />
      </span>
    ),
  }),
  col.accessor('createdAt', {
    header: 'Date (IST)',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
  }),
  col.accessor('customerName', {
    header: 'Customer',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="grid min-w-36">
        <span className="font-medium">{row.original.customerName}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.city}, {row.original.state}
        </span>
      </span>
    ),
  }),
  col.accessor('itemsSummary', {
    header: 'Items',
    enableSorting: false,
    meta: { className: 'max-w-64' },
    cell: (c) => <span className="line-clamp-2 text-sm">{c.getValue()}</span>,
  }),
  col.accessor('totalPaise', {
    header: 'Amount',
    meta: { align: 'right' },
    cell: ({ row }) => (
      <span className="grid justify-items-end gap-1">
        <span className="font-semibold tabular-nums">{formatINR(row.original.totalPaise)}</span>
        <StatusBadge status={row.original.paymentStatus} />
      </span>
    ),
  }),
  col.display({
    id: 'courier',
    header: 'Courier · AWB',
    cell: ({ row }) =>
      row.original.courierName ? (
        <span className="grid">
          <span>{row.original.courierName}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.awbCode ?? '—'}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Not booked</span>
      ),
  }),
  col.accessor('status', {
    header: 'Status',
    enableSorting: false,
    cell: (c) => <StatusBadge status={c.getValue()} kind="order" />,
  }),
];

function OrderCard({ o }: { o: AdminOrderRow }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
          {o.orderCode}
          <OpsIssueIcon row={o} />
        </span>
        <span className="font-semibold tabular-nums">{formatINR(o.totalPaise)}</span>
      </div>
      <p className="text-sm">
        <span className="font-medium">{o.customerName}</span>
        <span className="text-muted-foreground">
          {' '}
          · {o.city}, {o.state}
        </span>
      </p>
      <p className="line-clamp-1 text-sm text-muted-foreground">{o.itemsSummary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={o.status} kind="order" />
        <StatusBadge status={o.paymentStatus} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatDateTime(o.createdAt)}</span>
      </div>
      {o.awbCode && (
        <p className="text-xs text-muted-foreground">
          {o.courierName} · <span className="font-mono">{o.awbCode}</span>
        </p>
      )}
    </div>
  );
}

export function OrdersTable({
  orders,
  hrefFor,
  sorting,
  onSortingChange,
  pagination,
  fetching,
}: {
  orders: AdminOrderRow[];
  hrefFor: (code: string) => string;
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  pagination?: DataTablePagination;
  fetching?: boolean;
}) {
  return (
    <DataTable
      label="Orders"
      columns={columnsFor(hrefFor)}
      data={orders}
      getRowId={(o) => o.orderCode}
      getRowHref={(o) => hrefFor(o.orderCode)}
      rowLabel={(o) => `Open order ${o.orderCode}`}
      renderCard={(o) => <OrderCard o={o} />}
      sorting={sorting}
      onSortingChange={onSortingChange}
      pagination={pagination}
      fetching={fetching}
      rowClassName={(o) => (o.opsIssue ? 'bg-destructive/5' : undefined)}
    />
  );
}
