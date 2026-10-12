import type { EXPENSE_CATEGORIES } from '@pk/shared';

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ADS: 'Ads',
  PACKAGING: 'Packaging',
  RAW_MATERIAL: 'Raw material',
  LOGISTICS: 'Logistics',
  SOFTWARE: 'Software',
  COMPLIANCE: 'Compliance',
  OTHER: 'Other',
};
