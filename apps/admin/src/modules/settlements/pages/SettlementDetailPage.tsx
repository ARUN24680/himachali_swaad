import { formatINR, type SettlementDetail } from '@pk/shared';
import { Alert, Badge, Button, StatusBadge } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Download,
  FileText,
  Loader2,
  Lock,
  Package,
  Scale,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatCalendarDate, formatDateTime, formatDateTimeFull } from '@/lib/dates';
import { CATEGORY_LABEL } from '@/modules/expenses';
import { downloadFile, openSignedUrl } from '@/services/api/download';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { settlementsApi } from '../api/settlementsApi';
import { ADMIN_BREAKDOWN_LABELS, ADMIN_STEPPER_LABELS, periodLabel, WARNING_LABEL } from '../components/labels';
import { Money, SettlementBreakdown, SettlementStepper } from '../components/SettlementBreakdown';
import { MarkPaidDialog } from '../components/SettlementDialogs';
import { useSettlement, useSettlementActions } from '../hooks/useSettlements';

type Item = SettlementDetail['items'][number];
type Expense = SettlementDetail['expenses'][number];
type View = 'statement' | 'orders' | 'expenses' | 'warnings';
const itemCol = createColumnHelper<Item>();
const expCol = createColumnHelper<Expense>();

const money = (key: keyof Item & `${string}Paise`, header: string) =>
  itemCol.accessor(key, { header, meta: { align: 'right' }, cell: (c) => <Money paise={c.getValue() as number} /> });

