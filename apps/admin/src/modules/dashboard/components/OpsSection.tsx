import { formatINR } from '@pk/shared';
import { Button, Skeleton, cn } from '@pk/ui';
import { Activity, BellRing, PackageX, RotateCcw, Undo2, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { useOpsMetrics, useSendTestAlert } from '../hooks/useDashboard';
import { HourlyBars } from './Charts';

const pct = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;

/** One compact stat inside the Operations card (not a KpiCard: the page keeps ONE KPI grid, §9.1). */
function OpsStat({
  label,
  icon: Icon,
  value,
  hint,
  loading,
  className,
}: {
  className?: string;
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  hint: ReactNode;
  loading: boolean;
}) {
  return (
    <div
      data-testid="ops-stat"
      className={cn('grid min-w-0 content-start gap-1.5 rounded-lg bg-muted/60 p-4', className)}
    >
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <p className="min-w-0 truncate text-xs font-semibold tracking-[0.1em] uppercase">{label}</p>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-32" />
        </>
      ) : (
        <>
          <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{hint}</p>
        </>
      )}
    </div>
  );
}

/**
 * Dashboard "Operations" section (Phase 10 §10.3): orders per hour (last 24 h IST), 30-day refunds,
 * NDR and RTO rates, and a button that fires a test WhatsApp / e-mail alert to every admin.
 */
export function OpsSection() {
  const ops = useOpsMetrics();
  const sendAlert = useSendTestAlert();
  const [confirming, setConfirming] = useState(false);
  const m = ops.data;
  const loading = ops.isPending;
  const shippedHint =
    m && m.shipped30d > 0
      ? `of ${m.shipped30d.toLocaleString('en-IN')} orders shipped`
      : 'No shipments in the last 30 days';

  return (
    <section
      aria-labelledby="ops-heading"
      data-testid="ops-section"
      className="grid min-w-0 gap-5 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h2 id="ops-heading" className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
            <Activity aria-hidden="true" className="size-5 shrink-0 text-accent-foreground" />
            Operations
          </h2>
          <p className="text-sm text-muted-foreground">
            Orders in the last 24 hours · refunds and delivery health over 30 days.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full shrink-0 sm:w-fit"
          onClick={() => {
            sendAlert.reset();
            setConfirming(true);
          }}
        >
          <BellRing aria-hidden="true" />
          Send test alert
        </Button>
      </div>

      {ops.isError ? (
        <ErrorState
          title="Couldn’t load operations numbers"
          message={ops.error.message}
          onRetry={() => void ops.refetch()}
          retrying={ops.isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <OpsStat
              label="Refunds · 30 days"
              className="col-span-2 sm:col-span-1"
              icon={Undo2}
              loading={loading}
              value={m ? formatINR(m.refunds30d.processedPaise) : null}
              hint={
                m
                  ? m.refunds30d.count
                    ? `${m.refunds30d.count} refund${m.refunds30d.count === 1 ? '' : 's'} processed`
                    : 'No refunds processed'
                  : null
              }
            />
            <OpsStat
              label="NDR rate"
              icon={PackageX}
              loading={loading}
              value={m ? pct(m.ndrRatePercent30d) : null}
              hint={shippedHint}
            />
            <OpsStat
              label="RTO rate"
              icon={RotateCcw}
              loading={loading}
              value={m ? pct(m.rtoRatePercent30d) : null}
              hint={shippedHint}
            />
          </div>

          <div className="min-w-0 border-t border-border pt-5">
            {loading ? (
              <div
                role="status"
                aria-label="Loading orders per hour"
                className="h-40 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none md:h-48"
              />
            ) : m!.ordersByHour.every((h) => h.orders === 0) ? (
              <EmptyState
                icon={Activity}
                title="No orders in the last 24 hours"
                description="The hourly chart fills in as confirmed orders come in."
              />
            ) : (
              <HourlyBars hours={m!.ordersByHour} />
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send a test alert?"
        description="Every admin gets a test WhatsApp message and e-mail, so you can check that real alerts (stuck payments, failed webhooks, low Shiprocket wallet…) will reach you. It’s recorded in the audit log."
        confirmLabel="Send test alert"
        pending={sendAlert.isPending}
        error={
          sendAlert.isError
            ? isApiError(sendAlert.error, 'NETWORK_ERROR')
              ? 'Can’t reach the server. Check your connection and try again.'
              : sendAlert.error.message
            : null
        }
        onConfirm={() =>
          sendAlert.mutate(undefined, {
            onSuccess: (r) => {
              setConfirming(false);
              toast({ title: 'Test alert sent', description: r.message });
            },
          })
        }
      />
    </section>
  );
}
