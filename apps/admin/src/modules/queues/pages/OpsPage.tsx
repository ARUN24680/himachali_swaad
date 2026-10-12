import { Badge, Button } from '@pk/ui';
import { createColumnHelper } from '@tanstack/react-table';
import { Activity, CheckCircle2, Clock, ExternalLink, RotateCw, Webhook, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { formatDateTime, formatIstDay } from '@/lib/dates';
import { toast } from '@/store/toast.store';
import { opsApi, type WebhookFailure } from '../api/opsApi';
import { useReplayWebhook, useWebhookFailures } from '../hooks/useOps';

type View = 'webhooks' | 'queues';
const col = createColumnHelper<WebhookFailure>();

/** /ops — webhook failures with replay + the bull-board job queues (Phase 9 §9.11). ADMIN only. */
export default function OpsPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'queues' ? 'queues' : 'webhooks';
  const failures = useWebhookFailures();
  const replay = useReplayWebhook();
  const [replaying, setReplaying] = useState<WebhookFailure | null>(null);
  const events = failures.data ?? [];
  const pending = events.filter((e) => !e.processed);
  const oldest = pending.reduce<string | null>((m, e) => (!m || e.receivedAt < m ? e.receivedAt : m), null);

  const columns = [
    col.accessor('receivedAt', {
      header: 'Received (IST)',
      cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(c.getValue())}</span>,
    }),
    col.accessor('provider', { header: 'Provider', cell: (c) => <Badge tone="neutral">{c.getValue()}</Badge> }),
    col.accessor('eventType', {
      header: 'Event',
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    col.accessor('attempts', {
      header: 'Tries',
      meta: { align: 'right' },
      cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
    }),
    col.accessor('lastError', {
      header: 'Last error',
      meta: { className: 'max-w-80' },
      cell: (c) => <span className="line-clamp-2 text-xs text-destructive">{c.getValue() ?? '—'}</span>,
    }),
    col.accessor('processed', {
      header: 'State',
      cell: (c) => (c.getValue() ? <Badge tone="success">Processed</Badge> : <Badge tone="destructive">Failed</Badge>),
    }),
    col.display({
      id: 'replay',
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row: { original: e } }) => (
        <Button variant="outline" size="sm" onClick={() => setReplaying(e)} aria-label={`Replay webhook ${e.id}`}>
          <RotateCw aria-hidden="true" />
          Replay
        </Button>
      ),
    }),
  ];

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="System"
        title="Queues & webhooks"
        description="Background jobs and incoming Razorpay / courier events. Replaying a webhook runs the same idempotent handler again."
        actions={
          <Button asChild variant="outline">
            <a href={opsApi.bullBoardUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              Open job queues
            </a>
          </Button>
        }
      />
      <KpiGrid label="Ops summary">
        <KpiCard
          label="Failed webhooks"
          icon={XCircle}
          tone={pending.length ? 'destructive' : 'success'}
          loading={failures.isPending}
          value={pending.length}
          hint={pending.length ? 'Not processed yet' : 'All processed'}
        />
        <KpiCard
          label="With errors"
          icon={Webhook}
          loading={failures.isPending}
          value={events.length}
          hint="Events that ever failed"
        />
        <KpiCard
          label="Providers"
          icon={Activity}
          loading={failures.isPending}
          value={new Set(events.map((e) => e.provider)).size}
          hint={[...new Set(events.map((e) => e.provider))].join(', ') || '—'}
        />
        <KpiCard
          label="Oldest failure"
          icon={Clock}
          tone={oldest ? 'warning' : 'default'}
          loading={failures.isPending}
          value={oldest ? formatIstDay(oldest) : '—'}
          hint={oldest ? `${formatDateTime(oldest)} IST` : 'IST'}
        />
      </KpiGrid>
      <TableCard
        label="Ops"
        controls={
          <FilterPills
            label="Ops view"
            value={view}
            onChange={(v) =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (v === 'queues') n.set('view', 'queues');
                else n.delete('view');
                return n;
              })
            }
            options={[
              {
                value: 'webhooks',
                label: 'Webhook failures',
                count: failures.data ? pending.length : undefined,
                alert: true,
              },
              { value: 'queues', label: 'Job queues' },
            ]}
          />
        }
      >
        {view === 'queues' ? (
          <div className="grid gap-3 p-5 pt-4">
            <p className="text-sm text-muted-foreground">
              bull-board runs on the API (ADMIN session only). If the panel below stays blank, your browser blocked the
              embed —{' '}
              <a
                href={opsApi.bullBoardUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent-foreground underline underline-offset-4"
              >
                open it in a new tab
              </a>
              .
            </p>
            <iframe
              title="Job queues (bull-board)"
              src={opsApi.bullBoardUrl}
              className="h-[70dvh] w-full rounded-lg border border-border bg-background"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : failures.isPending ? (
          <DataTableSkeleton rows={4} label="Loading webhook failures" />
        ) : failures.isError ? (
          <ErrorState
            title="Couldn’t load webhook failures"
            message={failures.error.message}
            onRetry={() => void failures.refetch()}
            retrying={failures.isFetching}
          />
        ) : events.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No webhook failures"
            description="Every Razorpay and courier event was processed."
          />
        ) : (
          <DataTable
            label="Webhook failures"
            columns={columns}
            data={events}
            getRowId={(e) => String(e.id)}
            renderCard={(e) => (
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid">
                    <span className="font-mono text-sm">{e.eventType}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.provider} · {formatDateTime(e.receivedAt)} · {e.attempts} tries
                    </span>
                  </span>
                  {e.processed ? <Badge tone="success">Processed</Badge> : <Badge tone="destructive">Failed</Badge>}
                </div>
                {e.lastError && <p className="line-clamp-2 text-xs text-destructive">{e.lastError}</p>}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setReplaying(e)}
                  aria-label={`Replay webhook ${e.id}`}
                >
                  <RotateCw aria-hidden="true" />
                  Replay
                </Button>
              </div>
            )}
          />
        )}
      </TableCard>
      <ConfirmDialog
        open={Boolean(replaying)}
        onOpenChange={(o) => !o && setReplaying(null)}
        title="Replay this webhook?"
        description={
          replaying
            ? `${replaying.provider} · ${replaying.eventType}. Handlers are idempotent — an already-applied event changes nothing.`
            : undefined
        }
        confirmLabel="Replay"
        pending={replay.isPending}
        error={replay.error?.message}
        onConfirm={() =>
          replaying &&
          replay.mutate(replaying.id, {
            onSuccess: (r) => {
              toast({ title: 'Webhook replayed', description: r.message });
              setReplaying(null);
            },
          })
        }
      />
    </div>
  );
}
