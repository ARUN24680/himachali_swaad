import { ADMIN_ORDER_TABS, type AdminOrderTab, type AdminOrdersQuery } from '@pk/shared';
import { Button } from '@pk/ui';
import { AlertTriangle, Download, Loader2, PackageOpen, RotateCcw, SearchX, Truck } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { DataTableSkeleton } from '@/components/common/DataTable';
import { DateRangeFields } from '@/components/common/DateRangeFields';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { downloadFile } from '@/services/api/download';
import { toast } from '@/store/toast.store';
import { OrderDetailDrawer } from '../components/OrderDetailDrawer';
import { ORDER_SORTS, sortToState, stateToSort, TAB_LABEL, type OrderSort } from '../components/orderMeta';
import { OrdersTable } from '../components/OrdersTable';
import { useAdminOrders } from '../hooks/useOrders';

const PAGE_SIZE = 25;
const isTab = (v: string | null): v is AdminOrderTab => ADMIN_ORDER_TABS.includes(v as AdminOrderTab);
const isSort = (v: string | null): v is OrderSort => ORDER_SORTS.includes(v as OrderSort);
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/**
 * /orders (+ /orders/:orderCode → detail drawer over the list). Every filter lives in the query
 * string (tab, q, from, to, page, sort), so a tab change is a client-side navigation + refetch,
 * never a reload, and any view can be bookmarked / shared.
 */
export default function OrdersListPage() {
  const { orderCode } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: AdminOrderTab = isTab(params.get('tab')) ? (params.get('tab') as AdminOrderTab) : 'all';
  const q = params.get('q') ?? '';
  const from = isDate(params.get('from'));
  const to = isDate(params.get('to'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort: OrderSort = isSort(params.get('sort')) ? (params.get('sort') as OrderSort) : 'created_desc';

  const query: AdminOrdersQuery = {
    tab,
    page,
    pageSize: PAGE_SIZE,
    sort,
    ...(q ? { q } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const list = useAdminOrders(query);
  const counts = list.data?.counts;

  /** Patch the query string; any filter change goes back to page 1. */
  const update = useCallback(
    (patch: Record<string, string | null>, keepPage = false) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) p.set(k, v);
            else p.delete(k);
          }
          if (!keepPage) p.delete('page');
          return p;
        },
        { replace: false },
      ),
    [setParams],
  );
  const onSearch = useCallback((v: string) => update({ q: v.trim() || null }), [update]);

  const search = params.toString();
  const hrefFor = (code: string) => `/orders/${code}${search ? `?${search}` : ''}`;
  const filtered = Boolean(q || from || to);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
      const name = await downloadFile(`/admin/exports/orders${qs ? `?${qs}` : ''}`, 'orders.csv');
      toast({ title: 'Export ready', description: `${name} downloaded.` });
    } catch (err) {
      toast({ title: 'Export failed', description: (err as Error).message, tone: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Every order from payment to doorstep. Search by order code, phone or AWB; open a row for the full story and actions."
        actions={
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Export CSV
          </Button>
        }
      />

      <KpiGrid label="Order summary">
        <KpiCard
          label="Awaiting packing"
          icon={PackageOpen}
          tone={counts && counts.awaiting_packing > 0 ? 'warning' : 'default'}
          loading={!counts}
          value={counts?.awaiting_packing ?? 0}
          hint="Paid, at the kitchen"
        />
        <KpiCard
          label="In transit"
          icon={Truck}
          tone="info"
          loading={!counts}
          value={counts?.in_transit ?? 0}
          hint="With the courier"
        />
        <KpiCard
          label="Needs attention"
          icon={AlertTriangle}
          tone={counts && counts.attention > 0 ? 'destructive' : 'default'}
          loading={!counts}
          value={counts?.attention ?? 0}
          hint={counts && counts.attention > 0 ? 'Ops issues + failed deliveries' : 'All clear'}
        />
        <KpiCard
          label="NDR · RTO"
          icon={RotateCcw}
          tone={counts && counts.ndr + counts.rto > 0 ? 'warning' : 'default'}
          loading={!counts}
          value={counts ? `${counts.ndr} · ${counts.rto}` : 0}
          hint="Failed attempts · returning"
        />
      </KpiGrid>

      <TableCard
        label="Order list"
        controls={
          <>
            <FilterPills
              label="Order status"
              value={tab}
              onChange={(v) => update({ tab: v === 'all' ? null : v })}
              options={ADMIN_ORDER_TABS.map((t) => ({
                value: t,
                label: TAB_LABEL[t],
                count: counts?.[t],
                alert: t === 'attention',
              }))}
            />
            <div className="grid min-w-0 gap-2 sm:flex sm:items-center">
              <DateRangeFields
                from={from}
                to={to}
                labelPrefix="Orders "
                onChange={(r) => update({ from: r.from || null, to: r.to || null })}
              />
              <SearchInput label="Search orders" placeholder="Order code, phone or AWB" value={q} onChange={onSearch} />
            </div>
          </>
        }
      >
        {list.isPending ? (
          <DataTableSkeleton rows={6} label="Loading orders" />
        ) : list.isError ? (
          <ErrorState
            title="Couldn’t load orders"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : list.data.orders.length === 0 ? (
          filtered || tab !== 'all' ? (
            <EmptyState
              icon={SearchX}
              title={tab === 'attention' && !filtered ? 'Nothing needs attention' : 'No orders match'}
              description={
                tab === 'attention' && !filtered
                  ? 'No ops issues or failed deliveries right now.'
                  : 'Try another tab, a different search or a wider date range.'
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={() => update({ q: null, from: null, to: null })}>
                    Clear search & dates
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon={PackageOpen}
              title="No orders yet"
              description="Paid orders appear here the moment Razorpay confirms them."
            />
          )
        ) : (
          <OrdersTable
            orders={list.data.orders}
            hrefFor={hrefFor}
            sorting={sortToState(sort)}
            onSortingChange={(s) => update({ sort: stateToSort(s) === 'created_desc' ? null : stateToSort(s) })}
            pagination={{
              page: list.data.page,
              pageSize: list.data.pageSize,
              total: list.data.total,
              onPageChange: (p) => update({ page: p === 1 ? null : String(p) }, true),
            }}
            fetching={list.isFetching}
          />
        )}
      </TableCard>

      <OrderDetailDrawer
        orderCode={orderCode}
        onClose={() => void navigate({ pathname: '/orders', search: search ? `?${search}` : '' })}
      />
    </div>
  );
}
