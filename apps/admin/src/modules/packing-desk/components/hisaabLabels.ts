import type { BreakdownLabels, StepperLabels } from '@/modules/settlements';
import type { Translate } from '@/i18n';

/** Settlement statement labels in the partner's language (D-16) for the shared breakdown component. */
export const breakdownLabels = (t: Translate): BreakdownLabels => ({
  caption: t('hisaab.breakdown.caption'),
  revenue: t('hisaab.breakdown.revenue'),
  rawCost: t('hisaab.breakdown.rawCost'),
  packaging: t('hisaab.breakdown.packaging'),
  freight: t('hisaab.breakdown.freight'),
  gatewayFee: t('hisaab.breakdown.gatewayFee'),
  refunds: t('hisaab.breakdown.refunds'),
  refundsNetted: t('hisaab.breakdown.refundsNetted'),
  rtoFreight: t('hisaab.breakdown.rtoFreight'),
  ordersNet: t('hisaab.breakdown.ordersNet'),
  sharedExpenses: t('hisaab.breakdown.sharedExpenses'),
  netProfit: t('hisaab.breakdown.netProfit'),
  partnerShare: t('hisaab.breakdown.partnerShare', { pct: '{pct}' }),
  adminShare: t('hisaab.breakdown.adminShare'),
  rawCostBack: t('hisaab.breakdown.rawCostBack'),
  expenseReimbursement: t('hisaab.breakdown.expenseReimbursement'),
  partnerPayout: t('hisaab.breakdown.partnerPayout'),
  negativeNote: t('hisaab.breakdown.negativeNote'),
});

export const stepperLabels = (t: Translate): StepperLabels => ({
  label: t('hisaab.stepLabel'),
  draft: t('hisaab.stepDraft'),
  finalized: t('hisaab.stepFinalized'),
  paid: t('hisaab.stepPaid'),
  acknowledged: t('hisaab.stepAck'),
});
