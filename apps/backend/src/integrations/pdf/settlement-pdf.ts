import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Partner settlement statement PDF (Phase 9 §9.9, D-40/D-41) — pure rendering of numbers the
 * settlement service already computed. Amounts print as "Rs. 1,234.50" (no ₹ glyph in the
 * standard fonts); print greys, not UI tokens.
 */
export interface StatementDocument {
  periodStart: string;
  periodEnd: string;
  status: string;
  partnerSplitBp: number;
  totals: Record<
    | 'revenueExGstPaise'
    | 'rawCostPaise'
    | 'packagingCostPaise'
    | 'freightPaise'
    | 'gatewayFeePaise'
    | 'refundsPaise'
    | 'rtoFreightPaise'
    | 'sharedExpensesPaise'
    | 'netProfitPaise'
    | 'partnerSharePaise'
    | 'adminSharePaise'
    | 'expenseReimbursementPaise'
    | 'partnerPayoutPaise',
    number
  > & { ordersCount: number; jarsCount: number };
  items: { orderCode: string; status: string; jars: number; revenueExGstPaise: number; netPaise: number }[];
  expenses: { incurredOn: string; category: string; description: string; amountPaise: number }[];
  generatedAt: Date;
}

export const rs = (paise: number) => {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toLocaleString('en-IN');
  return `${sign}Rs. ${rupees}.${String(abs % 100).padStart(2, '0')}`;
};

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.4, 0.4, 0.4);

export async function renderSettlementStatement(doc: StatementDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([595.28, 841.89]);
  let y = 800;
  const left = 48;
  const right = 547;

  const text = (s: string, x: number, size = 10, font: PDFFont = regular, color = INK) =>
    page.drawText(s.replace(/[^\x20-\x7E]/g, '?'), { x, y, size, font, color });
  const rightText = (s: string, size = 10, font: PDFFont = regular) =>
    text(s, right - font.widthOfTextAtSize(s, size), size, font);
  const line = (gap = 16) => {
    y -= gap;
    if (y < 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
    }
  };

  text('Pahadi Khatki — Partner Settlement Statement'.replace('—', '-'), left, 15, bold);
  line(20);
  text(
    `Period ${doc.periodStart} to ${doc.periodEnd}  ·  Status ${doc.status}`.replace('·', '|'),
    left,
    10,
    regular,
    MUTED,
  );
  line(14);
  text(
    `${doc.totals.ordersCount} orders, ${doc.totals.jarsCount} jars  |  Partner split ${doc.partnerSplitBp / 100}%`,
    left,
    10,
    regular,
    MUTED,
  );
  line(28);

  const rows: [string, number, boolean?][] = [
    ['Revenue (ex-GST, after refunds)', doc.totals.revenueExGstPaise],
    ['(-) Raw cost (reimbursed to partner)', -doc.totals.rawCostPaise],
    ['(-) Packaging', -doc.totals.packagingCostPaise],
    ['(-) Freight', -doc.totals.freightPaise],
    ['(-) Payment gateway fee incl. GST', -doc.totals.gatewayFeePaise],
    ['(-) RTO freight', -doc.totals.rtoFreightPaise],
    ['(-) Shared expenses', -doc.totals.sharedExpensesPaise],
    ['= Net profit pool', doc.totals.netProfitPaise, true],
    [`Partner share (${doc.partnerSplitBp / 100}%, rounded down)`, doc.totals.partnerSharePaise],
    ['Admin share (remainder)', doc.totals.adminSharePaise],
    ['Expense reimbursement (partner paid)', doc.totals.expenseReimbursementPaise],
    ['PARTNER PAYOUT (raw cost + share + reimbursement)', doc.totals.partnerPayoutPaise, true],
  ];
  for (const [label, value, strong] of rows) {
    text(label, left, 10, strong ? bold : regular);
    rightText(rs(value), 10, strong ? bold : regular);
    line(strong ? 20 : 15);
  }
  text(`Refunds included above: ${rs(doc.totals.refundsPaise)}`, left, 9, regular, MUTED);
  line(28);

  text('Orders', left, 12, bold);
  line(16);
  for (const it of doc.items) {
    text(`${it.orderCode}  ${it.status}  ${it.jars} jar(s)`, left, 9);
    text(rs(it.revenueExGstPaise), 360, 9);
    rightText(rs(it.netPaise), 9);
    line(13);
  }
  if (doc.expenses.length) {
    line(14);
    text('Shared expenses', left, 12, bold);
    line(16);
    for (const e of doc.expenses) {
      text(`${e.incurredOn}  ${e.category}  ${e.description.slice(0, 60)}`, left, 9);
      rightText(rs(e.amountPaise), 9);
      line(13);
    }
  }
  line(20);
  text(
    `Generated ${doc.generatedAt.toISOString()} — read-only statement (D-40).`.replace('—', '-'),
    left,
    8,
    regular,
    MUTED,
  );
  return pdf.save();
}
