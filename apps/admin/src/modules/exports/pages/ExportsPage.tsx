import { formatINR, todayInIST } from '@pk/shared';
import { Button } from '@pk/ui';
import {
  Boxes,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Landmark,
  Loader2,
  Receipt,
  ShieldAlert,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { DateRangeFields } from '@/components/common/DateRangeFields';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { TableCard } from '@/components/common/TableCard';
import { formatCalendarDate, monthRange } from '@/lib/dates';
import { useDashboard } from '@/modules/dashboard';
import { downloadFile } from '@/services/api/download';
import { toast } from '@/store/toast.store';

type ExportType = 'orders' | 'gst' | 'inventory-ledger' | 'customers';
const EXPORTS: {
  type: ExportType;
  title: string;
  body: string;
  icon: ComponentType<{ className?: string }>;
  dated: boolean;
  pii?: boolean;
}[] = [
  {
    type: 'gst',
    title: 'GST summary',
    body: 'Taxable value and GST by month, rate and HSN — hand this to the CA for GSTR-1 / 3B.',
    icon: Landmark,
    dated: true,
  },
  {
    type: 'orders',
    title: 'Orders',
    body: 'Every paid order with items, amounts, GST, payment and shipment status.',
    icon: ShoppingBag,
    dated: true,
  },
  {
    type: 'inventory-ledger',
    title: 'Inventory ledger',
    body: 'Every stock movement — production, reservations, releases, adjustments, wastage.',
    icon: Boxes,
    dated: true,
  },
  {
    type: 'customers',
    title: 'Customers',
    body: 'Names, phones, order counts and lifetime value. Personal data — the download is audited.',
    icon: Users,
    dated: false,
    pii: true,
  },
];

type Preset = 'this_month' | 'last_month' | 'fy' | 'custom';
function presetRange(p: Exclude<Preset, 'custom'>, today: string) {
  if (p === 'this_month') return { from: monthRange(today).from, to: today };
  if (p === 'last_month') return monthRange(today, -1);
  const y = Number(today.slice(0, 4));
  const fyStart = Number(today.slice(5, 7)) >= 4 ? y : y - 1; // Indian FY: 1 Apr – 31 Mar
  return { from: `${fyStart}-04-01`, to: today };
}

/** /exports (Phase 9 §9.10): CSVs for the CA and for backups. Streamed by the API and audited. */
export default function ExportsPage() {
  const today = todayInIST();
  const dash = useDashboard();
  const [preset, setPreset] = useState<Preset>('last_month');
  const [range, setRange] = useState(() => presetRange('last_month', today));
  const [busy, setBusy] = useState<ExportType | null>(null);
  const d = dash.data;

  const download = async (type: ExportType, dated: boolean) => {
    setBusy(type);
    try {
      const qs = dated
        ? `?${new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) })}`
        : '';
      const name = await downloadFile(`/admin/exports/${type}${qs === '?' ? '' : qs}`, `${type}.csv`);
      toast({ title: 'Download ready', description: name });
    } catch (err) {
      toast({ title: 'Export failed', description: (err as Error).message, tone: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Finance"
        title="Exports"
        description="CSV downloads for your CA and your records. Dates are IST calendar days; every export is logged."
      />
      <KpiGrid label="This month for the books">
        <KpiCard
          label="Orders this month"
          icon={ShoppingBag}
          loading={dash.isPending}
          value={d?.revenueMonth.orders ?? 0}
        />
        <KpiCard
          label="Sales incl. GST"
          icon={IndianRupee}
          loading={dash.isPending}
          value={formatINR(d?.revenueMonth.grossPaise ?? 0)}
          hint="This month"
        />
        <KpiCard
          label="Taxable value"
          icon={Receipt}
          loading={dash.isPending}
          value={formatINR(d?.revenueMonth.exGstPaise ?? 0)}
          hint="Ex-GST, this month"
        />
        <KpiCard
          label="GST collected"
          icon={Landmark}
          tone="info"
          loading={dash.isPending}
          value={formatINR(d ? d.revenueMonth.grossPaise - d.revenueMonth.exGstPaise : 0)}
          hint="This month — check against the GST CSV"
        />
      </KpiGrid>
      <TableCard
        label="Exports"
        controls={
          <>
            <FilterPills
              label="Period"
              value={preset}
              onChange={(p) => {
                setPreset(p);
                if (p !== 'custom') setRange(presetRange(p, today));
              }}
              options={[
                { value: 'last_month', label: 'Last month' },
                { value: 'this_month', label: 'This month' },
                { value: 'fy', label: 'This FY' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            <DateRangeFields
              from={range.from}
              to={range.to}
              labelPrefix="Export "
              onChange={(r) => {
                setPreset('custom');
                setRange(r);
              }}
            />
          </>
        }
        footer={
          range.from && range.to
            ? `Dated exports cover ${formatCalendarDate(range.from)} – ${formatCalendarDate(range.to)}.`
            : 'No dates chosen — dated exports include everything.'
        }
      >
        <ul aria-label="Available exports" className="divide-y divide-border">
          {EXPORTS.map(({ type, title, body, icon: Icon, dated, pii }) => (
            <li key={type} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-accent-foreground"
                >
                  <Icon className="size-5" />
                </span>
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    {title}
                    {pii && <ShieldAlert aria-label="Personal data" className="size-4 text-warning" />}
                  </span>
                  <span className="text-sm text-muted-foreground">{body}</span>
                  <span className="text-xs text-muted-foreground">{dated ? 'Uses the period above' : 'All time'}</span>
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => void download(type, dated)}
                disabled={busy !== null}
                aria-label={`Download ${title} CSV`}
              >
                {busy === type ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                CSV
              </Button>
            </li>
          ))}
          <li className="flex items-start gap-3 px-5 py-4 text-sm text-muted-foreground">
            <FileSpreadsheet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Settlement statements export from each settlement’s page (Settlements → open → Export CSV).
          </li>
        </ul>
      </TableCard>
    </div>
  );
}
