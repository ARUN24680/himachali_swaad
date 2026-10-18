/**
 * Direct UPI admin CLI — run where the service runs (ECS exec / local):
 *   pnpm --filter @pk/payment admin <command> [...args] --by "<your name>"
 *
 * Every write is audited in upi_admin_audit with --by. Access to this CLI = access to the
 * service's secrets (DB + KEK), so it is limited to the people who can exec into the task.
 */
import { parseArgs } from 'node:util';
import { loadEnvOrExit } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { AppError } from '../src/lib/errors';
import { paiseToRupees, rupeesToPaise } from '../src/lib/money';
import { createServices } from '../src/services';

const HELP = `Commands:
  alerts:list                                   unmatched / rejected alerts waiting for review
  alerts:add --amount 499.37 --utr 123456789012 [--at 2026-10-17T10:00:00Z]
                                                enter a credit from the bank statement (auto-matches)
  alerts:link <alertId> <orderId>               book an unmatched alert against an order
  alerts:dismiss <alertId> <reason>             not ours / handled outside the store
  orders:find <PK-XXXXXX>                       UPI orders for a store order code
  refunds:list                                  refunds the store asked for — pay these back
  refunds:complete <refundId> <refundUtr>       you sent the money back (UTR of your transfer)
  refunds:fail <refundId> <reason>              cannot refund via UPI (store marks it failed)
  devices:enroll <label>                        new Android observer — prints its secret ONCE
  devices:list | devices:revoke <deviceId>
Writes need --by "<your name>".`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    by: { type: 'string' },
    amount: { type: 'string' },
    utr: { type: 'string' },
    at: { type: 'string' },
  },
});
const [command, ...args] = positionals;

const env = loadEnvOrExit();
const logger = createLogger({ level: 'warn' });
const svc = createServices(env, logger);

const rupees = (p: number | null) => (p === null ? '—' : `₹${paiseToRupees(p)}`);
const by = () => {
  if (!values.by || values.by.trim().length < 2) throw new Error('--by "<your name>" is required for this command');
  return values.by.trim();
};
const arg = (i: number, name: string) => {
  const v = args[i];
  if (!v) throw new Error(`missing <${name}>`);
  return v;
};

async function main() {
  switch (command) {
    case 'alerts:list': {
      const rows = await svc.alerts.listForReview(100);
      console.table(
        rows.map((a) => ({
          id: a.id,
          status: a.status,
          reason: a.reason,
          amount: rupees(a.amount_paise),
          utr: a.utr ?? '—',
          source: a.source,
          at: a.credited_at.toISOString(),
        })),
      );
      return;
    }
    case 'alerts:add': {
      const amountPaise = rupeesToPaise(values.amount ?? '');
      if (!amountPaise || !values.utr || !/^\d{12}$/.test(values.utr))
        throw new Error('--amount and a 12-digit --utr are required');
      const at = values.at ? new Date(values.at) : new Date();
      if (Number.isNaN(at.getTime())) throw new Error('--at must be an ISO time');
      const actor = by();
      const outcome = await svc.alerts.ingest({
        source: 'ADMIN',
        externalId: `admin:${values.utr}`,
        sender: `admin:${actor}`,
        creditedAt: at,
        amountPaise,
        utr: values.utr,
      });
      console.log(outcome);
      return;
    }
    case 'alerts:link': {
      const { order, payment } = await svc.alerts.link(Number(arg(0, 'alertId')), arg(1, 'orderId'), by());
      console.log(
        `Linked to ${order.receipt}: store sees ${rupees(payment.amount_paise)} (received ${rupees(payment.received_paise)})`,
      );
      return;
    }
    case 'alerts:dismiss':
      await svc.alerts.dismiss(Number(arg(0, 'alertId')), args.slice(1).join(' ') || arg(1, 'reason'), by());
      console.log('Dismissed');
      return;
    case 'orders:find': {
      const rows = await svc.gateway.findByReceipt(arg(0, 'orderCode').toUpperCase());
      console.table(
        rows.map((o) => ({
          orderId: o.id,
          status: o.status,
          payable: rupees(o.payable_paise),
          total: rupees(o.amount_paise),
          expiresAt: o.expires_at.toISOString(),
        })),
      );
      return;
    }
    case 'refunds:list': {
      const rows = await svc.gateway.listPendingRefunds();
      console.table(
        rows.map((r) => ({
          refundId: r.id,
          order: r.receipt,
          amount: rupees(r.amount_paise),
          paymentUtr: r.utr,
          asked: r.created_at.toISOString(),
        })),
      );
      if (rows.length)
        console.log('Pay each back to the UPI id that paid (see the bank statement entry for the payment UTR).');
      return;
    }
    case 'refunds:complete': {
      const utr = arg(1, 'refundUtr');
      if (!/^\d{12}$/.test(utr)) throw new Error('refund UTR must be the 12-digit reference of your transfer');
      await svc.gateway.settleRefund(arg(0, 'refundId'), { status: 'processed', utr }, by());
      console.log('Refund marked processed — the store is notified');
      return;
    }
    case 'refunds:fail':
      await svc.gateway.settleRefund(
        arg(0, 'refundId'),
        { status: 'failed', reason: args.slice(1).join(' ') || arg(1, 'reason') },
        by(),
      );
      console.log('Refund marked failed — the store raises an ops issue');
      return;
    case 'devices:enroll': {
      if (!svc.observer) throw new Error('UPI_DEVICE_KEK is not set — the Android channel is off');
      const { deviceId, secret } = await svc.observer.enroll(arg(0, 'label'), by());
      console.log(
        `Device id: ${deviceId}\nSecret (shown once, enter it in the app, do not store it elsewhere):\n${secret}`,
      );
      return;
    }
    case 'devices:list':
      if (!svc.observer) throw new Error('UPI_DEVICE_KEK is not set — the Android channel is off');
      console.table(await svc.observer.list());
      return;
    case 'devices:revoke': {
      if (!svc.observer) throw new Error('UPI_DEVICE_KEK is not set — the Android channel is off');
      const done = await svc.observer.revoke(arg(0, 'deviceId'), by());
      console.log(done ? 'Revoked' : 'No active device with that id');
      return;
    }
    default:
      console.log(HELP);
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof AppError || err instanceof Error ? `Error: ${err.message}` : err);
  process.exitCode = 1;
} finally {
  await svc.db.close();
}
