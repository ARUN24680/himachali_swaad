import type { Db } from '../../config/db';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import type { AdminActor } from './admin.service';
import * as repo from './exports.repository';

/** RFC 4180 cell: quote when needed; neutralise spreadsheet formula injection (=, +, -, @). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const rupees = (paise: number) => (paise / 100).toFixed(2);

/**
 * CSV exports (Phase 9 §9.10) — admin-only, every download audited (EXPORT, with row count).
 * Money columns are rupees with 2 decimals (spreadsheet friendly); the paise source of truth is the DB.
 */
export function createExportsService(deps: { db: Db }) {
  const { db } = deps;
  const range = (from?: string, to?: string) => ({ from: from ?? '2000-01-01', to: to ?? '2999-12-31' });

  async function build(type: string, p: { from?: string; to?: string; settlementId?: string }) {
    const { from, to } = range(p.from, p.to);
    switch (type) {
      case 'orders': {
        const rows = await repo.ordersExport(db, from, to);
        return {
          rows: rows.length,
          csv: toCsv(
            [
              'order_code',
              'created_at_ist',
              'status',
              'payment_status',
              'customer',
              'city',
              'state',
              'items',
              'subtotal',
              'shipping',
              'tax',
              'total',
              'refunded',
              'courier',
              'awb',
              'invoice_number',
            ],
            rows.map((r) => [
              r.order_code,
              r.created_ist,
              r.status,
              r.payment_status,
              r.customer_name,
              r.city,
              r.state,
              r.items,
              rupees(r.subtotal_paise),
              rupees(r.shipping_fee_paise),
              rupees(r.tax_paise),
              rupees(r.total_paise),
              rupees(r.refunded_paise),
              r.courier_name,
              r.awb_code,
              r.invoice_number,
            ]),
          ),
        };
      }
      case 'gst': {
        const rows = await repo.gstSummary(db, from, to);
        return {
          rows: rows.length,
          csv: toCsv(
            ['month', 'hsn', 'gst_rate_percent', 'orders', 'quantity', 'taxable_value', 'gst', 'invoice_value'],
            rows.map((r) => [
              r.month,
              r.hsn_code,
              (r.gst_rate_bp / 100).toFixed(2),
              r.orders,
              r.quantity,
              rupees(r.gross_paise - r.tax_paise),
              rupees(r.tax_paise),
              rupees(r.gross_paise),
            ]),
          ),
        };
      }
      case 'inventory-ledger': {
        const rows = await repo.ledgerExport(db, from, to);
        return {
          rows: rows.length,
          csv: toCsv(
            ['at_ist', 'batch_code', 'product', 'kitchen', 'movement', 'quantity_delta', 'order_code', 'reason'],
            rows.map((r) => [
              r.at_ist,
              r.batch_code,
              r.title,
              r.kitchen_code,
              r.movement_type,
              r.quantity_delta,
              r.order_code,
              r.reason,
            ]),
          ),
        };
      }
      case 'customers': {
        const rows = await repo.customersExport(db);
        return {
          rows: rows.length,
          csv: toCsv(
            ['phone', 'name', 'email', 'orders', 'lifetime_value', 'last_order_ist', 'rto_count'],
            rows.map((r) => [r.phone, r.name, r.email, r.orders_count, rupees(r.ltv), r.last_order_ist, r.rto_count]),
          ),
        };
      }
      case 'settlement': {
        if (!p.settlementId)
          throw new AppError('VALIDATION_ERROR', 'settlementId is required.', { field: 'settlementId' });
        const rows = await repo.settlementExport(db, p.settlementId);
        if (rows.length === 0) throw new AppError('NOT_FOUND', 'Settlement not found or empty.');
        return {
          rows: rows.length,
          csv: toCsv(
            [
              'order_code',
              'status',
              'closed_at',
              'jars',
              'revenue_ex_gst',
              'raw_cost',
              'packaging',
              'freight',
              'gateway_fee',
              'refunds',
              'rto_freight',
              'net',
            ],
            rows.map((r) => [
              r.order_code,
              r.status,
              r.closed_at,
              r.jars,
              rupees(r.revenue_ex_gst_paise),
              rupees(r.raw_cost_paise),
              rupees(r.packaging_cost_paise),
              rupees(r.freight_paise),
              rupees(r.gateway_fee_paise),
              rupees(r.refunds_paise),
              rupees(r.rto_freight_paise),
              rupees(r.net_paise),
            ]),
          ),
        };
      }
      default:
        throw new AppError('NOT_FOUND', 'Unknown export.');
    }
  }

  return {
    async export(type: string, p: { from?: string; to?: string; settlementId?: string }, by: AdminActor) {
      const { csv, rows } = await build(type, p);
      await audit(db, {
        actorId: by.auth.userId,
        action: 'EXPORT',
        entityType: 'export',
        entityId: type,
        after: {
          from: p.from ?? null,
          to: p.to ?? null,
          settlementId: p.settlementId ?? null,
          rows,
          pii: type === 'customers',
        },
        ip: by.ip,
      });
      const stamp = `${p.from ?? 'all'}_${p.to ?? 'all'}`;
      return { csv, filename: `pahadi-khatki-${type}-${p.settlementId?.slice(0, 8) ?? stamp}.csv` };
    },
  };
}

export type ExportsService = ReturnType<typeof createExportsService>;
