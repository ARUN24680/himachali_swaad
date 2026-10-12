import { Badge, Button, Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { Clock, Fingerprint, ListFilter, ScrollText, SearchX, UserRound, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatDateTime, formatDateTimeFull, formatIstDay } from '@/lib/dates';
import type { AuditEntry } from '../api/auditLogApi';
import { useAuditLog } from '../hooks/useAuditLog';

const ENTITY_TYPES = [
  'all',
  'order',
  'settlement',
  'expense',
  'setting',
  'user',
  'product',
  'inventory_batch',
  'webhook_event',
  'export',
] as const;
type EntityFilter = (typeof ENTITY_TYPES)[number];
const ENTITY_LABEL: Record<EntityFilter, string> = {
  all: 'All',
  order: 'Orders',
  settlement: 'Settlements',
  expense: 'Expenses',
  setting: 'Settings',
  user: 'Staff',
  product: 'Products',
  inventory_batch: 'Batches',
  webhook_event: 'Webhooks',
  export: 'Exports',
};
const PAGE_SIZE = 50;
const col = createColumnHelper<AuditEntry>();
const pretty = (v: unknown) => (v == null ? '—' : JSON.stringify(v, null, 2));

/** Keys whose value differs between before and after (top level). */
function changedKeys(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]),
  );
}

