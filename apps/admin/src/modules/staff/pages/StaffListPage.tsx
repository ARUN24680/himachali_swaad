import type { StaffRow } from '@pk/shared';
import { Badge, Button } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { ChefHat, Pencil, ShieldAlert, ShieldCheck, UserPlus, Users, UserX } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { useMe } from '@/hooks/useMe';
import { formatDateTime } from '@/lib/dates';
import { useKitchens } from '@/modules/kitchens';
import { CreateStaffDialog, EditStaffDialog } from '../components/StaffDialogs';
import { useStaff } from '../hooks/useStaff';

type Filter = 'all' | 'ADMIN' | 'KITCHEN_PARTNER' | 'inactive';
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  ADMIN: 'Admins',
  KITCHEN_PARTNER: 'Kitchen partners',
  inactive: 'Inactive',
};
const FILTERS = Object.keys(FILTER_LABEL) as Filter[];
const matches = (s: StaffRow, f: Filter) =>
  f === 'all' ? true : f === 'inactive' ? !s.isActive : s.role === f && s.isActive;
const col = createColumnHelper<StaffRow>();

/** /staff (Phase 9 §9.7): create admins / kitchen partners, assign kitchens, deactivate, force logout, reset passwords. */
export default function StaffListPage() {
  const me = useMe();
  const staff = useStaff();
  const kitchens = useKitchens();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.find((f) => f === params.get('role')) ?? 'all';
  const q = params.get('q') ?? '';
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
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

  const all = useMemo(() => staff.data ?? [], [staff.data]);
  const rows = all.filter(
    (s) =>
      matches(s, filter) &&
      (!q || `${s.fullName ?? ''} ${s.email} ${s.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );
  const kitchenName = (id: string) => kitchens.data?.find((k) => k.id === id)?.code ?? '—';
  const adminsWithout2fa = all.filter((s) => s.role === 'ADMIN' && s.isActive && !s.totpEnabled).length;

  const columns = [
    col.accessor('fullName', {
      header: 'Name',
      cell: ({ row: { original: s } }) => (
        <span className="grid">
          <span className="font-medium">{s.fullName ?? '—'}</span>
          <span className="text-xs text-muted-foreground">{s.email}</span>
        </span>
      ),
    }),
    col.accessor('role', {
      header: 'Role',
      cell: (c) => (
        <Badge tone={c.getValue() === 'ADMIN' ? 'info' : 'batch'}>
          {c.getValue() === 'ADMIN' ? 'Admin' : 'Kitchen partner'}
        </Badge>
      ),
    }),
    col.display({
      id: 'kitchens',
      header: 'Kitchens',
      cell: ({ row: { original: s } }) =>
        s.role === 'ADMIN' ? (
          <span className="text-muted-foreground">All</span>
        ) : (
          <span className="font-mono text-xs">{s.pickupLocationIds.map(kitchenName).join(', ') || '—'}</span>
        ),
    }),
    col.accessor('totpEnabled', {
      header: '2FA',
      cell: ({ row: { original: s } }) =>
        s.totpEnabled ? (
          <Badge tone="success">On</Badge>
        ) : (
          <Badge tone={s.role === 'ADMIN' ? 'warning' : 'neutral'}>Off</Badge>
        ),
    }),
    col.accessor('lastLoginAt', {
      header: 'Last sign-in',
      cell: (c) => (
        <span className="whitespace-nowrap tabular-nums">{c.getValue() ? formatDateTime(c.getValue()!) : 'Never'}</span>
      ),
    }),
    col.accessor('isActive', {
      header: 'Status',
      cell: (c) => (c.getValue() ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>),
    }),
    col.display({
      id: 'edit',
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row: { original: s } }) => (
        <Button variant="outline" size="sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.fullName ?? s.email}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      ),
    }),
  ];

  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <UserPlus aria-hidden="true" />
      Add staff
    </Button>
  );

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="System"
        title="Staff"
        description="Who can sign in to the portal and the packing desk. Partners only ever see their own kitchen."
        actions={addButton}
      />
      <KpiGrid label="Staff summary">
        <KpiCard
          label="Active staff"
          icon={Users}
          loading={staff.isPending}
          value={all.filter((s) => s.isActive).length}
          hint={`${all.length} accounts in total`}
        />
        <KpiCard
          label="Admins"
          icon={ShieldCheck}
          loading={staff.isPending}
          value={all.filter((s) => s.isActive && s.role === 'ADMIN').length}
        />
        <KpiCard
          label="Kitchen partners"
          icon={ChefHat}
          loading={staff.isPending}
          value={all.filter((s) => s.isActive && s.role === 'KITCHEN_PARTNER').length}
        />
        <KpiCard
          label="Admins without 2FA"
          icon={adminsWithout2fa ? ShieldAlert : ShieldCheck}
          tone={adminsWithout2fa ? 'warning' : 'success'}
          loading={staff.isPending}
          value={adminsWithout2fa}
          hint={adminsWithout2fa ? 'Ask them to turn it on' : 'All admins protected'}
        />
      </KpiGrid>
      <TableCard
        label="Staff list"
        controls={
          <>
            <FilterPills
              label="Staff filter"
              value={filter}
              onChange={(v) => setParam('role', v === 'all' ? null : v)}
              options={FILTERS.map((f) => ({
                value: f,
                label: FILTER_LABEL[f],
                count: staff.data ? all.filter((s) => matches(s, f)).length : undefined,
              }))}
            />
            <SearchInput label="Search staff" placeholder="Name, email or phone" value={q} onChange={onSearch} />
          </>
        }
      >
        {staff.isPending ? (
          <DataTableSkeleton rows={4} label="Loading staff" />
        ) : staff.isError ? (
          <ErrorState
            title="Couldn’t load staff"
            message={staff.error.message}
            onRetry={() => void staff.refetch()}
            retrying={staff.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserX}
            title={all.length ? 'Nobody matches' : 'No staff yet'}
            description={all.length ? 'Try another filter or search.' : undefined}
            action={all.length ? undefined : addButton}
          />
        ) : (
          <DataTable
            label="Staff"
            columns={columns}
            data={rows}
            getRowId={(s) => s.id}
            onRowClick={setEditing}
            rowLabel={(s) => `Edit ${s.fullName ?? s.email}`}
            rowClassName={(s) => (s.isActive ? undefined : 'text-muted-foreground')}
            renderCard={(s) => (
              <span className="grid gap-1.5">
                <span className="flex items-start justify-between gap-3">
                  <span className="grid">
                    <span className="font-medium">{s.fullName ?? s.email}</span>
                    <span className="text-xs text-muted-foreground">{s.email}</span>
                  </span>
                  {s.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={s.role === 'ADMIN' ? 'info' : 'batch'}>
                    {s.role === 'ADMIN' ? 'Admin' : 'Kitchen partner'}
                  </Badge>
                  2FA {s.totpEnabled ? 'on' : 'off'} · last sign-in{' '}
                  {s.lastLoginAt ? formatDateTime(s.lastLoginAt) : 'never'}
                </span>
              </span>
            )}
          />
        )}
      </TableCard>
      {creating && <CreateStaffDialog kitchens={kitchens.data} onOpenChange={setCreating} />}
      {editing && (
        <EditStaffDialog
          key={editing.id}
          member={editing}
          kitchens={kitchens.data}
          isSelf={editing.id === me.data?.user.id}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}
