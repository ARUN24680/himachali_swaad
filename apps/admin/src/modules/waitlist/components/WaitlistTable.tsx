import type { WaitlistEntry } from '@pk/shared';
import { Badge } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { CheckCircle2, Mail, Phone } from 'lucide-react';
import { DataTable, type DataTablePagination } from '@/components/common/DataTable';
import { formatDateTime, formatDateTimeFull } from '@/lib/dates';
import { formatPhone, SOURCE_LABEL, SOURCE_TONE } from './waitlistMeta';

const col = createColumnHelper<WaitlistEntry>();

export function SourceBadge({ source }: { source: WaitlistEntry['source'] }) {
  return <Badge tone={SOURCE_TONE[source]}>{SOURCE_LABEL[source]}</Badge>;
}

const Missing = () => (
  <span className="text-muted-foreground" aria-label="Not given">
    —
  </span>
);

const columns = [
  col.accessor('createdAt', {
    header: 'Joined',
    cell: (c) => (
      <time dateTime={c.getValue()} className="whitespace-nowrap tabular-nums">
        {formatDateTimeFull(c.getValue())}
      </time>
    ),
  }),
  col.accessor('name', {
    header: 'Name',
    cell: (c) => (c.getValue() ? <span className="font-medium">{c.getValue()}</span> : <Missing />),
  }),
  col.accessor('phone', {
    header: 'Phone',
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <a
          href={`tel:${v}`}
          className="whitespace-nowrap tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {formatPhone(v)}
        </a>
      ) : (
        <Missing />
      );
    },
  }),
  col.accessor('email', {
    header: 'E-mail',
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <a
          href={`mailto:${v}`}
          className="wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {v}
        </a>
      ) : (
        <Missing />
      );
    },
  }),
  col.accessor('source', { header: 'Source', cell: (c) => <SourceBadge source={c.getValue()} /> }),
  col.accessor('consentAt', {
    header: 'Consent',
    cell: (c) => (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-success">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        <span className="text-foreground">
          Yes <span className="text-xs text-muted-foreground tabular-nums">· {formatDateTime(c.getValue())}</span>
        </span>
      </span>
    ),
  }),
];

export function WaitlistTable({
  rows,
  pagination,
  fetching,
}: {
  rows: WaitlistEntry[];
  pagination: DataTablePagination;
  fetching: boolean;
}) {
  return (
    <DataTable
      label="Waitlist"
      columns={columns}
      data={rows}
      getRowId={(e) => e.id}
      pagination={pagination}
      fetching={fetching}
      renderCard={(e) => (
        <div className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{e.name ?? 'No name given'}</span>
            <SourceBadge source={e.source} />
          </div>
          <div className="grid gap-1 text-sm">
            {e.phone && (
              <a
                href={`tel:${e.phone}`}
                className="inline-flex min-h-11 items-center gap-2 tabular-nums underline-offset-4 hover:underline"
              >
                <Phone aria-hidden="true" className="size-4 text-muted-foreground" />
                {formatPhone(e.phone)}
              </a>
            )}
            {e.email && (
              <a
                href={`mailto:${e.email}`}
                className="inline-flex min-h-11 items-center gap-2 wrap-anywhere underline-offset-4 hover:underline"
              >
                <Mail aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {e.email}
              </a>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
            <span>Joined {formatDateTime(e.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 aria-hidden="true" className="size-3.5 text-success" />
              Consented
            </span>
          </p>
        </div>
      )}
    />
  );
}
