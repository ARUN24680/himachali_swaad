/**
 * Partner settlement maths (D-41, architecture/04 §Finance, Phase 9 §9.9) — pure and integer-paise.
 *
 * Per order:  net = revenue_ex_gst − raw_cost − packaging − freight − gateway_fee − rto_freight
 *   revenue_ex_gst = (total − refunds) × (total − tax) / total, half-up — the GST share of the money
 *   we kept (the phase file's "total − tax − refunds" would go negative on a full refund, D-56).
 * Cycle:      net_profit = Σ net − shared_expenses
 *             partner_share = floor(net_profit × split_bp / 10000), admin_share = the remainder
 *             partner_payout = raw_cost (reimbursed) + partner_share + partner-paid expenses
 */
export interface OrderFacts {
  orderId: string;
  orderCode: string;
  status: string;
  closedAt: Date;
  totalPaise: number;
  taxPaise: number;
  refundsPaise: number;
  rawCostPaise: number;
  jars: number;
  /** Jars a box was actually packed for (0 when cancelled before packing). */
  packedJars: number;
  shipped: boolean;
  freightPaise: number | null;
  gatewayFeePaise: number | null;
  rtoFreightPaise: number;
}

export interface SettlementLine {
  orderId: string;
  orderCode: string;
  status: string;
  closedAt: Date;
  jars: number;
  revenueExGstPaise: number;
  rawCostPaise: number;
  packagingCostPaise: number;
  freightPaise: number;
  gatewayFeePaise: number;
  refundsPaise: number;
  rtoFreightPaise: number;
  netPaise: number;
}

export type SettlementWarning = { orderCode: string; issue: 'MISSING_FREIGHT' | 'MISSING_GATEWAY_FEE' };

export interface SettlementTotals {
  ordersCount: number;
  jarsCount: number;
  revenueExGstPaise: number;
  rawCostPaise: number;
  packagingCostPaise: number;
  freightPaise: number;
  gatewayFeePaise: number;
  refundsPaise: number;
  rtoFreightPaise: number;
  sharedExpensesPaise: number;
  netProfitPaise: number;
  partnerSharePaise: number;
  adminSharePaise: number;
  expenseReimbursementPaise: number;
  partnerPayoutPaise: number;
}

/** a × b / c rounded half away from zero, exact for paise-sized integers. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  const q = n / d;
  const r = n % d;
  const twice = (r < 0n ? -r : r) * 2n;
  const bump = twice >= (d < 0n ? -d : d) ? (n < 0n !== d < 0n ? -1n : 1n) : 0n;
  return Number(q + bump);
}

/** floor(a × b / c) for possibly negative a (partner share of a loss rounds DOWN). */
export function mulDivFloor(a: number, b: number, c: number): number {
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  const q = n / d;
  return Number(n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q);
}

export function settleOrder(
  o: OrderFacts,
  packagingCostPerJarPaise: number,
): { line: SettlementLine; warnings: SettlementWarning[] } {
  const warnings: SettlementWarning[] = [];
  const kept = Math.max(0, o.totalPaise - o.refundsPaise);
  const revenueExGstPaise = mulDivRound(kept, o.totalPaise - o.taxPaise, o.totalPaise);
  const packagingCostPaise = o.packedJars * packagingCostPerJarPaise;
  let freightPaise = 0;
  if (o.shipped) {
    if (o.freightPaise === null) warnings.push({ orderCode: o.orderCode, issue: 'MISSING_FREIGHT' });
    else freightPaise = o.freightPaise;
  }
  if (o.gatewayFeePaise === null) warnings.push({ orderCode: o.orderCode, issue: 'MISSING_GATEWAY_FEE' });
  const gatewayFeePaise = o.gatewayFeePaise ?? 0;
  const netPaise =
    revenueExGstPaise - o.rawCostPaise - packagingCostPaise - freightPaise - gatewayFeePaise - o.rtoFreightPaise;
  return {
    line: {
      orderId: o.orderId,
      orderCode: o.orderCode,
      status: o.status,
      closedAt: o.closedAt,
      jars: o.jars,
      revenueExGstPaise,
      rawCostPaise: o.rawCostPaise,
      packagingCostPaise,
      freightPaise,
      gatewayFeePaise,
      refundsPaise: o.refundsPaise,
      rtoFreightPaise: o.rtoFreightPaise,
      netPaise,
    },
    warnings,
  };
}

export function settleCycle(p: {
  orders: OrderFacts[];
  packagingCostPerJarPaise: number;
  sharedExpensesPaise: number;
  partnerPaidExpensesPaise: number;
  partnerSplitBp: number;
}): { lines: SettlementLine[]; warnings: SettlementWarning[]; totals: SettlementTotals } {
  const lines: SettlementLine[] = [];
  const warnings: SettlementWarning[] = [];
  for (const o of p.orders) {
    const r = settleOrder(o, p.packagingCostPerJarPaise);
    lines.push(r.line);
    warnings.push(...r.warnings);
  }
  const sum = (k: keyof SettlementLine) => lines.reduce((s, l) => s + (l[k] as number), 0);
  const netProfitPaise = sum('netPaise') - p.sharedExpensesPaise;
  const partnerSharePaise = mulDivFloor(netProfitPaise, p.partnerSplitBp, 10_000);
  const rawCostPaise = sum('rawCostPaise');
  return {
    lines,
    warnings,
    totals: {
      ordersCount: lines.length,
      jarsCount: sum('jars'),
      revenueExGstPaise: sum('revenueExGstPaise'),
      rawCostPaise,
      packagingCostPaise: sum('packagingCostPaise'),
      freightPaise: sum('freightPaise'),
      gatewayFeePaise: sum('gatewayFeePaise'),
      refundsPaise: sum('refundsPaise'),
      rtoFreightPaise: sum('rtoFreightPaise'),
      sharedExpensesPaise: p.sharedExpensesPaise,
      netProfitPaise,
      partnerSharePaise,
      adminSharePaise: netProfitPaise - partnerSharePaise,
      expenseReimbursementPaise: p.partnerPaidExpensesPaise,
      partnerPayoutPaise: rawCostPaise + partnerSharePaise + p.partnerPaidExpensesPaise,
    },
  };
}
