import type {
  ExpenseRow,
  SettlementDetail,
  SettlementGenerateRequest,
  SettlementSummary,
  SignedUrlResponse,
} from '@pk/shared';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db, Queryable } from '../../config/db';
import { renderSettlementStatement, rs } from '../../integrations/pdf/settlement-pdf';
import type { PaymentGateway } from '../../integrations/razorpay/gateway';
import { SIGNED_URL_TTL_SEC, type PrivateStorage } from '../../integrations/storage/private';
import { jobIds, type JobQueue } from '../../jobs/queues';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import type { SettingsService } from '../settings/settings.service';
import { settleCycle } from './settlement-calc';
import * as repo from './settlements.repository';

const Paise = z.coerce.number().int().nonnegative();
const SplitBp = z.coerce.number().int().min(0).max(10_000);
const NOT_FOUND = () => new AppError('NOT_FOUND', 'Settlement not found.');

export interface Actor {
  auth: AuthContext;
  ip: string | null;
}

const summary = (s: repo.SettlementRow): SettlementSummary => ({
  id: s.id,
  periodStart: s.period_start,
  periodEnd: s.period_end,
  status: s.status,
  partnerSplitBp: s.partner_split_bp,
  ordersCount: s.orders_count,
  jarsCount: s.jars_count,
  revenueExGstPaise: s.revenue_ex_gst_paise,
  rawCostPaise: s.raw_cost_paise,
  packagingCostPaise: s.packaging_cost_paise,
  freightPaise: s.freight_paise,
  gatewayFeePaise: s.gateway_fee_paise,
  refundsPaise: s.refunds_paise,
  rtoFreightPaise: s.rto_freight_paise,
  sharedExpensesPaise: s.shared_expenses_paise,
  netProfitPaise: s.net_profit_paise,
  partnerSharePaise: s.partner_share_paise,
  adminSharePaise: s.admin_share_paise,
  expenseReimbursementPaise: s.expense_reimbursement_paise,
  partnerPayoutPaise: s.partner_payout_paise,
  bankReference: s.bank_reference,
  finalizedAt: s.finalized_at?.toISOString() ?? null,
  paidAt: s.paid_at?.toISOString() ?? null,
  partnerAcknowledgedAt: s.partner_acknowledged_at?.toISOString() ?? null,
  warningsCount: s.warnings.length,
  createdAt: s.created_at.toISOString(),
});

const expenseRow = (e: repo.ExpenseRowDb): ExpenseRow => ({
  id: e.id,
  category: e.category as ExpenseRow['category'],
  amountPaise: e.amount_paise,
  incurredOn: e.incurred_on,
  description: e.description,
  paidBy: e.paid_by_id ? { id: e.paid_by_id, name: e.paid_by_name ?? '—' } : null,
  receiptAvailable: e.receipt_key !== null,
  settlementId: e.settlement_id,
  locked: e.settlement_id !== null,
  createdAt: e.created_at.toISOString(),
});

/**
 * Partner settlements + expenses (Phase 9 §9.8, §9.9, D-40, D-41). DRAFT → FINALIZED (numbers
 * locked, statement PDF, partner told) → PAID (bank reference); the partner acknowledges once.
 * An expense that belongs to any settlement is locked; deleting a DRAFT releases it.
 */
