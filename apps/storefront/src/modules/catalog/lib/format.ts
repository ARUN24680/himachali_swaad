import type { MeatType, StockBadge } from '@pk/shared';

export const MEAT_LABEL: Record<MeatType, string> = {
  CHICKEN: 'Chicken',
  MUTTON: 'Mutton',
  FISH: 'Fish',
  PRAWN: 'Prawn',
};

export const formatWeight = (grams: number) =>
  grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** "2026-06-23" or ISO datetime → "23 Jun 2026" (IST calendar day, D-49 b). */
export function formatDate(value: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value);
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
}

/** Scarcity copy only from the real stock badge + sellable count (Phase 4 §4.3 — no fake counters). */
export function stockLabel(badge: StockBadge, sellable: number): string {
  if (badge === 'SOLD_OUT') return 'Sold out';
  if (badge === 'LOW_STOCK') return sellable === 1 ? 'Only 1 jar left' : `Only ${sellable} jars left`;
  return 'In stock';
}

export const shelfLifeLabel = (days: number) =>
  days % 30 === 0 && days >= 60 ? `${days / 30} months (${days} days)` : `${days} days`;
