import type { Queryable } from '../../config/db';
import type { OrderFacts, SettlementLine, SettlementTotals, SettlementWarning } from './settlement-calc';

/** Raw SQL for settlements, settlement_items and expenses (migration 0006, D-40/D-41). */

/** When the order "closed" for settlement purposes (IST day decides the period). */
const CLOSED_AT = `CASE o.status
    WHEN 'DELIVERED' THEN o.delivered_at
    WHEN 'CANCELLED' THEN o.cancelled_at
    ELSE (SELECT max(l.created_at) FROM order_status_logs l WHERE l.order_id = o.id AND l.to_status = o.status) END`;

interface FactsRow {
  order_id: string;
  order_code: string;
  status: string;
  closed_at: Date;
  total_paise: number;
  tax_paise: number;
  refunds_paise: number;
  raw_cost_paise: number;
  jars: number;
  packed: boolean;
  shipped: boolean;
  freight_paise: number | null;
  gateway_fee_paise: number | null;
  rto_freight_paise: number | null;
}

/**
 * Orders that closed in [start, end] (IST) and aren't settled yet: delivered, RTO'd, lost, or
 * cancelled after a captured payment (Phase 9 §9.9).
 */
export async function listEligibleOrderFacts(q: Queryable, start: string, end: string): Promise<OrderFacts[]> {
  const { rows } = await q.query<FactsRow>(
    `WITH closed AS (
       SELECT o.*, ${CLOSED_AT} AS closed_at FROM orders o
        WHERE o.status IN ('DELIVERED', 'RTO_DELIVERED', 'LOST', 'CANCELLED')
          AND NOT EXISTS (SELECT 1 FROM settlement_items si WHERE si.order_id = o.id)
          AND (o.status <> 'CANCELLED' OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'CAPTURED')))
     SELECT c.id AS order_id, c.order_code, c.status, c.closed_at, c.total_paise, c.tax_paise,
            (SELECT COALESCE(sum(r.amount_paise), 0) FROM refunds r
              WHERE r.order_id = c.id AND r.status <> 'FAILED' AND r.reason <> 'DUPLICATE_PAYMENT')::bigint AS refunds_paise,
            (SELECT COALESCE(sum(a.quantity * b.cost_per_unit_paise), 0) FROM order_item_allocations a
               JOIN order_items oi ON oi.id = a.order_item_id JOIN inventory_batches b ON b.id = a.batch_id
              WHERE oi.order_id = c.id AND a.status = 'COMMITTED')::bigint AS raw_cost_paise,
            (SELECT COALESCE(sum(quantity), 0) FROM order_items WHERE order_id = c.id)::int AS jars,
            (c.packed_at IS NOT NULL) AS packed,
            (c.shipped_at IS NOT NULL) AS shipped,
            s.freight_paise, s.rto_freight_paise,
            (SELECT CASE WHEN bool_or(p.fee_paise IS NULL OR p.fee_tax_paise IS NULL) THEN NULL
                         ELSE sum(p.fee_paise + p.fee_tax_paise) END
               FROM payments p WHERE p.order_id = c.id AND p.status = 'CAPTURED')::bigint AS gateway_fee_paise
       FROM closed c LEFT JOIN shipments s ON s.order_id = c.id
      WHERE (c.closed_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ORDER BY c.closed_at, c.order_code`,
    [start, end],
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    orderCode: r.order_code,
    status: r.status,
    closedAt: r.closed_at,
    totalPaise: r.total_paise,
    taxPaise: r.tax_paise,
    refundsPaise: r.refunds_paise,
    rawCostPaise: r.raw_cost_paise,
    jars: r.jars,
    packedJars: r.packed ? r.jars : 0,
    shipped: r.shipped,
    freightPaise: r.freight_paise,
    gatewayFeePaise: r.gateway_fee_paise,
    rtoFreightPaise: r.status.startsWith('RTO') ? (r.rto_freight_paise ?? 0) : 0,
  }));
}