const itemColumns = [
  itemCol.accessor('orderCode', {
    header: 'Order',
    cell: (c) => (
      <Link to={`/orders/${c.getValue()}`} className="font-mono font-semibold underline-offset-4 hover:underline">
        {c.getValue()}
      </Link>
    ),
  }),
  itemCol.accessor('status', { header: 'Closed as', cell: (c) => <StatusBadge status={c.getValue()} kind="order" /> }),
  itemCol.accessor('closedAt', {
    header: 'Closed',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
  }),
  itemCol.accessor('jars', {
    header: 'Jars',
    meta: { align: 'right' },
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  money('revenueExGstPaise', 'Revenue ex-GST'),
  money('rawCostPaise', 'Raw cost'),
  money('packagingCostPaise', 'Packaging'),
  money('freightPaise', 'Freight'),
  money('gatewayFeePaise', 'Gateway'),
  money('refundsPaise', 'Refunds'),
  money('rtoFreightPaise', 'RTO'),
  itemCol.accessor('netPaise', {
    header: 'Net',
    meta: { align: 'right' },
    cell: (c) => <Money paise={c.getValue()} className="font-semibold" />,
  }),
];

const expenseColumns = [
  expCol.accessor('incurredOn', {
    header: 'Date',
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatCalendarDate(c.getValue())}</span>,
  }),
  expCol.accessor('category', {
    header: 'Category',
    cell: (c) => <Badge tone="neutral">{CATEGORY_LABEL[c.getValue()]}</Badge>,
  }),
  expCol.accessor('description', { header: 'Description' }),
  expCol.accessor('paidBy', { header: 'Paid by', cell: (c) => c.getValue()?.name ?? 'Business' }),
  expCol.accessor('amountPaise', {
    header: 'Amount',
    meta: { align: 'right' },
    cell: (c) => <Money paise={c.getValue()} className="font-semibold" />,
  }),
];

/** /settlements/:id — draft review (warnings block finalize), finalize, mark paid, statement + CSV. */
export default function SettlementDetailPage() {
  const { settlementId } = useParams();
  const detail = useSettlement(settlementId);
  const [view, setView] = useState<View>('statement');

  if (detail.isPending)
    return (
      <div className="grid gap-6">
        <PageHeader eyebrow="Settlements" title="Settlement" />
        <DataTableSkeleton rows={6} label="Loading settlement" />
      </div>
    );
  if (detail.isError)
    return (
      <div className="grid gap-6">
        <PageHeader eyebrow={<BackLink />} title="Settlement" />
        <ErrorState
          title={
            isApiError(detail.error) && detail.error.status === 404
              ? 'Settlement not found'
              : 'Couldn’t load this settlement'
          }
          message={detail.error.message}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      </div>
    );
  return <Detail d={detail.data} view={view} setView={setView} />;
}

function BackLink() {
  return (
    <Link to="/settlements" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      Settlements
    </Link>
  );
}

function Detail({ d, view, setView }: { d: SettlementDetail; view: View; setView: (v: View) => void }) {
  const s = d.settlement;
  const navigate = useNavigate();
  const actions = useSettlementActions(s.id);
  const [confirm, setConfirm] = useState<'finalize' | 'delete' | null>(null);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const isDraft = s.status === 'DRAFT';

  const statement = async () => {
    setBusy('pdf');
    try {
      const blocked = await openSignedUrl(() => settlementsApi.statement(s.id));
      if (blocked)
        toast({
          title: 'Pop-up blocked',
          description: 'Allow pop-ups for this site, then try again.',
          tone: 'neutral',
        });
    } catch (err) {
      toast({ title: 'Couldn’t open the statement', description: (err as Error).message, tone: 'destructive' });
    } finally {
      setBusy(null);
    }
  };
  const csv = async () => {
    setBusy('csv');
    try {
      const name = await downloadFile(
        `/admin/exports/settlement?settlementId=${s.id}`,
        `settlement-${s.periodStart}.csv`,
      );
      toast({ title: 'Export ready', description: `${name} downloaded.` });
    } catch (err) {
      toast({ title: 'Export failed', description: (err as Error).message, tone: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const headerActions = (
    <>
      {isDraft && (
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => setConfirm('delete')}
        >
          <Trash2 aria-hidden="true" />
          Delete draft
        </Button>
      )}
      <Button variant="outline" onClick={() => void csv()} disabled={busy === 'csv'}>
        {busy === 'csv' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        Export CSV
      </Button>
      {d.statementAvailable && (
        <Button variant="outline" onClick={() => void statement()} disabled={busy === 'pdf'}>
          {busy === 'pdf' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
          Statement PDF
        </Button>
      )}
      {isDraft && (
        <Button
          onClick={() => setConfirm('finalize')}
          disabled={!d.canFinalize}
          aria-describedby={!d.canFinalize ? 'finalize-blocked' : undefined}
        >
          <Lock aria-hidden="true" />
          Finalize
        </Button>
      )}
      {s.status === 'FINALIZED' && (
        <Button onClick={() => setPaying(true)}>
          <Banknote aria-hidden="true" />
          Mark paid
        </Button>
      )}
    </>
  );

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={<BackLink />}
        title={periodLabel(s)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={s.status} />
            <span>
              Partner share {s.partnerSplitBp / 100}% · generated {formatDateTimeFull(s.createdAt)}
              {s.bankReference && (
                <>
                  {' '}
                  · bank ref <span className="font-mono">{s.bankReference}</span>
                </>
              )}
            </span>
          </span>
        }
        actions={headerActions}
      >
        <div className="grid gap-3">
          <SettlementStepper s={s} labels={ADMIN_STEPPER_LABELS} formatDate={(iso) => formatDateTime(iso)} />
          {isDraft && d.warnings.length > 0 && (
            <Alert tone="warning" id="finalize-blocked">
              <AlertTriangle aria-hidden="true" />
              <span>
                <span className="font-semibold">
                  Finalize is blocked — {d.warnings.length} order{d.warnings.length === 1 ? '' : 's'} missing cost data.
                </span>{' '}
                Freight and gateway fees arrive from Shiprocket / Razorpay; delete this draft and regenerate once
                they’re in.{' '}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-4"
                  onClick={() => setView('warnings')}
                >
                  See the list
                </button>
              </span>
            </Alert>
          )}
          {!isDraft && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock aria-hidden="true" className="size-3.5" />
              Finalized numbers are locked — read-only.
            </p>
          )}
        </div>
      </PageHeader>

      <KpiGrid label="Settlement totals">
        <KpiCard
          label="Orders · jars"
          icon={Package}
          value={`${s.ordersCount} · ${s.jarsCount}`}
          hint={`Revenue ex-GST ${formatINR(s.revenueExGstPaise)}`}
        />
        <KpiCard
          label="Net profit pool"
          icon={Scale}
          tone={s.netProfitPaise < 0 ? 'destructive' : 'success'}
          value={<Money paise={s.netProfitPaise} />}
          hint={`After ${formatINR(s.sharedExpensesPaise)} shared expenses`}
        />
        <KpiCard
          label="Partner payout"
          icon={Wallet}
          tone="info"
          value={formatINR(s.partnerPayoutPaise)}
          hint={`Raw cost ${formatINR(s.rawCostPaise)} + share ${formatINR(s.partnerSharePaise)}`}
        />
        <KpiCard
          label="Admin share"
          icon={Users}
          value={<Money paise={s.adminSharePaise} />}
          hint="Remainder after the rounded-down partner share"
        />
      </KpiGrid>

      <TableCard
        label="Settlement details"
        controls={
          <FilterPills
            label="Settlement section"
            value={view}
            onChange={setView}
            options={[
              { value: 'statement', label: 'Statement' },
              { value: 'orders', label: 'Orders', count: d.items.length },
              { value: 'expenses', label: 'Expenses', count: d.expenses.length },
              { value: 'warnings', label: 'Warnings', count: d.warnings.length, alert: true },
            ]}
          />
        }
      >
        {view === 'statement' ? (
          <SettlementBreakdown s={s} labels={ADMIN_BREAKDOWN_LABELS} />
        ) : view === 'orders' ? (
          d.items.length === 0 ? (
            <EmptyState icon={Package} title="No orders in this period" />
          ) : (
            <DataTable
              label="Settlement orders"
              columns={itemColumns}
              data={d.items}
              getRowId={(i) => i.orderCode}
              renderCard={(i) => (
                <div className="grid gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/orders/${i.orderCode}`}
                      className="font-mono font-semibold underline-offset-4 hover:underline"
                    >
                      {i.orderCode}
                    </Link>
                    <Money paise={i.netPaise} className="font-semibold" />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {i.jars} jar{i.jars === 1 ? '' : 's'} · revenue {formatINR(i.revenueExGstPaise)} · raw{' '}
                    {formatINR(i.rawCostPaise)} · freight {formatINR(i.freightPaise)} · fee{' '}
                    {formatINR(i.gatewayFeePaise)}
                  </p>
                  <StatusBadge status={i.status} kind="order" className="w-fit" />
                </div>
              )}
            />
          )
        ) : view === 'expenses' ? (
          d.expenses.length === 0 ? (
            <EmptyState icon={Wallet} title="No shared expenses in this period" />
          ) : (
            <DataTable
              label="Settlement expenses"
              columns={expenseColumns}
              data={d.expenses}
              getRowId={(e) => e.id}
              renderCard={(e) => (
                <div className="flex items-start justify-between gap-3">
                  <span className="grid">
                    <span className="font-medium">{e.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCalendarDate(e.incurredOn)} · {CATEGORY_LABEL[e.category]} · {e.paidBy?.name ?? 'Business'}
                    </span>
                  </span>
                  <Money paise={e.amountPaise} className="font-semibold" />
                </div>
              )}
            />
          )
        ) : d.warnings.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No warnings"
            description="Every order has freight and gateway fees recorded."
          />
        ) : (
          <ul aria-label="Settlement warnings" className="divide-y divide-border">
            {d.warnings.map((w) => (
              <li
                key={`${w.orderCode}-${w.issue}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
                  <Link
                    to={`/orders/${w.orderCode}`}
                    className="font-mono font-semibold underline-offset-4 hover:underline"
                  >
                    {w.orderCode}
                  </Link>
                </span>
                <span className="text-muted-foreground">{WARNING_LABEL[w.issue]}</span>
              </li>
            ))}
          </ul>
        )}
      </TableCard>

      <ConfirmDialog
        open={confirm === 'finalize'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Finalize this settlement?"
        description={`Locks every number and the ${d.expenses.length} expense(s), generates the PDF statement and notifies the partner. Partner payout: ${formatINR(s.partnerPayoutPaise)}.`}
        confirmLabel="Finalize"
        pending={actions.finalize.isPending}
        error={actions.finalize.error?.message}
        onConfirm={() =>
          actions.finalize.mutate(undefined, {
            onSuccess: () => {
              toast({ title: 'Settlement finalized', description: 'The partner can now see and acknowledge it.' });
              setConfirm(null);
            },
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this draft?"
        description="Its orders and expenses become unsettled again, so you can regenerate the period."
        confirmLabel="Delete draft"
        tone="destructive"
        pending={actions.remove.isPending}
        error={actions.remove.error?.message}
        onConfirm={() =>
          actions.remove.mutate(undefined, {
            onSuccess: () => {
              toast({ title: 'Draft deleted' });
              void navigate('/settlements');
            },
          })
        }
      />
      {paying && <MarkPaidDialog id={s.id} payout={formatINR(s.partnerPayoutPaise)} onOpenChange={setPaying} />}
    </div>
  );
}
