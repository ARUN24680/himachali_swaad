import { financialYearOf, formatInvoiceNumber, gstIncludedPaise, istDateOf } from '@pk/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../config/db';
import { renderInvoicePdf, type InvoiceLine } from '../../integrations/pdf/invoice-pdf';
import type { PrivateStorage } from '../../integrations/storage/private';
import type { SettingsService } from '../settings/settings.service';
import * as repo from './orders.repository';

/** settings.seller_details (Q-02) — who issues the invoice. */
export const SellerDetailsSchema = z.object({
  legalName: z.string().min(2),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN'),
  addressLine: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
});
const SellerSetting = SellerDetailsSchema.nullable();

export const invoiceKeyFor = (orderCode: string) => `invoices/${orderCode}.pdf`;

/** Orders that may get a tax invoice: money kept for goods (confirmed at some point and paid). */
const INVOICEABLE_PAYMENT = new Set(['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED']);

/**
 * GENERATE_INVOICE job (D-32, Phase 5 §5.10). Number first, in its own short transaction
 * (invoice_sequences row lock → gap-free + unique), then PDF render + private upload outside any
 * transaction (D-30), then the key is saved. A retry reuses the already-assigned number.
 */
export function createInvoiceService(deps: {
  db: Db;
  settings: SettingsService;
  privateStorage: PrivateStorage;
  /** Non-production may print a DRAFT invoice while Q-02 seller details are unset. */
  allowDraft: boolean;
  logger: Logger;
}) {
  const { db, settings, privateStorage, allowDraft, logger } = deps;

  return {
    async generate(orderId: string): Promise<{ invoiceNumber: string; key: string } | null> {
      const seller = await settings.getSetting(db, 'seller_details', SellerSetting);
      if (!seller && !allowDraft) {
        throw new Error('seller_details setting is not configured (Q-02) — cannot issue a tax invoice');
      }

      const numbered = await db.transaction(async (client) => {
        const order = await repo.findOrderById(client, orderId, 'update');
        if (!order) return null;
        if (!order.confirmed_at || !INVOICEABLE_PAYMENT.has(order.payment_status)) return null;
        if (order.invoice_number) return order;
        const fy = financialYearOf(istDateOf(order.confirmed_at));
        const invoiceNumber = formatInvoiceNumber(fy, await repo.nextInvoiceSeq(client, fy));
        await repo.setInvoiceNumber(client, order.id, invoiceNumber);
        return { ...order, invoice_number: invoiceNumber };
      });
      if (!numbered) return null;
      if (numbered.invoice_key) return { invoiceNumber: numbered.invoice_number!, key: numbered.invoice_key };

      const [items, location] = await Promise.all([
        repo.listOrderItems(db, numbered.id),
        repo.findPickupLocationForInvoice(db, numbered.pickup_location_id),
      ]);
      const a = numbered.shipping_address;
      const sellerState = seller?.state ?? location?.state ?? '';
      const lines: InvoiceLine[] = items.map((i) => {
        const tax = gstIncludedPaise(i.total_price_paise, i.gst_rate_bp);
        return {
          description: `${i.title} (${i.net_weight_g} g)`,
          hsn: i.hsn_code,
          quantity: i.quantity,
          unitPricePaise: i.unit_price_paise,
          totalPaise: i.total_price_paise,
          gstRateBp: i.gst_rate_bp,
          taxablePaise: i.total_price_paise - tax,
          taxPaise: tax,
        };
      });
      const pdf = await renderInvoicePdf({
        invoiceNumber: numbered.invoice_number!,
        invoiceDate: istDateOf(numbered.confirmed_at!),
        orderCode: numbered.order_code,
        seller: {
          name: seller?.legalName ?? 'Pahadi Khatki',
          lines: seller
            ? [seller.addressLine, `${seller.city}, ${seller.state} ${seller.pincode}`]
            : ['Address pending (Q-02)'],
          gstin: seller?.gstin ?? null,
          fssai: location?.fssai_license_no ?? null,
        },
        buyer: {
          name: a.fullName,
          lines: [a.line1, ...(a.line2 ? [a.line2] : []), `${a.city}, ${a.state} ${a.pincode}`, a.phone],
        },
        placeOfSupply: a.state,
        intraState: sellerState.trim().toLowerCase() === a.state.trim().toLowerCase(),
        lines,
        shippingPaise: numbered.shipping_fee_paise,
        totalPaise: numbered.total_paise,
        draftWatermark: seller ? null : 'DRAFT - NOT A TAX INVOICE',
      });

      const key = invoiceKeyFor(numbered.order_code);
      await privateStorage.put(key, pdf, 'application/pdf');
      await repo.setInvoiceKey(db, numbered.id, key);
      logger.info({ orderCode: numbered.order_code, invoiceNumber: numbered.invoice_number }, 'invoice generated');
      return { invoiceNumber: numbered.invoice_number!, key };
    },
  };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;
