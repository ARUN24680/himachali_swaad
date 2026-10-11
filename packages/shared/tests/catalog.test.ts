import { describe, expect, it } from 'vitest';
import {
  AdjustmentRequestSchema,
  BATCH_CODE_REGEX,
  batchCodePrefix,
  formatBatchCode,
  missingForPublish,
  ProductCreateRequestSchema,
  shelfStatusFor,
  stockBadgeFor,
  todayInIST,
} from '../src';

describe('shelfStatusFor (D-24, buffer 52)', () => {
  it.each([
    [82, 'FRESH'],
    [81, 'AGING'],
    [52, 'AGING'],
    [51, 'NOT_SELLABLE'],
    [1, 'NOT_SELLABLE'],
    [0, 'EXPIRED'],
    [-3, 'EXPIRED'],
  ] as const)('%i days left → %s', (days, status) => {
    expect(shelfStatusFor(days, 52)).toBe(status);
  });
});

describe('stockBadgeFor', () => {
  it('SOLD_OUT at 0, LOW_STOCK below the threshold, IN_STOCK at or above it', () => {
    expect(stockBadgeFor(0, 20)).toBe('SOLD_OUT');
    expect(stockBadgeFor(19, 20)).toBe('LOW_STOCK');
    expect(stockBadgeFor(20, 20)).toBe('IN_STOCK');
  });
});

describe('batch codes (D-42)', () => {
  it('formats PK-<YYMM>-<SKU>-<seq>', () => {
    expect(formatBatchCode('2026-10-11', 'CHK250', 1)).toBe('PK-2610-CHK250-01');
    expect(formatBatchCode('2027-01-02', 'TRT500', 123)).toBe('PK-2701-TRT500-123');
    expect(batchCodePrefix('2026-10-11', 'MTN250')).toBe('PK-2610-MTN250-');
    expect(formatBatchCode('2026-10-11', 'CHK250', 7)).toMatch(BATCH_CODE_REGEX);
  });

  it('refuses bad input', () => {
    expect(() => formatBatchCode('11/10/2026', 'CHK250', 1)).toThrow();
    expect(() => formatBatchCode('2026-10-11', 'chk 250', 1)).toThrow();
    expect(() => formatBatchCode('2026-10-11', 'CHK250', 0)).toThrow();
  });

  it('todayInIST rolls over at IST midnight, not UTC', () => {
    expect(todayInIST(new Date('2026-10-10T18:29:00Z'))).toBe('2026-10-10');
    expect(todayInIST(new Date('2026-10-10T18:31:00Z'))).toBe('2026-10-11');
  });
});

describe('catalog contracts', () => {
  it('applies draft defaults and upper-cases the SKU', () => {
    const p = ProductCreateRequestSchema.parse({
      sku: 'chk250',
      slug: 'himachali-chicken-pickle-250g',
      productGroup: 'himachali-chicken-pickle',
      title: 'Himachali Chicken Pickle',
      description: 'Slow-cooked',
      meatType: 'CHICKEN',
      netWeightG: 250,
      pricePaise: 44_900,
    });
    expect(p).toMatchObject({ sku: 'CHK250', hsnCode: '2001', gstRateBp: null, shelfLifeDays: null, sortOrder: 0 });
  });

  it('rejects float paise', () => {
    expect(ProductCreateRequestSchema.safeParse({ pricePaise: 449.5 }).success).toBe(false);
  });

  it('lists what is missing before publish', () => {
    expect(
      missingForPublish({
        gstRateBp: 500,
        shelfLifeDays: null,
        ingredients: 'x',
        packedWeightG: null,
        nutrition: {},
        images: [],
      }),
    ).toEqual(['shelfLifeDays', 'packedWeightG', 'images']);
  });

  it('wastage must remove jars and needs a reason', () => {
    expect(AdjustmentRequestSchema.safeParse({ type: 'WASTAGE', quantityDelta: 2, reason: 'Broken' }).success).toBe(
      false,
    );
    expect(AdjustmentRequestSchema.safeParse({ type: 'WASTAGE', quantityDelta: -2, reason: 'Broken' }).success).toBe(
      true,
    );
    expect(AdjustmentRequestSchema.safeParse({ type: 'ADJUSTMENT', quantityDelta: 0, reason: 'None' }).success).toBe(
      false,
    );
  });
});
