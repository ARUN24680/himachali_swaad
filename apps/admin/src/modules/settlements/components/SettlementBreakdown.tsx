import { formatINR, type SettlementSummary } from '@pk/shared';
import { cn } from '@pk/ui';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

/** Every visible string comes from the caller (English admin, Hindi/English desk i18n). */
export interface BreakdownLabels {
  caption: string;
  revenue: string;
  rawCost: string;
  packaging: string;
  freight: string;
  gatewayFee: string;
  refunds: string;
  /** Shown when the API already netted refunds out of revenue (so they aren't subtracted twice). */
  refundsNetted: string;
  rtoFreight: string;
  ordersNet: string;
  sharedExpenses: string;
  netProfit: string;
  /** "{pct}" → e.g. "50%" */
  partnerShare: string;
  adminShare: string;
  rawCostBack: string;
  expenseReimbursement: string;
  partnerPayout: string;
  negativeNote: string;
}

type Line = {
  label: string;
  paise: number;
  kind: 'base' | 'minus' | 'info' | 'subtotal' | 'total' | 'plus';
  hint?: string;
};

/**
 * D-41 ledger, laid out like the worked example in architecture/04: GST-exclusive revenue, each
 * deduction, the net profit pool, the floor()-rounded partner share, the admin remainder and the
 * partner payout. All integer paise from the API — the UI never recomputes a share.
 */
export function SettlementBreakdown({ s, labels }: { s: SettlementSummary; labels: BreakdownLabels }) {
  const costs = s.rawCostPaise + s.packagingCostPaise + s.freightPaise + s.gatewayFeePaise + s.rtoFreightPaise;
  const ordersNet = s.netProfitPaise + s.sharedExpensesPaise;
  // Phase 9 §9.9 nets refunds into revenue_ex_gst; D-41 lists them as a deduction. Follow the numbers.
  const refundsInRevenue = s.revenueExGstPaise - costs === ordersNet;
  const pct = `${s.partnerSplitBp / 100}%`;

  const lines: Line[] = [
    { label: labels.revenue, paise: s.revenueExGstPaise, kind: 'base' },
    { label: labels.rawCost, paise: s.rawCostPaise, kind: 'minus' },
    { label: labels.packaging, paise: s.packagingCostPaise, kind: 'minus' },
    { label: labels.freight, paise: s.freightPaise, kind: 'minus' },
    { label: labels.gatewayFee, paise: s.gatewayFeePaise, kind: 'minus' },
    ...(s.refundsPaise
      ? [
          refundsInRevenue
            ? ({ label: labels.refundsNetted, paise: s.refundsPaise, kind: 'info' } as Line)
            : ({ label: labels.refunds, paise: s.refundsPaise, kind: 'minus' } as Line),
        ]
      : [{ label: labels.refunds, paise: 0, kind: 'minus' } as Line]),
    { label: labels.rtoFreight, paise: s.rtoFreightPaise, kind: 'minus' },
    { label: labels.ordersNet, paise: ordersNet, kind: 'subtotal' },
    { label: labels.sharedExpenses, paise: s.sharedExpensesPaise, kind: 'minus' },
    { label: labels.netProfit, paise: s.netProfitPaise, kind: 'total' },
    { label: labels.partnerShare.replace('{pct}', pct), paise: s.partnerSharePaise, kind: 'base' },
    { label: labels.adminShare, paise: s.adminSharePaise, kind: 'base' },
  ];

  const row = (l: Line, i: number) => (
    <div
      key={`${l.label}-${i}`}
      className={cn(
        'flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm',
        l.kind === 'subtotal' && 'border-t border-border font-medium',
        l.kind === 'total' && 'border-y border-border bg-muted/60 py-3 text-base font-semibold',
        l.kind === 'info' && 'text-muted-foreground',
      )}
    >
      <dt className="min-w-0">
        {l.kind === 'minus' && <span aria-hidden="true">(−) </span>}
        {l.kind === 'total' && <span aria-hidden="true">(=) </span>}
        {l.label}
      </dt>
      <dd className={cn('shrink-0 tabular-nums', l.paise < 0 && 'text-destructive')}>
        {l.kind === 'minus' && l.paise > 0 ? <span className="sr-only">minus </span> : null}
        {formatINR(l.paise)}
      </dd>
    </div>
  );

  return (
    <div className="grid">
      <dl aria-label={labels.caption}>{lines.map(row)}</dl>
      {s.netProfitPaise < 0 && (
        <p
          role="note"
          className="mx-5 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {labels.negativeNote}
        </p>
      )}
      <div className="m-5 grid gap-2 rounded-lg border border-secondary/40 bg-secondary px-4 py-4 text-secondary-foreground">
        <dl className="grid gap-1 text-sm tabular-nums">
          {(
            [
              [labels.rawCostBack, s.rawCostPaise],
              [labels.partnerShare.replace('{pct}', pct), s.partnerSharePaise],
              ...(s.expenseReimbursementPaise
                ? [[labels.expenseReimbursement, s.expenseReimbursementPaise] as const]
                : []),
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-secondary-foreground/85">
              <dt>{k}</dt>
              <dd>{formatINR(v)}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-baseline justify-between gap-3 border-t border-secondary-foreground/20 pt-2">
          <span className="font-serif text-lg font-semibold">{labels.partnerPayout}</span>
          <span className="text-2xl font-semibold tabular-nums">{formatINR(s.partnerPayoutPaise)}</span>
        </div>
      </div>
    </div>
  );
}

export interface StepperLabels {
  draft: string;
  finalized: string;
  paid: string;
  acknowledged: string;
  label: string;
}

/** DRAFT → FINALIZED → PAID (+ partner acknowledged) progress. */
export function SettlementStepper({
  s,
  labels,
  formatDate,
}: {
  s: Pick<SettlementSummary, 'status' | 'createdAt' | 'finalizedAt' | 'paidAt' | 'partnerAcknowledgedAt'>;
  labels: StepperLabels;
  formatDate: (iso: string) => string;
}) {
  const steps: { label: string; done: boolean; at: string | null; current?: boolean }[] = [
    { label: labels.draft, done: true, at: s.createdAt, current: s.status === 'DRAFT' },
    { label: labels.finalized, done: s.status !== 'DRAFT', at: s.finalizedAt, current: s.status === 'FINALIZED' },
    { label: labels.paid, done: s.status === 'PAID', at: s.paidAt, current: s.status === 'PAID' },
    { label: labels.acknowledged, done: Boolean(s.partnerAcknowledgedAt), at: s.partnerAcknowledgedAt },
  ];
  return (
    <ol aria-label={labels.label} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-0">
      {steps.map((st, i) => (
        <li
          key={st.label}
          className="flex items-center gap-2 sm:after:mx-3 sm:after:h-px sm:after:w-8 sm:after:bg-border sm:last:after:hidden"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
              st.done ? 'border-success bg-success/15 text-success' : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {st.done ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className="grid leading-tight" aria-current={st.current ? 'step' : undefined}>
            <span className={cn('text-sm', st.done ? 'font-medium' : 'text-muted-foreground')}>
              {st.label}
              <span className="sr-only">{st.done ? ' (done)' : ' (pending)'}</span>
            </span>
            {st.at && st.done && (
              <span className="text-xs text-muted-foreground tabular-nums">{formatDate(st.at)}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Money({ paise, className }: { paise: number; className?: string }): ReactNode {
  return <span className={cn('tabular-nums', paise < 0 && 'text-destructive', className)}>{formatINR(paise)}</span>;
}