/** Captured payments in the period's eligible orders still missing Razorpay fee data. */
export async function listPaymentsMissingFee(q: Queryable, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const { rows } = await q.query<{ id: string; gateway_payment_id: string }>(
    `SELECT id, gateway_payment_id FROM payments
      WHERE order_id = ANY($1::uuid[]) AND status = 'CAPTURED' AND gateway_payment_id IS NOT NULL
        AND (fee_paise IS NULL OR fee_tax_paise IS NULL)`,
    [orderIds],
  );
  return rows;
}

export async function setPaymentFee(q: Queryable, id: string, feePaise: number, taxPaise: number): Promise<void> {
  await q.query('UPDATE payments SET fee_paise = $2, fee_tax_paise = $3 WHERE id = $1', [id, feePaise, taxPaise]);
}

/** Unsettled expenses in the period (FOR UPDATE: two drafts can't grab the same expense). */
export async function lockOpenExpenses(q: Queryable, start: string, end: string) {
  const { rows } = await q.query<{ id: string; amount_paise: number; partner_paid: boolean }>(
    `SELECT e.id, e.amount_paise, (u.role = 'KITCHEN_PARTNER') IS TRUE AS partner_paid
       FROM expenses e LEFT JOIN users u ON u.id = e.paid_by_id
      WHERE e.settlement_id IS NULL AND e.incurred_on BETWEEN $1::date AND $2::date
      ORDER BY e.id FOR UPDATE OF e`,
    [start, end],
  );
  return rows;
}

export async function insertSettlement(
  q: Queryable,
  s: {
    start: string;
    end: string;
    splitBp: number;
    totals: SettlementTotals;
    warnings: SettlementWarning[];
    createdBy: string;
  },
): Promise<string | null> {
  const t = s.totals;
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO settlements (period_start, period_end, partner_split_bp, orders_count, jars_count, revenue_ex_gst_paise,
        raw_cost_paise, packaging_cost_paise, freight_paise, gateway_fee_paise, refunds_paise, rto_freight_paise,
        shared_expenses_paise, net_profit_paise, partner_share_paise, admin_share_paise, expense_reimbursement_paise,
        partner_payout_paise, warnings, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT ON CONSTRAINT uq_settlement_period DO NOTHING
     RETURNING id`,
    [
      s.start,
      s.end,
      s.splitBp,
      t.ordersCount,
      t.jarsCount,
      t.revenueExGstPaise,
      t.rawCostPaise,
      t.packagingCostPaise,
      t.freightPaise,
      t.gatewayFeePaise,
      t.refundsPaise,
      t.rtoFreightPaise,
      t.sharedExpensesPaise,
      t.netProfitPaise,
      t.partnerSharePaise,
      t.adminSharePaise,
      t.expenseReimbursementPaise,
      t.partnerPayoutPaise,
      JSON.stringify(s.warnings),
      s.createdBy,
    ],
  );
  return rows[0]?.id ?? null;
}

export async function insertItems(q: Queryable, settlementId: string, lines: SettlementLine[]): Promise<void> {
  for (const l of lines) {
    await q.query(
      `INSERT INTO settlement_items (settlement_id, order_id, closed_at, jars, revenue_ex_gst_paise, raw_cost_paise,
          packaging_cost_paise, freight_paise, gateway_fee_paise, refunds_paise, rto_freight_paise, net_paise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        settlementId,
        l.orderId,
        l.closedAt,
        l.jars,
        l.revenueExGstPaise,
        l.rawCostPaise,
        l.packagingCostPaise,
        l.freightPaise,
        l.gatewayFeePaise,
        l.refundsPaise,
        l.rtoFreightPaise,
        l.netPaise,
      ],
    );
  }
}

export async function attachExpenses(q: Queryable, settlementId: string, ids: string[]): Promise<void> {
  if (ids.length)
    await q.query('UPDATE expenses SET settlement_id = $1 WHERE id = ANY($2::uuid[])', [settlementId, ids]);
}

