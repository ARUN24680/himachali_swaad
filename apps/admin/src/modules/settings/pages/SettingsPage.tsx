import { type EditableSettingKey, type SettingsListResponse } from '@pk/shared';
import { Badge, Button } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { Handshake, Lock, Pencil, SearchX, Settings2, Truck, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatDateTime, formatIstDay } from '@/lib/dates';
import { SettingEditDialog } from '../components/SettingEditDialog';
import { formatSettingValue, GROUP_LABEL, metaFor, type SettingGroup } from '../components/settingMeta';
import { useSettings } from '../hooks/useSettings';

type Row = SettingsListResponse['settings'][number];
type Filter = 'all' | SettingGroup;
const FILTERS: Filter[] = ['all', 'shipping', 'orders', 'inventory', 'finance', 'other'];
const col = createColumnHelper<Row>();

const groupOf = (r: Row): SettingGroup => metaFor(r.key)?.group ?? 'other';
const labelOf = (r: Row) => metaFor(r.key)?.label ?? r.key.replaceAll('_', ' ');
/** COD is pinned off at launch (D-25) — shown, never edited. */
const isEditable = (r: Row) => r.editable && Boolean(metaFor(r.key)) && metaFor(r.key)?.kind !== 'cod';

/** /settings (Phase 9 §9.7): business knobs without a deploy. Every save is audited (SETTING_UPDATE). */
export default function SettingsPage() {
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.find((f) => f === params.get('group')) ?? 'all';
  const q = params.get('q') ?? '';
  const [editing, setEditing] = useState<Row | null>(null);
  const setParam = useCallback(
    (k: string, v: string | null) =>
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      }),
    [setParams],
  );
  const onSearch = useCallback((v: string) => setParam('q', v.trim() || null), [setParam]);

  const all = useMemo(() => settings.data ?? [], [settings.data]);
  const rows = all.filter(
    (r) =>
      (filter === 'all' || groupOf(r) === filter) &&
      (!q || `${r.key} ${labelOf(r)} ${r.description ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );
  const find = (key: string) => all.find((r) => r.key === key);
  const lastChange = all.reduce<string | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);
  const freeShip = find('free_shipping_threshold_paise');
  const split = find('partner_split_bp');

  const columns = [
    col.display({
      id: 'setting',
      header: 'Setting',
      cell: ({ row: { original: r } }) => (
        <span className="grid max-w-md gap-0.5">
          <span className="font-medium">{labelOf(r)}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
          {r.description && <span className="text-xs text-muted-foreground">{r.description}</span>}
        </span>
      ),
    }),
    col.display({
      id: 'value',
      header: 'Value',
      cell: ({ row: { original: r } }) => (
        <span className={r.value == null ? 'text-warning' : 'font-medium tabular-nums'}>
          {formatSettingValue(r.key, r.value)}
        </span>
      ),
    }),
    col.display({
      id: 'group',
      header: 'Area',
      cell: ({ row }) => <Badge tone="neutral">{GROUP_LABEL[groupOf(row.original)]}</Badge>,
    }),
    col.accessor('updatedAt', {
      header: 'Updated',
      cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
    }),
    col.display({
      id: 'edit',
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row: { original: r } }) =>
        isEditable(r) ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(r)} aria-label={`Edit ${labelOf(r)}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock aria-hidden="true" className="size-3.5" />
            {metaFor(r.key)?.kind === 'cod' ? 'COD v2' : 'Read-only'}
          </span>
        ),
    }),
  ];

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Shipping, checkout, stock and settlement rules. Changes apply at once and are written to the audit log."
        actions={
          <Button asChild variant="outline">
            <Link to="/staff">
              <Users aria-hidden="true" />
              Manage staff
            </Link>
          </Button>
        }
      />

      <KpiGrid label="Settings summary">
        <KpiCard
          label="Editable settings"
          icon={Settings2}
          loading={settings.isPending}
          value={all.filter(isEditable).length}
          hint={`${all.length} in total`}
        />
        <KpiCard
          label="Free shipping above"
          icon={Truck}
          tone={freeShip?.value == null ? 'warning' : 'default'}
          loading={settings.isPending}
          value={freeShip ? formatSettingValue(freeShip.key, freeShip.value) : '—'}
          hint={freeShip?.value == null ? 'Not decided — checkout charges ₹0 (D-50)' : 'Cart total incl. GST'}
        />
        <KpiCard
          label="Partner share"
          icon={Handshake}
          loading={settings.isPending}
          value={split ? formatSettingValue(split.key, split.value) : '—'}
          hint="Default split for new settlements"
        />
        <KpiCard
          label="Last change"
          icon={Pencil}
          loading={settings.isPending}
          value={lastChange ? formatIstDay(lastChange) : '—'}
          hint={lastChange ? `${formatDateTime(lastChange)} IST` : undefined}
        />
      </KpiGrid>

      <TableCard
        label="Settings list"
        controls={
          <>
            <FilterPills
              label="Settings area"
              value={filter}
              onChange={(v) => setParam('group', v === 'all' ? null : v)}
              options={FILTERS.filter(
                (f) => f === 'all' || f !== 'other' || all.some((r) => groupOf(r) === 'other'),
              ).map((f) => ({
                value: f,
                label: f === 'all' ? 'All' : GROUP_LABEL[f],
                count: settings.data
                  ? f === 'all'
                    ? all.length
                    : all.filter((r) => groupOf(r) === f).length
                  : undefined,
              }))}
            />
            <SearchInput label="Search settings" placeholder="Search settings" value={q} onChange={onSearch} />
          </>
        }
      >
        {settings.isPending ? (
          <DataTableSkeleton rows={6} label="Loading settings" />
        ) : settings.isError ? (
          <ErrorState
            title="Couldn’t load settings"
            message={settings.error.message}
            onRetry={() => void settings.refetch()}
            retrying={settings.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No settings match" description="Try another area or search word." />
        ) : (
          <DataTable
            label="Settings"
            columns={columns}
            data={rows}
            getRowId={(r) => r.key}
            onRowClick={(r) => isEditable(r) && setEditing(r)}
            rowLabel={(r) => (isEditable(r) ? `Edit ${labelOf(r)}` : labelOf(r))}
            renderCard={(r) => (
              <span className="grid gap-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-medium">{labelOf(r)}</span>
                  {isEditable(r) ? (
                    <Pencil aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Lock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  )}
                </span>
                <span className={r.value == null ? 'text-sm text-warning' : 'text-sm tabular-nums'}>
                  {formatSettingValue(r.key, r.value)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
              </span>
            )}
          />
        )}
      </TableCard>

      {editing && (
        <SettingEditDialog
          key={editing.key}
          settingKey={editing.key as EditableSettingKey}
          value={editing.value}
          description={editing.description}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}
