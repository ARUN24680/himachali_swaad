import type { KitchenRow } from '@pk/shared';
import { Alert, Badge, Button } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, ChefHat, Pencil, Plus, Store, Truck, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { KitchenFormDialog } from '../components/KitchenFormDialog';
import { useKitchens } from '../hooks/useKitchens';

type Filter = 'all' | 'active' | 'unlinked' | 'inactive';
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  active: 'Active',
  unlinked: 'Shiprocket not linked',
  inactive: 'Inactive',
};
const FILTERS = Object.keys(FILTER_LABEL) as Filter[];
const matches = (k: KitchenRow, f: Filter) =>
  f === 'all'
    ? true
    : f === 'active'
      ? k.isActive
      : f === 'inactive'
        ? !k.isActive
        : k.isActive && !k.shiprocketPickupName;
const col = createColumnHelper<KitchenRow>();

function ShiprocketBadge({ k }: { k: KitchenRow }) {
  return k.shiprocketPickupName ? (
    <Badge tone="success" className="max-w-full truncate" title={`Shiprocket pickup: ${k.shiprocketPickupName}`}>
      <Truck aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{k.shiprocketPickupName}</span>
    </Badge>
  ) : (
    <Badge tone={k.isActive ? 'warning' : 'neutral'}>
      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
      Shiprocket not linked
    </Badge>
  );
}

const StatusBadge = ({ active }: { active: boolean }) =>
  active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>;

const partnersLabel = (n: number) => (n === 0 ? 'No partner' : `${n} partner${n === 1 ? '' : 's'}`);

/**
 * /kitchens — pickup locations the courier collects from (before this they were SQL-only).
 * The Shiprocket pickup nickname is what lets an order from the kitchen be booked.
 */