export interface SettlementRow {
  id: string;
  period_start: string;
  period_end: string;
  status: 'DRAFT' | 'FINALIZED' | 'PAID';
  partner_split_bp: number;
  orders_count: number;
  jars_count: number;
  revenue_ex_gst_paise: number;
  raw_cost_paise: number;
  packaging_cost_paise: number;
  freight_paise: number;
  gateway_fee_paise: number;
  refunds_paise: number;
  rto_freight_paise: number;
  shared_expenses_paise: number;
  net_profit_paise: number;
  partner_share_paise: number;
  admin_share_paise: number;
  expense_reimbursement_paise: number;
  partner_payout_paise: number;
  warnings: SettlementWarning[];
  bank_reference: string | null;
  statement_key: string | null;
  finalized_at: Date | null;
  paid_at: Date | null;
  partner_acknowledged_at: Date | null;
  created_at: Date;
}

export async function existsForPeriod(q: Queryable, start: string, end: string): Promise<boolean> {
  const { rowCount } = await q.query('SELECT 1 FROM settlements WHERE period_start = $1 AND period_end = $2', [
    start,
    end,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function findSettlement(q: Queryable, id: string, lock = false): Promise<SettlementRow | null> {
  const { rows } = await q.query<SettlementRow>(`SELECT * FROM settlements WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [
    id,
  ]);
  return rows[0] ?? null;
}

export async function listSettlements(q: Queryable, statuses: string[] | null): Promise<SettlementRow[]> {
  const { rows } = await q.query<SettlementRow>(
    `SELECT * FROM settlements WHERE ($1::text[] IS NULL OR status::text = ANY($1::text[]))
      ORDER BY period_end DESC, created_at DESC LIMIT 200`,
    [statuses],
  );
  return rows;
}

export async function listItems(q: Queryable, settlementId: string) {
  const { rows } = await q.query<{
    order_code: string;
    status: string;
    closed_at: Date;
    jars: number;
    revenue_ex_gst_paise: number;
    raw_cost_paise: number;
    packaging_cost_paise: number;
    freight_paise: number;
    gateway_fee_paise: number;
    refunds_paise: number;
    rto_freight_paise: number;
    net_paise: number;
  }>(
    `SELECT o.order_code, o.status, si.closed_at, si.jars, si.revenue_ex_gst_paise, si.raw_cost_paise,
            si.packaging_cost_paise, si.freight_paise, si.gateway_fee_paise, si.refunds_paise, si.rto_freight_paise, si.net_paise
       FROM settlement_items si JOIN orders o ON o.id = si.order_id
      WHERE si.settlement_id = $1 ORDER BY si.closed_at, o.order_code`,
    [settlementId],
  );
  return rows;
}

/** DRAFT only (CASCADE drops the items; expenses are released via ON DELETE SET NULL). */
export async function deleteDraft(q: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await q.query("DELETE FROM settlements WHERE id = $1 AND status = 'DRAFT'", [id]);
  return rowCount === 1;
}

export async function markFinalized(q: Queryable, id: string, by: string, statementKey: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `UPDATE settlements SET status = 'FINALIZED', finalized_by = $2, finalized_at = NOW(), statement_key = $3
      WHERE id = $1 AND status = 'DRAFT'`,
    [id, by, statementKey],
  );
  return rowCount === 1;
}

export async function markPaid(q: Queryable, id: string, bankReference: string, paidAt: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `UPDATE settlements SET status = 'PAID', bank_reference = $2, paid_at = $3 WHERE id = $1 AND status = 'FINALIZED'`,
    [id, bankReference, paidAt],
  );
  return rowCount === 1;
}

export async function markAcknowledged(q: Queryable, id: string, by: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `UPDATE settlements SET partner_acknowledged_by = $2, partner_acknowledged_at = NOW()
      WHERE id = $1 AND status IN ('FINALIZED', 'PAID') AND partner_acknowledged_at IS NULL`,
    [id, by],
  );
  return rowCount === 1;
}

// ── Expenses ───────────────────────────────────────────────────────────────────────────────────

export interface ExpenseRowDb {
  id: string;
  category: string;
  amount_paise: number;
  incurred_on: string;
  description: string;
  paid_by_id: string | null;
  paid_by_name: string | null;
  receipt_key: string | null;
  settlement_id: string | null;
  settlement_status: string | null;
  created_at: Date;
  total?: number;
  total_paise?: number;
}

const EXPENSE_SELECT = `SELECT e.id, e.category, e.amount_paise, to_char(e.incurred_on, 'YYYY-MM-DD') AS incurred_on, e.description,
    e.paid_by_id, COALESCE(u.full_name, u.email::text) AS paid_by_name, e.receipt_key, e.settlement_id,
    st.status::text AS settlement_status, e.created_at
  FROM expenses e LEFT JOIN users u ON u.id = e.paid_by_id LEFT JOIN settlements st ON st.id = e.settlement_id`;

export async function listExpenses(
  q: Queryable,
  p: { from?: string; to?: string; category?: string; page: number; pageSize: number },
): Promise<ExpenseRowDb[]> {
  const { rows } = await q.query<ExpenseRowDb>(
    `${EXPENSE_SELECT.replace('e.created_at', 'e.created_at, count(*) OVER ()::int AS total, sum(e.amount_paise) OVER ()::bigint AS total_paise')}
      WHERE ($1::date IS NULL OR e.incurred_on >= $1) AND ($2::date IS NULL OR e.incurred_on <= $2)
        AND ($3::text IS NULL OR e.category::text = $3)
      ORDER BY e.incurred_on DESC, e.created_at DESC LIMIT $4 OFFSET $5`,
    [p.from ?? null, p.to ?? null, p.category ?? null, p.pageSize, (p.page - 1) * p.pageSize],
  );
  return rows;
}

export async function listSettlementExpenses(q: Queryable, settlementId: string): Promise<ExpenseRowDb[]> {
  const { rows } = await q.query<ExpenseRowDb>(
    `${EXPENSE_SELECT} WHERE e.settlement_id = $1 ORDER BY e.incurred_on, e.id`,
    [settlementId],
  );
  return rows;
}

export async function findExpense(q: Queryable, id: string, lock = false): Promise<ExpenseRowDb | null> {
  const { rows } = await q.query<ExpenseRowDb>(`${EXPENSE_SELECT} WHERE e.id = $1${lock ? ' FOR UPDATE OF e' : ''}`, [
    id,
  ]);
  return rows[0] ?? null;
}

export async function insertExpense(
  q: Queryable,
  e: {
    category: string;
    amountPaise: number;
    incurredOn: string;
    description: string;
    paidById: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO expenses (category, amount_paise, incurred_on, description, paid_by_id, created_by_id)
     VALUES ($1::expense_category, $2, $3, $4, $5, $6) RETURNING id`,
    [e.category, e.amountPaise, e.incurredOn, e.description, e.paidById, e.createdBy],
  );
  return rows[0]!.id;
}

export async function updateExpense(
  q: Queryable,
  id: string,
  e: Partial<{
    category: string;
    amountPaise: number;
    incurredOn: string;
    description: string;
    paidById: string | null;
    receiptKey: string;
  }>,
): Promise<void> {
  await q.query(
    `UPDATE expenses SET
        category = COALESCE($2::expense_category, category),
        amount_paise = COALESCE($3, amount_paise),
        incurred_on = COALESCE($4::date, incurred_on),
        description = COALESCE($5, description),
        paid_by_id = CASE WHEN $6::boolean THEN $7::uuid ELSE paid_by_id END,
        receipt_key = COALESCE($8, receipt_key)
      WHERE id = $1`,
    [
      id,
      e.category ?? null,
      e.amountPaise ?? null,
      e.incurredOn ?? null,
      e.description ?? null,
      e.paidById !== undefined,
      e.paidById ?? null,
      e.receiptKey ?? null,
    ],
  );
}

export async function deleteExpense(q: Queryable, id: string): Promise<void> {
  await q.query('DELETE FROM expenses WHERE id = $1', [id]);
}

export async function findStaffUser(q: Queryable, id: string) {
  const { rows } = await q.query<{ id: string; role: string }>(
    "SELECT id, role FROM users WHERE id = $1 AND role IN ('ADMIN', 'KITCHEN_PARTNER')",
    [id],
  );
  return rows[0] ?? null;
}

export async function listActivePartnerIds(q: Queryable): Promise<string[]> {
  const { rows } = await q.query<{ id: string }>("SELECT id FROM users WHERE role = 'KITCHEN_PARTNER' AND is_active");
  return rows.map((r) => r.id);
}
