import { formatINR, type AdminCustomerRow } from '@pk/shared';
import { Badge } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';
import { DataTable, type DataTablePagination } from '@/components/common/DataTable';
import { formatDateTime } from '@/lib/dates';
import { formatPhone } from './phone';

const col = createColumnHelper<AdminCustomerRow>();
export const customerHref = (phone: string) => `/customers/${encodeURIComponent(phone)}`;

export function RiskBadge({ c }: { c: Pick<AdminCustomerRow, 'risk' | 'rtoCount'> }) {
  return c.risk ? (
    <Badge tone="destructive">
      <AlertTriangle aria-hidden="true" className="size-3" />
      RTO risk · {c.rtoCount}
    </Badge>
  ) : (
    <Badge tone="success">Good</Badge>
  );
}

const columns = [
  col.accessor('name', {
    header: 'Customer',
    cell: ({ row }) => (
      <span className="grid">
        <Link
          to={customerHref(row.original.phone)}
          className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.original.name}
        </Link>
        <span className="text-xs text-muted-foreground tabular-nums">{formatPhone(row.original.phone)}</span>
      </span>
    ),
  }),
  col.accessor('ordersCount', {
    header: 'Orders',
    meta: { align: 'right' },
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  col.accessor('lifetimeValuePaise', {
    header: 'Lifetime value',
    meta: { align: 'right' },
    cell: (c) => <span className="font-semibold tabular-nums">{formatINR(c.getValue())}</span>,
  }),
  col.accessor('lastOrderAt', {
    header: 'Last order',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
  }),
  col.accessor('rtoCount', {
    header: 'RTO',
    meta: { align: 'right' },
    enableSorting: false,
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  col.display({ id: 'risk', header: 'Risk', cell: ({ row }) => <RiskBadge c={row.original} /> }),
  col.display({
    id: 'account',
    header: 'Type',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.userId ? 'Account' : 'Guest'}</span>,
  }),
];

export function CustomersTable({
  rows,
  pagination,
  fetching,
}: {
  rows: AdminCustomerRow[];
  pagination: DataTablePagination;
  fetching: boolean;
}) {
  return (
    <DataTable
      label="Customers"
      columns={columns}
      data={rows}
      getRowId={(c) => c.phone}
      getRowHref={(c) => customerHref(c.phone)}
      rowLabel={(c) => `Open customer ${c.name}`}
      pagination={pagination}
      fetching={fetching}
      renderCard={(c) => (
        <div className="grid gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{c.name}</span>
            <span className="font-semibold tabular-nums">{formatINR(c.lifetimeValuePaise)}</span>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatPhone(c.phone)} · {c.ordersCount} order{c.ordersCount === 1 ? '' : 's'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <RiskBadge c={c} />
            <span className="text-xs text-muted-foreground tabular-nums">Last {formatDateTime(c.lastOrderAt)}</span>
          </div>
        </div>
      )}
    />
  );
}