export default function KitchensPage() {
  const kitchens = useKitchens();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.find((f) => f === params.get('show')) ?? 'all';
  const q = params.get('q') ?? '';
  const [editing, setEditing] = useState<KitchenRow | 'new' | null>(null);
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

  const all = useMemo(() => kitchens.data ?? [], [kitchens.data]);
  const rows = all.filter(
    (k) =>
      matches(k, filter) &&
      (!q || `${k.code} ${k.name} ${k.city} ${k.contactName}`.toLowerCase().includes(q.toLowerCase())),
  );
  const active = all.filter((k) => k.isActive);
  const unlinked = active.filter((k) => !k.shiprocketPickupName);
  const noPartner = active.filter((k) => k.partnerCount === 0);

  const columns = [
    col.accessor('name', {
      header: 'Kitchen',
      cell: ({ row: { original: k } }) => (
        <span className="grid">
          <span className="font-medium">{k.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{k.code}</span>
        </span>
      ),
    }),
    col.accessor('city', {
      header: 'Address',
      cell: ({ row: { original: k } }) => (
        <span className="grid max-w-64">
          <span className="truncate">{k.addressLine1}</span>
          <span className="text-xs text-muted-foreground">
            {k.city}, {k.state} <span className="tabular-nums">{k.pincode}</span>
          </span>
        </span>
      ),
    }),
    col.accessor('contactName', {
      header: 'Contact',
      cell: ({ row: { original: k } }) => (
        <span className="grid">
          <span>{k.contactName}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{k.contactPhone}</span>
        </span>
      ),
    }),
    col.accessor('shiprocketPickupName', {
      header: 'Shiprocket',
      cell: ({ row: { original: k } }) => <ShiprocketBadge k={k} />,
    }),
    col.accessor('partnerCount', {
      header: 'Partners',
      cell: ({ row: { original: k } }) => (
        <span className={k.partnerCount === 0 && k.isActive ? 'text-warning' : undefined}>
          {partnersLabel(k.partnerCount)}
        </span>
      ),
    }),
    col.accessor('isActive', { header: 'Status', cell: (c) => <StatusBadge active={c.getValue()} /> }),
    col.display({
      id: 'edit',
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row: { original: k } }) => (
        <Button variant="outline" size="sm" onClick={() => setEditing(k)} aria-label={`Edit ${k.name}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      ),
    }),
  ];

  const addButton = (
    <Button onClick={() => setEditing('new')}>
      <Plus aria-hidden="true" />
      Add kitchen
    </Button>
  );

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="System"
        title="Kitchens"
        description="Pickup addresses the courier collects packed orders from. Partners only see the kitchens assigned to them on the Staff page."
        actions={addButton}
      >
        {unlinked.length > 0 && (
          <Alert tone="warning" data-testid="unlinked-banner">
            <AlertTriangle aria-hidden="true" />
            <p className="min-w-0">
              <span className="font-semibold">
                {unlinked.length === 1
                  ? `${unlinked[0]!.name} isn’t linked to Shiprocket.`
                  : `${unlinked.length} active kitchens aren’t linked to Shiprocket.`}
              </span>{' '}
              Orders from {unlinked.length === 1 ? 'it' : 'them'} can’t be booked with a courier until you add the
              pickup address nickname exactly as it appears in Shiprocket.
            </p>
          </Alert>
        )}
      </PageHeader>
      <KpiGrid label="Kitchen summary">
        <KpiCard
          label="Active kitchens"
          icon={Store}
          loading={kitchens.isPending}
          value={active.length}
          hint={`${all.length} in total`}
        />
        <KpiCard
          label="Shiprocket linked"
          icon={Truck}
          tone={unlinked.length ? 'warning' : 'success'}
          loading={kitchens.isPending}
          value={`${active.length - unlinked.length} / ${active.length}`}
          hint={unlinked.length ? 'Add the pickup nickname' : 'Every active kitchen can ship'}
        />
        <KpiCard
          label="Partners assigned"
          icon={Users}
          loading={kitchens.isPending}
          value={all.reduce((n, k) => n + k.partnerCount, 0)}
          hint={
            <Link
              to="/staff?role=KITCHEN_PARTNER"
              className="text-accent-foreground underline-offset-4 hover:underline"
            >
              Manage on the Staff page
            </Link>
          }
        />
        <KpiCard
          label="Without a partner"
          icon={ChefHat}
          tone={noPartner.length ? 'warning' : 'default'}
          loading={kitchens.isPending}
          value={noPartner.length}
          hint={noPartner.length ? 'Nobody packs these orders' : 'Every active kitchen is staffed'}
        />
      </KpiGrid>
      <TableCard
        label="Kitchen list"
        controls={
          <>
            <FilterPills
              label="Kitchen filter"
              value={filter}
              onChange={(v) => setParam('show', v === 'all' ? null : v)}
              options={FILTERS.map((f) => ({
                value: f,
                label: FILTER_LABEL[f],
                count: kitchens.data ? all.filter((k) => matches(k, f)).length : undefined,
              }))}
            />
            <SearchInput label="Search kitchens" placeholder="Code, name or city" value={q} onChange={onSearch} />
          </>
        }
      >
        {kitchens.isPending ? (
          <DataTableSkeleton rows={3} label="Loading kitchens" />
        ) : kitchens.isError ? (
          <ErrorState
            title="Couldn’t load kitchens"
            message={kitchens.error.message}
            onRetry={() => void kitchens.refetch()}
            retrying={kitchens.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Store}
            title={all.length ? 'No kitchen matches' : 'No kitchens yet'}
            description={
              all.length
                ? 'Try another filter or search.'
                : 'Add the first pickup address so batches can be logged and orders shipped.'
            }
            action={all.length ? undefined : addButton}
          />
        ) : (
          <DataTable
            label="Kitchens"
            columns={columns}
            data={rows}
            getRowId={(k) => k.id}
            onRowClick={setEditing}
            rowLabel={(k) => `Edit ${k.name}`}
            rowClassName={(k) => (k.isActive ? undefined : 'text-muted-foreground')}
            renderCard={(k) => (
              <span className="grid min-w-0 gap-2">
                <span className="flex items-start justify-between gap-3">
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{k.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{k.code}</span>
                  </span>
                  <StatusBadge active={k.isActive} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {k.city}, {k.state} <span className="tabular-nums">{k.pincode}</span> ·{' '}
                  {partnersLabel(k.partnerCount)}
                </span>
                <span className="flex min-w-0">
                  <ShiprocketBadge k={k} />
                </span>
              </span>
            )}
          />
        )}
      </TableCard>
      {editing && (
        <KitchenFormDialog
          key={editing === 'new' ? 'new' : editing.id}
          kitchen={editing === 'new' ? null : editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}
