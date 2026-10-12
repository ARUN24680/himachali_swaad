import { describe, expect, it } from 'vitest';
import { mulDivFloor, mulDivRound, settleCycle, type OrderFacts } from '../../src/modules/settlements/settlement-calc';

/** Phase 9 §9.9 / D-41 — hand-calculated expected values, exact to the paisa. */
const order = (o: Partial<OrderFacts>): OrderFacts => ({
  orderId: o.orderCode ?? 'x',
  orderCode: 'PK-AAAAAA',
  status: 'DELIVERED',
  closedAt: new Date('2026-10-10T06:00:00Z'),
  totalPaise: 39_900,
  taxPaise: 1_900,
  refundsPaise: 0,
  rawCostPaise: 12_000,
  jars: 1,
  packedJars: 1,
  shipped: true,
  freightPaise: 8_500,
  gatewayFeePaise: 942,
  rtoFreightPaise: 0,
  ...o,
});

describe('settlement maths (settlement.calc)', () => {
  it('architecture/04 worked example: ₹399 jar → net ₹133.58, partner ₹66.79, payout ₹186.79', () => {
    const r = settleCycle({
      orders: [order({})],
      packagingCostPerJarPaise: 3_200,
      sharedExpensesPaise: 0,
      partnerPaidExpensesPaise: 0,
      partnerSplitBp: 5_000,
    });
    expect(r.lines[0]).toMatchObject({ revenueExGstPaise: 38_000, netPaise: 13_358 });
    expect(r.totals).toMatchObject({
      netProfitPaise: 13_358,
      partnerSharePaise: 6_679,
      adminSharePaise: 6_679,
      partnerPayoutPaise: 18_679,
    });
    expect(r.warnings).toEqual([]);
  });

  it('fixture cycle: delivered + partial refund + RTO + cancelled-before-packing + expenses, odd-paisa split', () => {
    const r = settleCycle({
      orders: [
        order({ orderCode: 'PK-AAAAA1' }),
        // ₹100 goodwill refund on a ₹399 order: kept 29 900 × 38 000 / 39 900 = 28 476.19… → 28 476
        order({ orderCode: 'PK-AAAAA2', refundsPaise: 10_000 }),
        // RTO: jar lost, freight both ways, no refund yet
        order({ orderCode: 'PK-AAAAA3', status: 'RTO_DELIVERED', rtoFreightPaise: 8_500 }),
        // Cancelled at CONFIRMED and fully refunded: jar back on the shelf, nothing shipped, fee lost
        order({
          orderCode: 'PK-AAAAA4',
          status: 'CANCELLED',
          refundsPaise: 39_900,
          rawCostPaise: 0,
          packedJars: 0,
          shipped: false,
          freightPaise: null,
        }),
      ],
      packagingCostPerJarPaise: 3_200,
      sharedExpensesPaise: 5_001,
      partnerPaidExpensesPaise: 2_000,
      partnerSplitBp: 5_000,
    });
    expect(r.lines.map((l) => [l.orderCode, l.revenueExGstPaise, l.netPaise])).toEqual([
      ['PK-AAAAA1', 38_000, 13_358],
      ['PK-AAAAA2', 28_476, 3_834], // 28 476 − 12 000 − 3 200 − 8 500 − 942
      ['PK-AAAAA3', 38_000, 4_858], // 38 000 − 12 000 − 3 200 − 8 500 − 942 − 8 500
      ['PK-AAAAA4', 0, -942],
    ]);
    // Σ net = 21 108; − 5 001 expenses = 16 107 (odd) → partner floor(8 053.5) = 8 053, admin 8 054
    expect(r.totals).toEqual({
      ordersCount: 4,
      jarsCount: 4,
      revenueExGstPaise: 104_476,
      rawCostPaise: 36_000,
      packagingCostPaise: 9_600,
      freightPaise: 25_500,
      gatewayFeePaise: 3_768,
      refundsPaise: 49_900,
      rtoFreightPaise: 8_500,
      sharedExpensesPaise: 5_001,
      netProfitPaise: 16_107,
      partnerSharePaise: 8_053,
      adminSharePaise: 8_054,
      expenseReimbursementPaise: 2_000,
      partnerPayoutPaise: 46_053, // 36 000 + 8 053 + 2 000
    });
    expect(r.totals.partnerSharePaise + r.totals.adminSharePaise).toBe(r.totals.netProfitPaise);
  });

  it('a loss is shown, split floor-down (no hidden carry-forward); missing data → warnings', () => {
    const r = settleCycle({
      orders: [order({ orderCode: 'PK-AAAAB1', freightPaise: null, gatewayFeePaise: null })],
      packagingCostPerJarPaise: 3_200,
      sharedExpensesPaise: 30_001,
      partnerPaidExpensesPaise: 0,
      partnerSplitBp: 5_000,
    });
    // net 38 000 − 12 000 − 3 200 = 22 800 (freight/fee unknown → 0 + warning); − 30 001 = −7 201
    expect(r.totals.netProfitPaise).toBe(-7_201);
    expect(r.totals.partnerSharePaise).toBe(-3_601);
    expect(r.totals.adminSharePaise).toBe(-3_600);
    expect(r.warnings).toEqual([
      { orderCode: 'PK-AAAAB1', issue: 'MISSING_FREIGHT' },
      { orderCode: 'PK-AAAAB1', issue: 'MISSING_GATEWAY_FEE' },
    ]);
  });

  it('integer helpers', () => {
    expect(mulDivRound(29_900, 38_000, 39_900)).toBe(28_476);
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivFloor(16_107, 5_000, 10_000)).toBe(8_053);
    expect(mulDivFloor(-7_201, 5_000, 10_000)).toBe(-3_601);
    expect(mulDivFloor(-7_200, 5_000, 10_000)).toBe(-3_600);
  });
});
