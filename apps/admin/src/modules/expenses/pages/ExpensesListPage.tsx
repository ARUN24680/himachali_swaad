import { EXPENSE_CATEGORIES, formatINR, type ExpenseRow } from '@pk/shared';
import { Badge, Button } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { FileText, Loader2, Lock, Pencil, Plus, ReceiptIndianRupee, SearchX, Trash2, Wallet } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { DateRangeFields } from '@/components/common/DateRangeFields';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatCalendarDate } from '@/lib/dates';
import { useStaff } from '@/modules/staff';
import { openSignedUrl } from '@/services/api/download';
import { toast } from '@/store/toast.store';
import { expensesApi } from '../api/expensesApi';
import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { CATEGORY_LABEL, type ExpenseCategory } from '../components/expenseMeta';
import { useDeleteExpense, useExpenses } from '../hooks/useExpenses';

const PAGE_SIZE = 25;
type Filter = 'all' | ExpenseCategory;
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const col = createColumnHelper<ExpenseRow>();

/** /expenses (Phase 9 §9.8): shared costs that reduce the settlement profit pool. */
export default function ExpensesListPage() {
  const [params, setParams] = useSearchParams();
  const category: Filter = (EXPENSE_CATEGORIES as readonly string[]).includes(params.get('category') ?? '')
    ? (params.get('category') as ExpenseCategory)
    : 'all';
  const from = isDate(params.get('from'));
  const to = isDate(params.get('to'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useExpenses({
    page,
    pageSize: PAGE_SIZE,
    ...(category !== 'all' ? { category } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const staff = useStaff();
  const remove = useDeleteExpense();
  const [editing, setEditing] = useState<ExpenseRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

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

  const viewReceipt = async (e: ExpenseRow) => {
    setOpening(e.id);
    try {
      const blocked = await openSignedUrl(() => expensesApi.receipt(e.id));
      if (blocked)
        toast({
          title: 'Pop-up blocked',
          description: 'Allow pop-ups for this site, then try again.',
          tone: 'neutral',
        });
    } catch (err) {
      toast({ title: 'Couldn’t open the receipt', description: (err as Error).message, tone: 'destructive' });
    } finally {
      setOpening(null);
    }
  };

  const rows = list.data?.expenses ?? [];
  const lockedCount = rows.filter((e) => e.locked).length;
  const outOfPocket = rows.filter((e) => e.paidBy).reduce((n, e) => n + e.amountPaise, 0);
  const missingReceipts = rows.filter((e) => !e.receiptAvailable).length;

  const receiptCell = (e: ExpenseRow) =>
    e.receiptAvailable ? (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void viewReceipt(e)}
        disabled={opening === e.id}
        aria-label={`View receipt for ${e.description}`}
      >
        {opening === e.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
        View
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">None</span>
    );

  const columns = [
    col.accessor('incurredOn', {
      header: 'Date',
      cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatCalendarDate(c.getValue())}</span>,
    }),
    col.accessor('category', {
      header: 'Category',
      cell: (c) => <Badge tone="neutral">{CATEGORY_LABEL[c.getValue()]}</Badge>,
    }),
    col.accessor('description', {
      header: 'Description',
      meta: { className: 'max-w-72' },
      cell: (c) => <span className="line-clamp-2">{c.getValue()}</span>,
    }),
    col.accessor('paidBy', {
      header: 'Paid by',
      cell: (c) => c.getValue()?.name ?? <span className="text-muted-foreground">Business</span>,
    }),
    col.accessor('amountPaise', {
      header: 'Amount',
      meta: { align: 'right' },
      cell: (c) => <span className="font-semibold tabular-nums">{formatINR(c.getValue())}</span>,
    }),
    col.display({ id: 'receipt', header: 'Receipt', cell: ({ row }) => receiptCell(row.original) }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row: { original: e } }) =>
        e.locked ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title="Part of a finalized settlement — read-only"
          >
            <Lock aria-hidden="true" className="size-3.5" />
            Locked
          </span>
        ) : (
          <span className="inline-flex gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit ${e.description}`} onClick={() => setEditing(e)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${e.description}`}
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDeleting(e)}
            >
              <Trash2 />
            </Button>
          </span>
        ),
    }),
  ];

  const addButton = (
    <Button onClick={() => setEditing('new')}>
      <Plus aria-hidden="true" />
      Add expense
    </Button>
  );
  const filtered = category !== 'all' || Boolean(from || to);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Ads, packaging, software, compliance — everything that comes off the shared profit pool. Expenses inside a finalized settlement are locked."
        actions={addButton}
      />
      <KpiGrid label="Expense summary">
        <KpiCard
          label={filtered ? 'Total (filtered)' : 'Total recorded'}
          icon={ReceiptIndianRupee}
          loading={list.isPending}
          value={formatINR(list.data?.totalPaise ?? 0)}
          hint={`${list.data?.total ?? 0} expense${list.data?.total === 1 ? '' : 's'}`}
        />
        <KpiCard
          label="Out of pocket"
          icon={Wallet}
          tone={outOfPocket ? 'info' : 'default'}
          loading={list.isPending}
          value={formatINR(outOfPocket)}
          hint="On this page · reimbursed in settlement"
        />
        <KpiCard
          label="Missing receipts"
          icon={FileText}
          tone={missingReceipts ? 'warning' : 'success'}
          loading={list.isPending}
          value={missingReceipts}
          hint="On this page"
        />
        <KpiCard
          label="Locked"
          icon={Lock}
          loading={list.isPending}
          value={lockedCount}
          hint="In a finalized settlement (this page)"
        />
      </KpiGrid>
      <TableCard
        label="Expense list"
        controls={
          <>
            <FilterPills
              label="Category"
              value={category}
              onChange={(v) => update({ category: v === 'all' ? null : v })}
              options={[
                { value: 'all' as Filter, label: 'All' },
                ...EXPENSE_CATEGORIES.map((c) => ({ value: c as Filter, label: CATEGORY_LABEL[c] })),
              ]}
            />
            <DateRangeFields
              from={from}
              to={to}
              labelPrefix="Expenses "
              onChange={(r) => update({ from: r.from || null, to: r.to || null })}
            />
          </>
        }
      >
        {list.isPending ? (
          <DataTableSkeleton rows={5} label="Loading expenses" />
        ) : list.isError ? (
          <ErrorState
            title="Couldn’t load expenses"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No expenses match"
              description="Try another category or date range."
              action={
                <Button variant="outline" onClick={() => update({ category: null, from: null, to: null })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ReceiptIndianRupee}
              title="No expenses yet"
              description="Record ad spend and other shared costs so settlements are accurate."
              action={addButton}
            />
          )
        ) : (
          <DataTable
            label="Expenses"
            columns={columns}
            data={rows}
            getRowId={(e) => e.id}
            fetching={list.isFetching}
            rowClassName={(e) => (e.locked ? 'text-muted-foreground' : undefined)}
            pagination={{
              page: list.data.page,
              pageSize: list.data.pageSize,
              total: list.data.total,
              onPageChange: (p) => update({ page: p === 1 ? null : String(p) }, true),
            }}
            renderCard={(e) => (
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid min-w-0">
                    <span className="font-medium">{e.description}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCalendarDate(e.incurredOn)} · {CATEGORY_LABEL[e.category]} · {e.paidBy?.name ?? 'Business'}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatINR(e.amountPaise)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {receiptCell(e)}
                  {e.locked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock aria-hidden="true" className="size-3.5" />
                      Locked
                    </span>
                  ) : (
                    <span className="inline-flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(e)}
                        aria-label={`Edit ${e.description}`}
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${e.description}`}
                        className="text-destructive"
                        onClick={() => setDeleting(e)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </TableCard>

      {editing && (
        <ExpenseFormDialog
          key={editing === 'new' ? 'new' : editing.id}
          expense={editing === 'new' ? null : editing}
          staff={staff.data}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this expense?"
        description={
          deleting
            ? `${deleting.description} · ${formatINR(deleting.amountPaise)}. This can’t be undone (the audit log keeps a copy).`
            : undefined
        }
        confirmLabel="Delete"
        tone="destructive"
        pending={remove.isPending}
        error={remove.error?.message}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast({ title: 'Expense deleted' });
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}