export function createSettlementsService(deps: {
  db: Db;
  settings: SettingsService;
  gateway: PaymentGateway;
  privateStorage: PrivateStorage;
  jobs: JobQueue;
  logger: Logger;
}) {
  const { db, settings, gateway, privateStorage, jobs, logger } = deps;

  async function detail(id: string, partnerView: boolean): Promise<SettlementDetail> {
    const s = await repo.findSettlement(db, id);
    if (!s || (partnerView && s.status === 'DRAFT')) throw NOT_FOUND();
    const [items, expenses] = await Promise.all([repo.listItems(db, id), repo.listSettlementExpenses(db, id)]);
    return {
      settlement: summary(s),
      items: items.map((i) => ({
        orderCode: i.order_code,
        status: i.status,
        closedAt: i.closed_at.toISOString(),
        jars: i.jars,
        revenueExGstPaise: i.revenue_ex_gst_paise,
        rawCostPaise: i.raw_cost_paise,
        packagingCostPaise: i.packaging_cost_paise,
        freightPaise: i.freight_paise,
        gatewayFeePaise: i.gateway_fee_paise,
        refundsPaise: i.refunds_paise,
        rtoFreightPaise: i.rto_freight_paise,
        netPaise: i.net_paise,
      })),
      expenses: expenses.map(expenseRow),
      warnings: s.warnings,
      canFinalize: s.status === 'DRAFT' && s.warnings.length === 0,
      statementAvailable: s.statement_key !== null,
    };
  }

  async function statementUrl(id: string, partnerView: boolean): Promise<SignedUrlResponse> {
    const s = await repo.findSettlement(db, id);
    if (!s || !s.statement_key || (partnerView && s.status === 'DRAFT'))
      throw new AppError('NOT_FOUND', 'Statement not ready.');
    const { url, expiresAt } = await privateStorage.signedGetUrl(s.statement_key, SIGNED_URL_TTL_SEC);
    return { url, expiresAt: expiresAt.toISOString() };
  }

  async function assertExpenseEditable(id: string, q: Queryable = db) {
    const e = await repo.findExpense(q, id, q !== db);
    if (!e) throw new AppError('NOT_FOUND', 'Expense not found.');
    if (e.settlement_id) {
      throw new AppError(
        'INVALID_STATE',
        'This expense is part of a settlement — delete that DRAFT first (finalized ones are permanent).',
        {
          settlementId: e.settlement_id,
          settlementStatus: e.settlement_status,
        },
      );
    }
    return e;
  }

  async function assertPaidBy(id: string | null | undefined) {
    if (id && !(await repo.findStaffUser(db, id))) {
      throw new AppError('VALIDATION_ERROR', 'Paid-by must be a staff member.', { field: 'paidById' });
    }
  }

  return {
    // ── Settlements ──────────────────────────────────────────────────────────────────────────
    list: async (partnerView: boolean) => ({
      settlements: (await repo.listSettlements(db, partnerView ? ['FINALIZED', 'PAID'] : null)).map(summary),
    }),
    detail,
    statementUrl,

    /** POST /admin/settlements — DRAFT for a period. Missing gateway fees are fetched first. */
    async generate(req: SettlementGenerateRequest, by: Actor): Promise<SettlementDetail> {
      if (await repo.existsForPeriod(db, req.periodStart, req.periodEnd)) {
        throw new AppError('DUPLICATE', 'A settlement for exactly this period already exists.');
      }
      // (1) Backfill Razorpay fee/tax outside any transaction (D-30)
      const prelim = await repo.listEligibleOrderFacts(db, req.periodStart, req.periodEnd);
      for (const p of await repo.listPaymentsMissingFee(
        db,
        prelim.map((o) => o.orderId),
      )) {
        try {
          const g = await gateway.fetchPayment(p.gateway_payment_id);
          if (g.feePaise != null && g.taxPaise != null) await repo.setPaymentFee(db, p.id, g.feePaise, g.taxPaise);
        } catch (err) {
          logger.warn({ err, paymentId: p.id }, 'gateway fee backfill failed — settlement will warn');
        }
      }
      const [packaging, defaultSplit] = await Promise.all([
        settings.getSetting(db, 'packaging_cost_per_jar_paise', Paise),
        settings.getSetting(db, 'partner_split_bp', SplitBp),
      ]);
      const splitBp = req.partnerSplitBp ?? defaultSplit;

      // (2) One transaction: compute from a consistent snapshot, insert, claim the expenses
      const id = await db.transaction(async (client) => {
        const orders = await repo.listEligibleOrderFacts(client, req.periodStart, req.periodEnd);
        const expenses = await repo.lockOpenExpenses(client, req.periodStart, req.periodEnd);
        const calc = settleCycle({
          orders,
          packagingCostPerJarPaise: packaging,
          sharedExpensesPaise: expenses.reduce((s, e) => s + e.amount_paise, 0),
          partnerPaidExpensesPaise: expenses.filter((e) => e.partner_paid).reduce((s, e) => s + e.amount_paise, 0),
          partnerSplitBp: splitBp,
        });
        if (calc.lines.length === 0 && expenses.length === 0) {
          throw new AppError('VALIDATION_FAILED', 'Nothing to settle in this period.', {
            periodStart: req.periodStart,
            periodEnd: req.periodEnd,
          });
        }
        const sid = await repo.insertSettlement(client, {
          start: req.periodStart,
          end: req.periodEnd,
          splitBp,
          totals: calc.totals,
          warnings: calc.warnings,
          createdBy: by.auth.userId,
        });
        if (!sid) throw new AppError('DUPLICATE', 'A settlement for exactly this period already exists.');
        await repo.insertItems(client, sid, calc.lines);
        await repo.attachExpenses(
          client,
          sid,
          expenses.map((e) => e.id),
        );
        await audit(client, {
          actorId: by.auth.userId,
          action: 'SETTLEMENT_GENERATE',
          entityType: 'settlement',
          entityId: sid,
          after: {
            periodStart: req.periodStart,
            periodEnd: req.periodEnd,
            ...calc.totals,
            warnings: calc.warnings.length,
          },
          ip: by.ip,
        });
        return sid;
      });
      return detail(id, false);
    },

    async deleteDraft(id: string, by: Actor) {
      return db.transaction(async (client) => {
        const s = await repo.findSettlement(client, id, true);
        if (!s) throw NOT_FOUND();
        if (s.status !== 'DRAFT')
          throw new AppError('INVALID_STATE', 'Finalized settlements are permanent.', { status: s.status });
        await repo.deleteDraft(client, id);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'SETTLEMENT_DELETE',
          entityType: 'settlement',
          entityId: id,
          before: { periodStart: s.period_start, periodEnd: s.period_end, netProfitPaise: s.net_profit_paise },
          ip: by.ip,
        });
        return { ok: true as const, message: 'Draft deleted.' };
      });
    },

    /** DRAFT → FINALIZED: blocked while data is missing; statement PDF; partner notified. */
    async finalize(id: string, by: Actor): Promise<SettlementDetail> {
      const before = await detail(id, false);
      if (before.settlement.status !== 'DRAFT') {
        throw new AppError('INVALID_STATE', 'Only a DRAFT can be finalized.', { status: before.settlement.status });
      }
      if (before.warnings.length) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Fix the missing freight / gateway fees, then delete and regenerate this draft.',
          {
            warnings: before.warnings,
          },
        );
      }
      // PDF + upload outside the transaction (D-30)
      const pdf = await renderSettlementStatement({
        periodStart: before.settlement.periodStart,
        periodEnd: before.settlement.periodEnd,
        status: 'FINALIZED',
        partnerSplitBp: before.settlement.partnerSplitBp,
        totals: before.settlement,
        items: before.items,
        expenses: before.expenses,
        generatedAt: new Date(),
      });
      const key = `settlements/${id}-${randomUUID().slice(0, 8)}.pdf`;
      await privateStorage.put(key, pdf, 'application/pdf');
      await db.transaction(async (client) => {
        const s = await repo.findSettlement(client, id, true);
        if (!s || !(await repo.markFinalized(client, id, by.auth.userId, key))) {
          throw new AppError('STALE_STATE', 'This settlement changed meanwhile. Refresh and try again.');
        }
        await audit(client, {
          actorId: by.auth.userId,
          action: 'SETTLEMENT_FINALIZE',
          entityType: 'settlement',
          entityId: id,
          before: { status: 'DRAFT' },
          after: { status: 'FINALIZED', partnerPayoutPaise: s.partner_payout_paise, statementKey: key },
          ip: by.ip,
        });
      });
      for (const partnerId of await repo.listActivePartnerIds(db)) {
        await jobs
          .add(
            'WHATSAPP_SEND',
            {
              template: 'settlement_ready',
              userId: partnerId,
              orderId: null,
              variables: {
                period: `${before.settlement.periodStart} – ${before.settlement.periodEnd}`,
                payout: rs(before.settlement.partnerPayoutPaise),
              },
            },
            jobIds.notify('settlement_ready', `${id}-${partnerId}`),
          )
          .catch((err: unknown) => logger.error({ err }, 'settlement notify enqueue failed'));
      }
      return detail(id, false);
    },

    async markPaid(id: string, body: { bankReference: string; paidAt: string }, by: Actor): Promise<SettlementDetail> {
      await db.transaction(async (client) => {
        const s = await repo.findSettlement(client, id, true);
        if (!s) throw NOT_FOUND();
        if (s.status !== 'FINALIZED')
          throw new AppError('INVALID_STATE', 'Only a FINALIZED settlement can be marked paid.', { status: s.status });
        await repo.markPaid(client, id, body.bankReference, body.paidAt);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'SETTLEMENT_PAID',
          entityType: 'settlement',
          entityId: id,
          before: { status: 'FINALIZED' },
          after: { status: 'PAID', bankReference: body.bankReference, paidAt: body.paidAt },
          ip: by.ip,
        });
      });
      return detail(id, false);
    },

    /** Partner (D-40): acknowledge a finalized / paid statement — once. */
    async acknowledge(id: string, by: Actor): Promise<SettlementDetail> {
      await db.transaction(async (client) => {
        const s = await repo.findSettlement(client, id, true);
        if (!s || s.status === 'DRAFT') throw NOT_FOUND();
        if (!(await repo.markAcknowledged(client, id, by.auth.userId))) {
          throw new AppError('INVALID_STATE', 'This statement was already acknowledged.');
        }
        await audit(client, {
          actorId: by.auth.userId,
          action: 'SETTLEMENT_ACKNOWLEDGE',
          entityType: 'settlement',
          entityId: id,
          ip: by.ip,
        });
      });
      return detail(id, true);
    },

    // ── Expenses ─────────────────────────────────────────────────────────────────────────────
    async expenses(p: { from?: string; to?: string; category?: string; page: number; pageSize: number }) {
      const rows = await repo.listExpenses(db, p);
      return {
        expenses: rows.map(expenseRow),
        page: p.page,
        pageSize: p.pageSize,
        total: rows[0]?.total ?? 0,
        totalPaise: rows[0]?.total_paise ?? 0,
      };
    },

    async createExpense(
      body: { category: string; amountPaise: number; incurredOn: string; description: string; paidById: string | null },
      by: Actor,
    ): Promise<ExpenseRow> {
      await assertPaidBy(body.paidById);
      const id = await db.transaction(async (client) => {
        const eid = await repo.insertExpense(client, { ...body, createdBy: by.auth.userId });
        await audit(client, {
          actorId: by.auth.userId,
          action: 'EXPENSE_CREATE',
          entityType: 'expense',
          entityId: eid,
          after: body,
          ip: by.ip,
        });
        return eid;
      });
      return expenseRow((await repo.findExpense(db, id))!);
    },

    async updateExpense(
      id: string,
      body: Partial<{
        category: string;
        amountPaise: number;
        incurredOn: string;
        description: string;
        paidById: string | null;
        receiptKey: string;
      }>,
      by: Actor,
    ): Promise<ExpenseRow> {
      await assertPaidBy(body.paidById);
      if (body.receiptKey && !body.receiptKey.startsWith(`receipts/${id}/`)) {
        throw new AppError('VALIDATION_ERROR', 'Receipt key does not belong to this expense.', { field: 'receiptKey' });
      }
      await db.transaction(async (client) => {
        const before = await assertExpenseEditable(id, client);
        await repo.updateExpense(client, id, body);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'EXPENSE_UPDATE',
          entityType: 'expense',
          entityId: id,
          before: {
            category: before.category,
            amountPaise: before.amount_paise,
            incurredOn: before.incurred_on,
            description: before.description,
          },
          after: body,
          ip: by.ip,
        });
      });
      return expenseRow((await repo.findExpense(db, id))!);
    },

    async deleteExpense(id: string, by: Actor) {
      await db.transaction(async (client) => {
        const before = await assertExpenseEditable(id, client);
        await repo.deleteExpense(client, id);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'EXPENSE_DELETE',
          entityType: 'expense',
          entityId: id,
          before: { category: before.category, amountPaise: before.amount_paise, incurredOn: before.incurred_on },
          ip: by.ip,
        });
      });
      return { ok: true as const, message: 'Expense deleted.' };
    },

    async receiptUpload(id: string, body: { contentType: string; sizeBytes: number }) {
      await assertExpenseEditable(id);
      const ext =
        { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[body.contentType] ??
        'bin';
      const key = `receipts/${id}/${randomUUID()}.${ext}`;
      const signed = await privateStorage.presignPut({ key, contentType: body.contentType, sizeBytes: body.sizeBytes });
      return { key, uploadUrl: signed.url, method: 'PUT' as const, headers: signed.headers };
    },

    async receiptUrl(id: string): Promise<SignedUrlResponse> {
      const e = await repo.findExpense(db, id);
      if (!e?.receipt_key) throw new AppError('NOT_FOUND', 'No receipt uploaded.');
      const { url, expiresAt } = await privateStorage.signedGetUrl(e.receipt_key, SIGNED_URL_TTL_SEC);
      return { url, expiresAt: expiresAt.toISOString() };
    },
  };
}

export type SettlementsService = ReturnType<typeof createSettlementsService>;
