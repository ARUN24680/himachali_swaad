/**
 * A real, valid single-page 4×6 inch PDF (288 × 432 pt) shaped like a courier label, built by hand
 * with a correct xref table — stands in for the signed Shiprocket label in the label-open timing.
 */
export function courierLabelPdf(orderCode: string, awb = '1490811234567'): Buffer {
  const text = [
    'BT /F1 22 Tf 18 390 Td (Delhivery Surface) Tj ET',
    `BT /F1 14 Tf 18 360 Td (AWB ${awb}) Tj ET`,
    '18 250 252 90 re S',
    `BT /F1 12 Tf 26 320 Td (Order ${orderCode}) Tj ET`,
    'BT /F1 11 Tf 26 300 Td (Ship to: Arun, Chennai, Tamil Nadu 600001) Tj ET',
    'BT /F1 11 Tf 26 284 Td (From: Pahadi Khatki, Kullu, HP 175101) Tj ET',
    'BT /F1 10 Tf 26 262 Td (Non-veg. Prepaid. 1 x Himachali Chicken Pickle 250 g) Tj ET',
    ...Array.from({ length: 40 }, (_, i) => `${18 + i * 6} 120 ${i % 3 === 0 ? 4 : 2} 100 re f`),
    `BT /F1 12 Tf 18 96 Td (${awb}) Tj ET`,
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 432] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) body += `${String(o).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
