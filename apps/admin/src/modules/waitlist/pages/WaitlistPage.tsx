import { WAITLIST_SOURCES, type WaitlistSource } from '@pk/shared';
import { Button } from '@pk/ui';
import { CalendarPlus, Download, ExternalLink, ListPlus, Loader2, Mail, Phone, SearchX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataTableSkeleton } from '@/components/common/DataTable';
import { FilterPills } from '@/components/common/FilterPills';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { env } from '@/lib/env';
import { downloadFile } from '@/services/api/download';
import { toast } from '@/store/toast.store';
import { waitlistApi } from '../api/waitlistApi';
import { SOURCE_LABEL } from '../components/waitlistMeta';
import { WaitlistTable } from '../components/WaitlistTable';
import { useWaitlist } from '../hooks/useWaitlist';

type SourceFilter = 'all' | WaitlistSource;
const SOURCE_OPTIONS = [
  { value: 'all', label: 'All' },
  ...WAITLIST_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
] as const satisfies readonly { value: SourceFilter; label: string }[];
const PAGE_SIZE = 25;
const WEEK_MS = 7 * 24 * 3_600_000;
const COMING_SOON_URL = `${env.VITE_STOREFRONT_URL.replace(/\/+$/, '')}/coming-soon`;

/**
 * /waitlist (audit 2026-11-03, R-5): everyone who asked to be told when the store opens — from the
 * coming-soon teaser or the storefront. PII — ADMIN only; the CSV goes out with credentials.
 */
export default function WaitlistPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sourceParam = params.get('source');
  const source: SourceFilter = WAITLIST_SOURCES.find((s) => s === sourceParam) ?? 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useWaitlist({
    q: q || undefined,
    source: source === 'all' ? undefined : source,
    page,
    pageSize: PAGE_SIZE,
  });

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
  const filtered = Boolean(q) || source !== 'all';

  const rows = list.data?.entries ?? [];
  const total = list.data?.total ?? 0;
  const withPhone = rows.filter((e) => e.phone).length;
  const withEmail = rows.filter((e) => e.email).length;
  const [weekAgo] = useState(() => Date.now() - WEEK_MS); // fixed at mount — a stable cut-off for the KPI
  const thisWeek = rows.filter((e) => new Date(e.createdAt).getTime() >= weekAgo).length;

  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      const name = await downloadFile(waitlistApi.exportPath, 'waitlist.csv');
      toast({ title: 'Waitlist export downloaded', description: `${name} — personal data, store it safely.` });
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
        title="Waitlist"
        description={
          list.data
            ? `${total.toLocaleString('en-IN')} ${total === 1 ? 'person' : 'people'} ${filtered ? 'match' : 'asked to hear when the store opens'} — from the coming-soon page and the storefront. Personal data: use it for launch updates only.`
            : 'People who asked to hear when the store opens — from the coming-soon page and the storefront. Personal data: use it for launch updates only.'
        }
        actions={
          <Button variant="outline" onClick={() => void runExport()} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Export CSV
          </Button>
        }
      />

      <KpiGrid label="Waitlist summary">
        <KpiCard
          label="On the list"
          icon={ListPlus}
          loading={list.isPending}
          value={total.toLocaleString('en-IN')}
          hint={filtered ? 'Matching the current filter' : 'All time'}
        />
        <KpiCard
          label="With a phone"
          icon={Phone}
          tone="success"
          loading={list.isPending}
          value={withPhone}
          hint={`Of the ${rows.length} shown — WhatsApp / SMS`}
        />
        <KpiCard
          label="With an e-mail"
          icon={Mail}
          tone="info"
          loading={list.isPending}
          value={withEmail}
          hint={`Of the ${rows.length} shown`}
        />
        <KpiCard
          label="Joined this week"
          icon={CalendarPlus}
          loading={list.isPending}
          value={thisWeek}
          hint={`Of the ${rows.length} shown`}
        />
      </KpiGrid>

      <TableCard
        label="Waitlist entries"
        controls={
          <>
            <FilterPills
              label="Filter by source"
              value={source}
              onChange={(v) => update({ source: v === 'all' ? null : v })}
              options={SOURCE_OPTIONS}
            />
            <SearchInput label="Search waitlist" placeholder="Phone or e-mail" value={q} onChange={onSearch} />
          </>
        }
      >
        {list.isPending ? (
          <DataTableSkeleton rows={6} label="Loading waitlist" />
        ) : list.isError ? (
          <ErrorState
            title="Couldn’t load the waitlist"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No one matches"
              description="Search by the 10-digit phone number or part of the e-mail address."
              action={
                <Button variant="outline" onClick={() => update({ q: null, source: null })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ListPlus}
              title="No one on the list yet"
              description="Share the coming-soon page — sign-ups appear here the moment they land."
              action={
                <Button variant="outline" asChild>
                  <a href={COMING_SOON_URL} target="_blank" rel="noreferrer">
                    Open the coming-soon page
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              }
            />
          )
        ) : (
          <WaitlistTable
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
    </div>
  );
}
