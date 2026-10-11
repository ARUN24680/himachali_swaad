/**
 * Sellable shelf-life rule (D-24, Phase 3 §3.6). A batch is sellable when
 * days_to_expiry >= min_remaining_shelf_days + transit_buffer_days ("sellable buffer").
 * The storefront stock query and Phase 5 allocation use the same buffer in SQL; this is the
 * label shown to staff.
 */
export const SHELF_STATUSES = ['FRESH', 'AGING', 'NOT_SELLABLE', 'EXPIRED'] as const;
export type ShelfStatus = (typeof SHELF_STATUSES)[number];

/** Sellable batches within this many days of the buffer are AGING (promote / sell first). */
export const AGING_WINDOW_DAYS = 30;

export function shelfStatusFor(daysToExpiry: number, sellableBufferDays: number): ShelfStatus {
  if (daysToExpiry <= 0) return 'EXPIRED';
  if (daysToExpiry < sellableBufferDays) return 'NOT_SELLABLE';
  if (daysToExpiry < sellableBufferDays + AGING_WINDOW_DAYS) return 'AGING';
  return 'FRESH';
}

export const STOCK_BADGES = ['IN_STOCK', 'LOW_STOCK', 'SOLD_OUT'] as const;
export type StockBadge = (typeof STOCK_BADGES)[number];

/** `lowStockThreshold` = settings.low_stock_threshold ("Only X jars left" below it). */
export function stockBadgeFor(sellableStock: number, lowStockThreshold: number): StockBadge {
  if (sellableStock <= 0) return 'SOLD_OUT';
  if (sellableStock < lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}
