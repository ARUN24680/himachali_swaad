import { formatINR } from '@pk/shared';
import { Button } from '@pk/ui';
import { AlertTriangle, Download, IndianRupee, Repeat, SearchX, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { downloadFile } from '@/services/api/download';
import { toast } from '@/store/toast.store';
import { CustomersTable } from '../components/CustomersTable';
import { useCustomers } from '../hooks/useCustomers';

const SORTS = [
  { value: 'last_order_desc', label: 'Recent' },
  { value: 'ltv_desc', label: 'Top spenders' },
  { value: 'orders_desc', label: 'Most orders' },
] as const;
type Sort = (typeof SORTS)[number]['value'];
const PAGE_SIZE = 25;

/** /customers (Phase 9 §9.5): account holders + guest phones with LTV and RTO risk. PII — ADMIN only. */
export default function CustomersListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort: Sort = SORTS.find((s) => s.value === params.get('sort'))?.value ?? 'last_order_desc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useCustomers({ q: q || undefined, sort, page, pageSize: PAGE_SIZE });

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
  const onSearch = useCallback((v: string) => update({ q: v.trim() || null }), [update]);

  const rows = list.data?.customers ?? [];
  const repeat = rows.filter((c) => c.ordersCount > 1).length;
  const risky = rows.filter((c) => c.risk).length;
  const avgLtv = rows.length ? Math.round(rows.reduce((n, c) => n + c.lifetimeValuePaise, 0) / rows.length) : 0;

  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const name = await downloadFile('/admin/exports/customers', 'customers.csv');
      toast({
        title: 'Customer export downloaded',
        description: `${name} — this download was recorded in the audit log.`,
      });
      setConfirmExport(false);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Customers"
        description="Everyone who has paid for an order — account holders and guest phones — with lifetime value and RTO risk."
        actions={
          <Button variant="outline" onClick={() => setConfirmExport(true)}>
            <Download aria-hidden="true" />
            Export customers (PII)
          </Button>
        }
      />

      <KpiGrid label="Customer summary">
        <KpiCard
          label="Customers"
          icon={Users}
          loading={list.isPending}
          value={list.data?.total ?? 0}
          hint={q ? `Matching “${q}”` : 'All time'}
        />
        <KpiCard
          label="Repeat buyers"
          icon={Repeat}
          tone="success"
          loading={list.isPending}
          value={repeat}
          hint={`Of the ${rows.length} shown`}
        />
        <KpiCard
          label="Avg lifetime value"
          icon={IndianRupee}
          loading={list.isPending}
          value={formatINR(avgLtv)}
          hint={`Of the ${rows.length} shown`}
        />
        <KpiCard
          label="RTO risk"
          icon={AlertTriangle}
          tone={risky ? 'destructive' : 'default'}
          loading={list.isPending}
          value={risky}
          hint="Had a parcel returned — call before dispatch"
        />
      </KpiGrid>

      <TableCard
        label="Customer list"
        controls={
          <>
            <FilterPills
              label="Sort customers"
              value={sort}
              onChange={(v) => update({ sort: v === 'last_order_desc' ? null : v })}
              options={SORTS}
            />
            <SearchInput label="Search customers" placeholder="Name or phone" value={q} onChange={onSearch} />
          </>
        }
      >
        {list.isPending ? (
          <DataTableSkeleton rows={6} label="Loading customers" />
        ) : list.isError ? (
          <ErrorState
            title="Couldn’t load customers"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : rows.length === 0 ? (
          q ? (
            <EmptyState
              icon={SearchX}
              title="No customers match"
              description="Search by name or the 10-digit phone number."
              action={
                <Button variant="outline" onClick={() => update({ q: null })}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No customers yet"
              description="Customers appear after their first paid order."
            />
          )
        ) : (
          <CustomersTable
            rows={rows}
            fetching={list.isFetching}
            pagination={{
              page: list.data.page,
              pageSize: list.data.pageSize,
              total: list.data.total,
              onPageChange: (p) => update({ page: p === 1 ? null : String(p) }, true),
            }}
          />
        )}
      </TableCard>

      <ConfirmDialog
        open={confirmExport}
        onOpenChange={setConfirmExport}
        title="Export customer data?"
        description="The CSV holds names, phone numbers and addresses (personal data). Your download is recorded in the audit log — store it safely and delete it when done."
        confirmLabel="Download CSV"
        onConfirm={() => void runExport()}
        pending={exporting}
        error={exportError}
      />
    </div>
  );
}