/** /audit-log — who changed what, with before/after JSON (every admin mutation, Phase 9). */
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const entityType: EntityFilter = ENTITY_TYPES.find((e) => e === params.get('entityType')) ?? 'all';
  const entityId = params.get('entityId') ?? '';
  const action = params.get('action') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const log = useAuditLog({
    page,
    pageSize: PAGE_SIZE,
    ...(entityType !== 'all' ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(action ? { action } : {}),
  });
  const [open, setOpen] = useState<AuditEntry | null>(null);

  const update = useCallback(
    (patch: Record<string, string | null>, keepPage = false) =>
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        if (!keepPage) p.delete('page');
        return p;
      }),
    [setParams],
  );
  const onSearch = useCallback((v: string) => update({ entityId: v.trim() || null }), [update]);

  const rows = log.data?.entries ?? [];
  const actors = new Set(rows.map((e) => e.actor?.email ?? 'system')).size;
  const topAction = Object.entries(
    rows.reduce<Record<string, number>>((m, e) => ({ ...m, [e.action]: (m[e.action] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1])[0];

  const actionBadge = (e: AuditEntry) => (
    <button
      type="button"
      onClick={() => update({ action: e.action })}
      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Show only ${e.action}`}
    >
      <Badge tone="neutral" className="font-mono">
        {e.action}
      </Badge>
    </button>
  );

  const columns = [
    col.accessor('createdAt', {
      header: 'When (IST)',
      cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
    }),
    col.accessor('action', { header: 'Action', cell: ({ row }) => actionBadge(row.original) }),
    col.display({
      id: 'entity',
      header: 'Entity',
      cell: ({ row: { original: e } }) => (
        <span className="grid">
          <span className="text-xs text-muted-foreground">{e.entityType}</span>
          <span className="max-w-56 truncate font-mono text-xs">{e.entityId}</span>
        </span>
      ),
    }),
    col.display({
      id: 'actor',
      header: 'By',
      cell: ({ row: { original: e } }) => e.actor?.email ?? <span className="text-muted-foreground">System</span>,
    }),
    col.display({
      id: 'changes',
      header: 'Changed',
      cell: ({ row: { original: e } }) => {
        const keys = changedKeys(e.before, e.after);
        return (
          <span className="line-clamp-1 max-w-56 font-mono text-xs text-muted-foreground">
            {keys.join(', ') || '—'}
          </span>
        );
      },
    }),
    col.accessor('ip', {
      header: 'IP',
      cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.getValue() ?? '—'}</span>,
    }),
  ];

  const filtered = entityType !== 'all' || Boolean(entityId || action);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="Every admin change — refunds, cancellations, settings, settlements, staff — with who did it and the before/after values."
      />
      <KpiGrid label="Audit summary">
        <KpiCard
          label={filtered ? 'Matching entries' : 'Entries'}
          icon={ScrollText}
          loading={log.isPending}
          value={log.data?.total ?? 0}
        />
        <KpiCard label="People on this page" icon={UserRound} loading={log.isPending} value={actors} />
        <KpiCard
          label="Most frequent"
          icon={Fingerprint}
          loading={log.isPending}
          value={topAction?.[0] ?? '—'}
          hint={topAction ? `${topAction[1]}× on this page` : undefined}
        />
        <KpiCard
          label="Latest"
          icon={Clock}
          loading={log.isPending}
          value={rows[0] ? formatIstDay(rows[0].createdAt) : '—'}
          hint={rows[0] ? `${formatDateTime(rows[0].createdAt)} IST` : undefined}
        />
      </KpiGrid>
      <TableCard
        label="Audit entries"
        controls={
          <>
            <FilterPills
              label="Entity type"
              value={entityType}
              onChange={(v) => update({ entityType: v === 'all' ? null : v })}
              options={ENTITY_TYPES.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {action && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => update({ action: null })}
                  aria-label={`Remove action filter ${action}`}
                >
                  <ListFilter aria-hidden="true" />
                  <span className="font-mono">{action}</span>
                  <X aria-hidden="true" />
                </Button>
              )}
              <SearchInput
                label="Search by entity ID"
                placeholder="Entity ID, e.g. PK-7KQ2M9"
                value={entityId}
                onChange={onSearch}
              />
            </div>
          </>
        }
      >
        {log.isPending ? (
          <DataTableSkeleton rows={6} label="Loading audit log" />
        ) : log.isError ? (
          <ErrorState
            title="Couldn’t load the audit log"
            message={log.error.message}
            onRetry={() => void log.refetch()}
            retrying={log.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={filtered ? 'No entries match' : 'No admin changes yet'}
            action={
              filtered ? (
                <Button variant="outline" onClick={() => update({ entityType: null, entityId: null, action: null })}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            label="Audit entries"
            columns={columns}
            data={rows}
            getRowId={(e) => String(e.id)}
            onRowClick={setOpen}
            rowLabel={(e) => `${e.action} on ${e.entityType} ${e.entityId}`}
            fetching={log.isFetching}
            pagination={{
              page: log.data.page,
              pageSize: log.data.pageSize,
              total: log.data.total,
              onPageChange: (p) => update({ page: p === 1 ? null : String(p) }, true),
            }}
            renderCard={(e) => (
              <span className="grid gap-1">
                <span className="flex items-center justify-between gap-2">
                  <Badge tone="neutral" className="font-mono">
                    {e.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(e.createdAt)}</span>
                </span>
                <span className="truncate font-mono text-xs">
                  {e.entityType} · {e.entityId}
                </span>
                <span className="text-xs text-muted-foreground">{e.actor?.email ?? 'System'}</span>
              </span>
            )}
          />
        )}
      </TableCard>

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="sm:max-w-2xl">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{open.action}</SheetTitle>
                <SheetDescription>
                  {open.entityType} <span className="font-mono">{open.entityId}</span> · {open.actor?.email ?? 'System'}{' '}
                  · {formatDateTimeFull(open.createdAt)}
                  {open.ip && <> · {open.ip}</>}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="grid content-start gap-4">
                {changedKeys(open.before, open.after).length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Changed: </span>
                    <span className="font-mono">{changedKeys(open.before, open.after).join(', ')}</span>
                  </p>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  {(
                    [
                      ['Before', open.before],
                      ['After', open.after],
                    ] as const
                  ).map(([label, v]) => (
                    <section key={label} className="grid min-w-0 gap-2">
                      <h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                        {label}
                      </h3>
                      <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                        {pretty(v)}
                      </pre>
                    </section>
                  ))}
                </div>
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
