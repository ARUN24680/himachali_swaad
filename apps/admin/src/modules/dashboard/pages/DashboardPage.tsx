import { formatINR } from '@pk/shared';
import { Alert, Button, ToggleGroup, ToggleGroupItem } from '@pk/ui';
import { AlertTriangle, BarChart3, IndianRupee, PackageOpen, ShieldAlert, ShoppingBag, Store } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { useMe } from '@/hooks/useMe';
import { formatDateTime } from '@/lib/dates';
import { DailyBars, ProductBars } from '../components/Charts';
import { OpsSection } from '../components/OpsSection';
import { useDashboard } from '../hooks/useDashboard';

type View = 'orders' | 'revenue' | 'products';
const VIEWS = [
  { value: 'orders', label: 'Orders per day' },
  { value: 'revenue', label: 'Revenue per day' },
  { value: 'products', label: 'Revenue by product' },
] as const;

/** ADMIN landing page "/" (Phase 9 §9.2): today at a glance + 30-day trend. */
export default function DashboardPage() {
  const me = useMe();
  const dash = useDashboard();
  const [exGst, setExGst] = useState(false);
  const [view, setView] = useState<View>('orders');
  const user = me.data?.user;
  const firstName = user?.fullName?.split(' ')[0];
  const d = dash.data;
  const rev = (r: { grossPaise: number; exGstPaise: number }) => formatINR(exGst ? r.exGstPaise : r.grossPaise);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Dashboard"
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        description={
          d
            ? `Live numbers, refreshed ${formatDateTime(d.generatedAt)} IST.`
            : 'Today across orders, packing and stock.'
        }
        actions={
          <ToggleGroup
            type="single"
            value={exGst ? 'ex' : 'gross'}
            onValueChange={(v) => v && setExGst(v === 'ex')}
            aria-label="Revenue shown"
            className="w-auto"
          >
            <ToggleGroupItem value="gross" className="whitespace-nowrap">
              Incl. GST
            </ToggleGroupItem>
            <ToggleGroupItem value="ex" className="whitespace-nowrap">
              Ex-GST
            </ToggleGroupItem>
          </ToggleGroup>
        }
      >
        {user?.role === 'ADMIN' && !user.totpEnabled && (
          <Alert tone="warning">
            <ShieldAlert aria-hidden="true" />
            <span>
              Two-factor authentication is off for your admin account.{' '}
              <Link to="/account" className="font-semibold underline underline-offset-4">
                Turn it on
              </Link>
            </span>
          </Alert>
        )}
      </PageHeader>

      <KpiGrid label="Today at a glance">
        <KpiCard
          label="Awaiting packing"
          icon={PackageOpen}
          tone={d && d.awaitingPacking > 0 ? 'warning' : 'default'}
          loading={!d}
          value={d?.awaitingPacking ?? 0}
          hint={d ? `${d.inTransit} in transit with the courier` : undefined}
        />
        <KpiCard
          label="Needs attention"
          icon={AlertTriangle}
          tone={d && d.needsAttention > 0 ? 'destructive' : 'success'}
          loading={!d}
          value={d?.needsAttention ?? 0}
          hint={d ? (d.needsAttention ? `Ops issues · ${d.ndr} NDR` : 'Nothing stuck') : undefined}
        />
        <KpiCard
          label={exGst ? 'Revenue today (ex-GST)' : 'Revenue today'}
          icon={IndianRupee}
          tone="success"
          loading={!d}
          value={d ? rev(d.revenueToday) : 0}
          hint={d ? `This month ${rev(d.revenueMonth)} · ${d.revenueMonth.orders} orders` : undefined}
        />
        <KpiCard
          label="Sellable stock"
          icon={Store}
          tone={d && d.batchesExpiringIn30Days > 0 ? 'warning' : 'default'}
          loading={!d}
          value={d ? `${d.sellableJars} jars` : 0}
          hint={
            d
              ? d.batchesExpiringIn30Days
                ? `${d.batchesExpiringIn30Days} batch${d.batchesExpiringIn30Days === 1 ? '' : 'es'} expire in 30 days`
                : 'No batch expires in 30 days'
              : undefined
          }
        />
      </KpiGrid>

      <TableCard
        label="Trends"
        controls={
          <>
            <FilterPills label="Chart" value={view} onChange={setView} options={VIEWS} />
            <div className="flex flex-wrap gap-2">
              {d && d.needsAttention > 0 && (
                <Button asChild variant="outline">
                  <Link to="/orders?tab=attention">
                    <AlertTriangle aria-hidden="true" />
                    Open needs-attention ({d.needsAttention})
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link to="/orders">
                  <ShoppingBag aria-hidden="true" />
                  All orders
                </Link>
              </Button>
            </div>
          </>
        }
        footer={
          view !== 'orders'
            ? 'Chart revenue is incl. GST (daily / per-product ex-GST isn’t reported by the API yet).'
            : undefined
        }
      >
        {dash.isPending ? (
          <div
            role="status"
            aria-label="Loading dashboard"
            className="h-64 animate-pulse bg-muted/50 motion-reduce:animate-none"
          />
        ) : dash.isError ? (
          <ErrorState
            title="Couldn’t load the dashboard"
            message={dash.error.message}
            onRetry={() => void dash.refetch()}
            retrying={dash.isFetching}
          />
        ) : view === 'products' ? (
          d!.revenueByProduct.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No sales this month yet"
              description="Product revenue shows up after the first paid order."
            />
          ) : (
            <ProductBars rows={d!.revenueByProduct} />
          )
        ) : d!.ordersPerDay.every((x) => x.orders === 0) ? (
          <EmptyState
            icon={BarChart3}
            title="No orders in the last 30 days"
            description="The trend fills in as orders come in."
          />
        ) : (
          <DailyBars days={d!.ordersPerDay} metric={view} />
        )}
      </TableCard>

      <OpsSection />
    </div>
  );
}
