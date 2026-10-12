import type { SettlementSummary } from '@pk/shared';
import { formatCalendarDate, formatShortDate } from '@/lib/dates';
import type { BreakdownLabels, StepperLabels } from './SettlementBreakdown';

export const ADMIN_BREAKDOWN_LABELS: BreakdownLabels = {
  caption: 'Settlement totals',
  revenue: 'Revenue ex-GST',
  rawCost: 'Raw cost (reimbursed to partner)',
  packaging: 'Packaging (jar, cap, shrink, label, box, bubble)',
  freight: 'Actual freight',
  gatewayFee: 'Gateway fee incl. GST on fee',
  refunds: 'Refunds',
  refundsNetted: 'Refunds (already netted from revenue)',
  rtoFreight: 'RTO freight',
  ordersNet: 'Orders net',
  sharedExpenses: 'Shared expenses (ads, software…)',
  netProfit: 'Net profit pool',
  partnerShare: 'Partner share ({pct}, rounded down)',
  adminShare: 'Admin share (remainder)',
  rawCostBack: 'Raw cost reimbursement',
  expenseReimbursement: 'Expenses the partner paid',
  partnerPayout: 'Partner payout',
  negativeNote: 'This cycle made a loss — both shares are negative. Nothing is carried forward silently.',
};

export const ADMIN_STEPPER_LABELS: StepperLabels = {
  label: 'Settlement progress',
  draft: 'Draft',
  finalized: 'Finalized',
  paid: 'Paid',
  acknowledged: 'Partner acknowledged',
};

export const WARNING_LABEL = {
  MISSING_FREIGHT: 'Freight not billed by Shiprocket yet',
  MISSING_GATEWAY_FEE: 'Razorpay fee not reported yet',
} as const;

export const periodLabel = (s: Pick<SettlementSummary, 'periodStart' | 'periodEnd'>) =>
  `${formatShortDate(s.periodStart)} – ${formatCalendarDate(s.periodEnd)}`;
