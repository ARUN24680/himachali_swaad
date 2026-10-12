import type { ExpiryAlertsResponse } from '@pk/shared';
import { Badge, Button } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { Link } from 'react-router';
import { DataTable } from '@/components/common/DataTable';
import { formatCalendarDate } from '@/lib/dates';

type Alert = ExpiryAlertsResponse['batches'][number];
const col = createColumnHelper<Alert>();

const daysBadge = (a: Alert) => (
  <Badge tone={a.daysLeft <= 3 ? 'destructive' : a.daysLeft <= 7 ? 'warning' : 'info'}>
    {a.daysLeft <= 0 ? 'Last day to sell' : `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} to sell`}
  </Badge>
);

const columns = [
  col.accessor('batchCode', {
    header: 'Batch',
    cell: ({ row: { original: a } }) => (
      <span className="grid gap-1">
        <Badge tone="batch" className="w-fit">
          {a.batchCode}
        </Badge>
        <span className="text-sm font-medium text-foreground">{a.productTitle}</span>
      </span>
    ),
  }),
  col.accessor('kitchenCode', {
    header: 'Kitchen',
    cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
  }),
  col.accessor('availableStock', {
    header: 'Jars left',
    meta: { align: 'right' },
    cell: (c) => <span className="font-semibold tabular-nums">{c.getValue()}</span>,
  }),
  col.accessor('sellableUntil', {
    header: 'Sell until',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatCalendarDate(c.getValue())}</span>,
  }),
  col.accessor('expiryDate', {
    header: 'Expires',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatCalendarDate(c.getValue())}</span>,
  }),
  col.accessor('daysLeft', { header: 'Window', cell: ({ row }) => daysBadge(row.original) }),
  col.display({
    id: 'ledger',
    header: () => <span className="sr-only">Actions</span>,
    meta: { align: 'right' },
    cell: ({ row: { original: a } }) => (
      <Button asChild variant="outline" size="sm">
        <Link to={`/batches/${a.batchId}/ledger`} aria-label={`Stock ledger for ${a.batchCode}`}>
          <History aria-hidden="true" />
          Ledger
        </Link>
      </Button>
    ),
  }),
];

/** Batches whose sellable window (D-24 buffer) closes within 14 days — push them or plan wastage. */
export function ExpiryAlertsTable({ alerts }: { alerts: Alert[] }) {
  return (
    <DataTable
      label="Expiry alerts"
      columns={columns}
      data={alerts}
      getRowId={(a) => a.batchId}
      getRowHref={(a) => `/batches/${a.batchId}/ledger`}
      rowLabel={(a) => `Stock ledger for ${a.batchCode}`}
      renderCard={(a) => (
        <div className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="grid gap-1">
              <Badge tone="batch" className="w-fit">
                {a.batchCode}
              </Badge>
              <span className="font-medium">{a.productTitle}</span>
            </span>
            <span className="text-right">
              <span className="block text-2xl font-semibold tabular-nums">{a.availableStock}</span>
              <span className="text-xs text-muted-foreground">jars left</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {daysBadge(a)}
            <span className="text-xs text-muted-foreground tabular-nums">
              Sell until {formatCalendarDate(a.sellableUntil)}
            </span>
          </div>
        </div>
      )}
    />
  );
}
