import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import { AppError } from '../../lib/errors';
import { orderStore } from '../gateway/gateway.service';
import * as repo from './alerts.repository';
import { parseCreditAlert } from './parse';

/** A credit alert older than this is not auto-matched (replayed / delayed message). */
const MAX_AGE_MS = 3 * 24 * 3600_000;
/** Phones and mail servers drift; anything further in the future is suspicious. */
const MAX_FUTURE_MS = 5 * 60_000;

export interface IncomingAlert {
  source: repo.AlertSource;
  /** Unique per delivery (SNS MessageId, device + nonce) — redelivery is a no-op. */
  externalId: string;
  sender: string | null;
  creditedAt: Date;
  /** Either raw alert text (parsed here) or already-structured values (admin entry, dev simulator). */
  text?: string;
  amountPaise?: number;
  utr?: string | null;
  /** Set when the channel's own checks failed (DKIM, sender allowlist …) — stored for audit only. */
  rejectReason?: string;
}

export type IngestOutcome =
  | { status: 'MATCHED'; alertId: number; orderId: string; paymentId: string }
  | { status: 'UNMATCHED' | 'DUPLICATE' | 'REJECTED'; alertId: number | null; reason: string | null };

/**
 * The matcher. Auto-confirms ONLY when: the channel verified the sender, the text is a credit with
 * an amount and a UTR, the UTR was never seen, and exactly one open order is waiting for exactly
 * that amount in its time window. Everything else is stored for admin review — never guessed.
 */
export function createAlertsService(deps: { db: Db; logger: Logger; now?: () => Date }) {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());

  async function ingest(a: IncomingAlert): Promise<IngestOutcome> {
    let amountPaise = a.amountPaise ?? null;
    let utr = a.utr ?? null;
    let reason: string | null = a.rejectReason ?? null;

    if (!reason && a.text !== undefined) {
      const parsed = parseCreditAlert(a.text);
      if (parsed.ok) {
        amountPaise = parsed.credit.amountPaise;
        utr = parsed.credit.utr;
      } else {
        reason = parsed.reason;
      }
    }
    const age = now().getTime() - a.creditedAt.getTime();
    if (!reason && age > MAX_AGE_MS) reason = 'STALE_ALERT';
    if (!reason && age < -MAX_FUTURE_MS) reason = 'FUTURE_TIMESTAMP';

    const base = {
      source: a.source,
      externalId: a.externalId,
      utr,
      amountPaise,
      creditedAt: a.creditedAt,
      sender: a.sender?.slice(0, 200) ?? null,
    };

    const outcome = await db.transaction(async (client): Promise<IngestOutcome> => {
      const store = async (status: repo.AlertStatus, why: string | null, orderId: string | null = null) => {
        const row = await repo.insertAlert(client, { ...base, status, reason: why, orderId });
        return row;
      };

      if (await repo.alertExists(client, a.externalId))
        return { status: 'DUPLICATE', alertId: null, reason: 'REDELIVERY' };
      if (reason === 'NOT_A_CREDIT') {
        // Debits (our refunds), OTPs, balance messages — not money in; kept quietly
        const row = await store('REJECTED', reason);
        return { status: 'REJECTED', alertId: row?.id ?? null, reason };
      }
      if (reason && reason !== 'NO_AMOUNT') {
        const row = await store('REJECTED', reason);
        return { status: 'REJECTED', alertId: row?.id ?? null, reason };
      }
      if (reason === 'NO_AMOUNT' || amountPaise === null || !utr) {
        const why = reason ?? 'NO_UTR';
        const row = await store('UNMATCHED', why);
        return { status: 'UNMATCHED', alertId: row?.id ?? null, reason: why };
      }

      await repo.lockUtr(client, utr);
      if (await repo.utrSeen(client, utr)) {
        const row = await store('DUPLICATE', 'UTR_ALREADY_SEEN');
        return { status: 'DUPLICATE', alertId: row?.id ?? null, reason: 'UTR_ALREADY_SEEN' };
      }

      const order = await orderStore.lockOpenForCredit(client, amountPaise, a.creditedAt);
      if (!order) {
        const row = await store('UNMATCHED', 'NO_OPEN_ORDER_FOR_AMOUNT');
        return { status: 'UNMATCHED', alertId: row?.id ?? null, reason: 'NO_OPEN_ORDER_FOR_AMOUNT' };
      }
      const row = await store('MATCHED', null, order.id);
      if (!row) return { status: 'DUPLICATE', alertId: null, reason: 'REDELIVERY' }; // lost an insert race
      const payment = await orderStore.capture(client, order, { receivedPaise: amountPaise, utr, alertId: row.id });
      return { status: 'MATCHED', alertId: row.id, orderId: order.id, paymentId: payment.id };
    });

    // Never log the alert text, UTR or sender (PII) — ids and outcome only
    if (outcome.status === 'UNMATCHED')
      logger.warn({ alertId: outcome.alertId, reason: outcome.reason }, 'credit alert needs admin review');
    else logger.info({ alertId: outcome.alertId, status: outcome.status }, 'credit alert processed');
    return outcome;
  }

  return {
    ingest,

    /**
     * Admin (CLI): book an UNMATCHED alert against an order (customer paid a wrong amount, paid
     * after the hold, …). The order may be open or expired (late payment) but not already paid.
     */
    async link(alertId: number, orderId: string, by: string) {
      return db.transaction(async (client) => {
        const alert = await repo.findAlert(client, alertId, true);
        if (!alert) throw new AppError('NOT_FOUND', 'Alert not found');
        if (alert.status !== 'UNMATCHED') throw new AppError('CONFLICT', `Alert is ${alert.status}, not UNMATCHED`);
        if (!alert.utr || !alert.amount_paise) {
          throw new AppError(
            'BAD_REQUEST_ERROR',
            'Alert has no UTR/amount — add it with alerts:add from the bank statement',
          );
        }
        await repo.lockUtr(client, alert.utr);
        if (await orderStore.paymentByUtr(client, alert.utr))
          throw new AppError('CONFLICT', 'This UTR is already booked');
        const order = await orderStore.find(client, orderId, true);
        if (!order) throw new AppError('NOT_FOUND', 'Order not found');
        if (order.status === 'paid') throw new AppError('CONFLICT', 'Order is already paid');
        const payment = await orderStore.capture(client, order, {
          receivedPaise: alert.amount_paise,
          utr: alert.utr,
          alertId: alert.id,
        });
        await repo.resolveAlert(client, alert.id, { status: 'LINKED', orderId: order.id, reason: null, by });
        await orderStore.audit(client, {
          actor: by,
          action: 'ALERT_LINKED',
          entityId: String(alert.id),
          details: {
            orderId: order.id,
            receipt: order.receipt,
            paymentId: payment.id,
            amountPaise: payment.amount_paise,
          },
        });
        return { order, payment };
      });
    },

    async dismiss(alertId: number, why: string, by: string) {
      await db.transaction(async (client) => {
        const alert = await repo.findAlert(client, alertId, true);
        if (!alert) throw new AppError('NOT_FOUND', 'Alert not found');
        if (alert.status !== 'UNMATCHED') throw new AppError('CONFLICT', `Alert is ${alert.status}, not UNMATCHED`);
        await repo.resolveAlert(client, alert.id, { status: 'DISMISSED', orderId: null, reason: why, by });
        await orderStore.audit(client, {
          actor: by,
          action: 'ALERT_DISMISSED',
          entityId: String(alert.id),
          details: { why },
        });
      });
    },

    listForReview: (limit = 50) => repo.listForReview(db, limit),
  };
}

export type AlertsService = ReturnType<typeof createAlertsService>;
