import { PDFDocument } from 'pdf-lib';

/**
 * A4 "4-up" label sheet (Phase 7 §7.6): each 4×6 in label goes into a quarter of an A4 page,
 * scaled to fit, for printing at a cyber café when there's no thermal printer (D-37).
 */
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 12;

export async function renderA4LabelSheet(labels: readonly Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const cellW = (A4.w - MARGIN * 3) / 2;
  const cellH = (A4.h - MARGIN * 3) / 2;
  let page = out.addPage([A4.w, A4.h]);
  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && i % 4 === 0) page = out.addPage([A4.w, A4.h]);
    const src = await PDFDocument.load(labels[i]!);
    const [embedded] = await out.embedPdf(src, [0]);
    const scale = Math.min(cellW / embedded!.width, cellH / embedded!.height);
    const w = embedded!.width * scale;
    const h = embedded!.height * scale;
    const col = i % 2;
    const row = Math.floor((i % 4) / 2); // row 0 = top
    const x = MARGIN + col * (cellW + MARGIN) + (cellW - w) / 2;
    const y = A4.h - MARGIN - (row + 1) * cellH - row * MARGIN + (cellH - h) / 2;
    page.drawPage(embedded!, { x, y, width: w, height: h });
  }
  return out.save();
}
