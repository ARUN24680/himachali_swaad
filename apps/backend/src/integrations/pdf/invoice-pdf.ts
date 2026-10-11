import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * GST tax invoice PDF (D-32, Phase 5 §5.10). Pure rendering — the invoice service decides the
 * numbers. Standard PDF fonts have no ₹ glyph, so amounts print as "Rs. 1,234.50".
 * Format to be reviewed by the CA (Phase 0); colours are print greys, not UI tokens.
 */
export interface InvoiceParty {
  name: string;
  lines: string[];
}

export interface InvoiceLine {
  description: string;
  hsn: string;
  quantity: number;
  unitPricePaise: number;
  /** GST-inclusive line total. */
  totalPaise: number;
  gstRateBp: number;
  taxablePaise: number;
  taxPaise: number;
}

export interface InvoiceDocument {
  invoiceNumber: string;
  invoiceDate: string;
  orderCode: string;
  seller: InvoiceParty & { gstin: string | null; fssai: string | null };
  buyer: InvoiceParty;
  placeOfSupply: string;
  /** true → CGST + SGST halves; false → IGST. */
  intraState: boolean;
  lines: InvoiceLine[];
  shippingPaise: number;
  totalPaise: number;
  /** Printed across the page when the seller details are placeholders (non-production only). */
  draftWatermark: string | null;
}

const rupees = (paise: number) =>
  `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
const INK = rgb(0.13, 0.11, 0.1);
const MUTED = rgb(0.37, 0.34, 0.31);
const RULE = rgb(0.8, 0.78, 0.74);

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Tax Invoice ${doc.invoiceNumber}`);
  pdf.setAuthor(doc.seller.name);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const left = 40;
  const right = width - 40;
  let y = 800;

  const text = (t: string, x: number, size = 9, font: PDFFont = regular, color = INK) =>
    page.drawText(t, { x, y, size, font, color });
  const textRight = (t: string, x: number, size = 9, font: PDFFont = regular) =>
    page.drawText(t, { x: x - font.widthOfTextAtSize(t, size), y, size, font, color: INK });
  const rule = (p: PDFPage = page) =>
    p.drawLine({ start: { x: left, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.6, color: RULE });

  if (doc.draftWatermark) {
    page.drawText(doc.draftWatermark, {
      x: 70,
      y: 380,
      size: 22,
      font: bold,
      color: rgb(0.85, 0.3, 0.25),
      opacity: 0.35,
      rotate: degrees(30),
    });
  }

  text('TAX INVOICE', left, 16, bold);
  textRight(doc.invoiceNumber, right, 11, bold);
  y -= 16;
  text('Original for recipient · amounts in Rs.', left, 8, regular, MUTED);
  textRight(`Date: ${doc.invoiceDate}   Order: ${doc.orderCode}`, right, 9);
  y -= 26;

  // Seller | Buyer
  const colX = width / 2 + 10;
  const top = y;
  text('Sold by', left, 8, bold, MUTED);
  y -= 13;
  text(doc.seller.name, left, 10, bold);
  for (const l of doc.seller.lines) {
    y -= 12;
    text(l, left);
  }
  y -= 12;
  text(`GSTIN: ${doc.seller.gstin ?? 'Pending'}`, left);
  y -= 12;
  text(`FSSAI Lic. No.: ${doc.seller.fssai ?? 'Pending'}`, left);
  const sellerBottom = y;

  y = top;
  text('Bill / Ship to', colX, 8, bold, MUTED);
  y -= 13;
  text(doc.buyer.name, colX, 10, bold);
  for (const l of doc.buyer.lines) {
    y -= 12;
    text(l, colX);
  }
  y -= 12;
  text(`Place of supply: ${doc.placeOfSupply}`, colX);
  y = Math.min(y, sellerBottom) - 28;

  // Line table — amounts in rupees without the "Rs." prefix (header says so) so columns stay narrow
  const amt = (paise: number) => rupees(paise).slice(4);
  const col = { item: left, hsn: 226, qty: 282, rate: 345, taxable: 412, gstPct: 447, gst: 497, total: right };
  text('Item', col.item, 8, bold, MUTED);
  text('HSN', col.hsn, 8, bold, MUTED);
  textRight('Qty', col.qty, 8, bold);
  textRight('Unit price', col.rate, 8, bold);
  textRight('Taxable', col.taxable, 8, bold);
  textRight('GST %', col.gstPct, 8, bold);
  textRight('GST', col.gst, 8, bold);
  textRight('Amount', col.total, 8, bold);
  y -= 6;
  rule();
  for (const l of doc.lines) {
    y -= 16;
    text(l.description.slice(0, 40), col.item);
    text(l.hsn, col.hsn);
    textRight(String(l.quantity), col.qty);
    textRight(amt(l.unitPricePaise), col.rate);
    textRight(amt(l.taxablePaise), col.taxable);
    textRight(pct(l.gstRateBp), col.gstPct);
    textRight(amt(l.taxPaise), col.gst);
    textRight(amt(l.totalPaise), col.total);
  }
  if (doc.shippingPaise > 0) {
    y -= 16;
    text('Shipping charges', col.item);
    textRight(amt(doc.shippingPaise), col.total);
  }
  y -= 10;
  rule();

  // Tax summary
  const taxTotal = doc.lines.reduce((s, l) => s + l.taxPaise, 0);
  const taxable = doc.lines.reduce((s, l) => s + l.taxablePaise, 0);
  const summary: [string, string][] = [['Taxable value', rupees(taxable)]];
  if (doc.intraState) {
    const cgst = Math.floor(taxTotal / 2);
    summary.push(['CGST', rupees(cgst)], ['SGST', rupees(taxTotal - cgst)]);
  } else {
    summary.push(['IGST', rupees(taxTotal)]);
  }
  if (doc.shippingPaise > 0) summary.push(['Shipping', rupees(doc.shippingPaise)]);
  for (const [label, value] of summary) {
    y -= 15;
    textRight(label, 470, 9);
    textRight(value, right);
  }
  y -= 20;
  textRight('Total (incl. GST)', 470, 11, bold);
  textRight(rupees(doc.totalPaise), right, 11, bold);
  y -= 30;
  text('Prices are inclusive of GST. Payment received in full (prepaid).', left, 8, regular, MUTED);
  y -= 12;
  text('This is a computer-generated invoice and does not require a signature.', left, 8, regular, MUTED);

  return pdf.save();
}
