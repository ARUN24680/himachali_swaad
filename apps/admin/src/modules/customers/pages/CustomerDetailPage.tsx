import { formatINR } from '@pk/shared';
import { Badge, Button } from '@pk/ui';
import { AlertTriangle, ArrowLeft, CalendarClock, IndianRupee, MapPin, MessageCircle, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatDateTime, formatIstDay } from '@/lib/dates';
import { OrdersTable } from '@/modules/orders';
import { isApiError } from '@/services/api/http';
import { RiskBadge } from '../components/CustomersTable';
import { formatPhone, whatsappUrl } from '../components/phone';
import { useCustomer } from '../hooks/useCustomers';

/** /customers/:phone (E.164, url-encoded) — orders + saved addresses. */
export default function CustomerDetailPage() {
  const { phone } = useParams();
  const detail = useCustomer(phone);
  const [view, setView] = useState<'orders' | 'addresses'>('orders');
  const c = detail.data?.customer;

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={
          <Link to="/customers" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Customers
          </Link>
        }
        title={c?.name ?? (phone ? formatPhone(phone) : 'Customer')}
        description={
          c ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{formatPhone(c.phone)}</span>
              {c.email && <span>· {c.email}</span>}
              <span>· {c.userId ? 'Account holder' : 'Guest checkout'}</span>
              <RiskBadge c={c} />
            </span>
          ) : undefined
        }
        actions={
          c && (
            <Button asChild variant="outline">
              <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
          )
        }
      />

      <KpiGrid label="Customer summary">
        <KpiCard label="Orders" icon={ShoppingBag} loading={!c} value={c?.ordersCount ?? 0} />
        <KpiCard
          label="Lifetime value"
          icon={IndianRupee}
          tone="success"
          loading={!c}
          value={c ? formatINR(c.lifetimeValuePaise) : 0}
          hint="Paid, incl. GST"
        />
        <KpiCard
          label="Last order"
          icon={CalendarClock}
          loading={!c}
          value={c ? formatIstDay(c.lastOrderAt) : '—'}
          hint={c ? `${formatDateTime(c.lastOrderAt)} IST` : undefined}
        />
        <KpiCard
          label="Returned (RTO)"
          icon={AlertTriangle}
          tone={c?.risk ? 'destructive' : 'default'}
          loading={!c}
          value={c?.rtoCount ?? 0}
          hint={c?.risk ? 'Call before dispatching the next order' : 'No returns'}
        />
      </KpiGrid>

      <TableCard
        label="Customer history"
        controls={
          <FilterPills
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'orders', label: 'Orders', count: detail.data?.orders.length },
              { value: 'addresses', label: 'Addresses', count: detail.data?.addresses.length },
            ]}
          />
        }
      >
        {detail.isPending ? (
          <DataTableSkeleton rows={4} label="Loading customer" />
        ) : detail.isError ? (
          <ErrorState
            title={
              isApiError(detail.error) && detail.error.status === 404
                ? 'Customer not found'
                : 'Couldn’t load this customer'
            }
            message={detail.error.message}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : view === 'orders' ? (
          detail.data.orders.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No paid orders" />
          ) : (
            <OrdersTable orders={detail.data.orders} hrefFor={(code) => `/orders/${code}`} />
          )
        ) : detail.data.addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            description="Guests type their address at checkout; it’s kept on each order."
          />
        ) : (
          <ul className="divide-y divide-border">
            {detail.data.addresses.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-4 text-sm">
                <span>
                  {a.line1}
                  <br />
                  <span className="text-muted-foreground">
                    {a.city}, {a.state} – <span className="tabular-nums">{a.pincode}</span>
                  </span>
                </span>
                {a.isDefault && <Badge tone="info">Default</Badge>}
              </li>
            ))}
          </ul>
        )}
      </TableCard>
    </div>
  );
}
