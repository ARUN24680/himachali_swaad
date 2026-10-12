import { formatINR } from '@pk/shared';
import { Alert, Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@pk/ui';
import { ArrowLeft, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorState } from '@/components/common/StateBlocks';
import { useT } from '@/i18n';
import { formatCalendarDate, formatDateTime, formatShortDate } from '@/lib/dates';
import {
  partnerSettlementsApi,
  SettlementBreakdown,
  SettlementStepper,
  useAcknowledgeSettlement,
  usePartnerSettlement,
} from '@/modules/settlements';
import { openSignedUrl } from '@/services/api/download';
import { isApiError } from '@/services/api/http';
import { breakdownLabels, stepperLabels } from '../components/hisaabLabels';
import { DeskSection } from '../components/DeskSection';

/** /desk/hisaab/:settlementId — one read-only statement + Acknowledge (once). */
export default function HisaabDetailPage() {
  const t = useT();
  const { settlementId } = useParams();
  const detail = usePartnerSettlement(settlementId);
  const ack = useAcknowledgeSettlement(settlementId ?? '');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  const back = (
    <Link
      to="/desk/hisaab"
      className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md font-medium text-accent-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {t('hisaab.back')}
    </Link>
  );

  if (detail.isPending)
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        {back}
        <div role="status" aria-label={t('hisaab.detailLoading')} className="grid gap-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  if (detail.isError)
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        {back}
        <div className="rounded-lg border border-border bg-card">
          <ErrorState
            title={
              isApiError(detail.error) && detail.error.status === 404 ? t('hisaab.notFound') : t('common.errorTitle')
            }
            message={t('common.errorBody')}
            retryLabel={t('common.retry')}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        </div>
      </div>
    );

  const d = detail.data;
  const s = d.settlement;
  const acknowledgedAt = s.partnerAcknowledgedAt;
  const pct = `${s.partnerSplitBp / 100}%`;

  const openPdf = async () => {
    setPdfBusy(true);
    setPdfFailed(false);
    try {
      const blocked = await openSignedUrl(() => partnerSettlementsApi.statement(s.id));
      if (blocked) window.open(blocked, '_blank', 'noopener');
    } catch {
      setPdfFailed(true);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      {back}
      <div className="grid gap-1">
        <h1 className="font-serif text-3xl font-semibold">
          {formatShortDate(s.periodStart)} – {formatCalendarDate(s.periodEnd)}
        </h1>
        <p className="text-muted-foreground">{t('hisaab.split', { pct })}</p>
        {s.status === 'PAID' && s.paidAt && (
          <p className="text-sm text-success">
            {t('hisaab.paidRef', { date: formatCalendarDate(s.paidAt.slice(0, 10)), ref: s.bankReference ?? '—' })}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <SettlementStepper s={s} labels={stepperLabels(t)} formatDate={formatDateTime} />
      </div>

      <div className="flex items-end justify-between gap-3 rounded-lg bg-secondary px-4 py-4 text-secondary-foreground">
        <span className="grid">
          <span className="text-xs font-semibold tracking-[0.1em] text-secondary-foreground/80 uppercase">
            {t('hisaab.payout')}
          </span>
          <span className="text-3xl font-semibold tabular-nums">{formatINR(s.partnerPayoutPaise)}</span>
        </span>
        {d.statementAvailable && (
          <Button variant="primary" onClick={() => void openPdf()} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
            {t('hisaab.pdf')}
          </Button>
        )}
      </div>
      {pdfFailed && (
        <Alert tone="destructive">
          <span>{t('hisaab.pdfFailed')}</span>
        </Alert>
      )}

      <Tabs defaultValue="statement" className="grid gap-3">
        <TabsList aria-label={t('hisaab.sectionsLabel')}>
          <TabsTrigger value="statement">{t('hisaab.tabStatement')}</TabsTrigger>
          <TabsTrigger value="orders">
            {t('hisaab.tabOrders')} <span className="tabular-nums opacity-80">({d.items.length})</span>
          </TabsTrigger>
          <TabsTrigger value="expenses">
            {t('hisaab.tabExpenses')} <span className="tabular-nums opacity-80">({d.expenses.length})</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="statement">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <SettlementBreakdown s={s} labels={breakdownLabels(t)} />
          </div>
        </TabsContent>
        <TabsContent value="orders">
          <div className="rounded-lg border border-border bg-card">
            {d.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground">{t('hisaab.noOrders')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.items.map((i) => (
                  <li key={i.orderCode} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="font-mono font-semibold">{i.orderCode}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {t('hisaab.orderLine', { jars: i.jars, net: formatINR(i.netPaise) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
        <TabsContent value="expenses">
          <div className="rounded-lg border border-border bg-card">
            {d.expenses.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground">{t('hisaab.noExpenses')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.expenses.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="grid">
                      <span className="font-medium">{e.description}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCalendarDate(e.incurredOn)} ·{' '}
                        {e.paidBy ? t('hisaab.paidBy', { name: e.paidBy.name }) : t('hisaab.business')}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatINR(e.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <DeskSection title={t('hisaab.ackTitle')}>
        {acknowledgedAt ? (
          <Alert tone="success">
            <CheckCircle2 aria-hidden="true" />
            <span>{t('hisaab.ackDone', { date: formatDateTime(acknowledgedAt) })}</span>
          </Alert>
        ) : (
          <>
            <p className="text-muted-foreground">{t('hisaab.ackBody')}</p>
            {ack.isError && (
              <Alert tone="destructive">
                <span>{t('hisaab.ackFailed')}</span>
              </Alert>
            )}
            <Button size="lg" className="w-full" onClick={() => ack.mutate()} disabled={ack.isPending}>
              {ack.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              {ack.isPending ? t('hisaab.ackSaving') : t('hisaab.ackButton')}
            </Button>
          </>
        )}
      </DeskSection>
    </div>
  );
}
