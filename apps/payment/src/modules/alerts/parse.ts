import { rupeesToPaise } from '../../lib/money';

export interface ParsedCredit {
  amountPaise: number;
  /** 12-digit UPI reference (RRN/UTR). Null = cannot be matched automatically. */
  utr: string | null;
}

export type ParseResult = { ok: true; credit: ParsedCredit } | { ok: false; reason: 'NOT_A_CREDIT' | 'NO_AMOUNT' };

const CREDIT = /\b(credited|received|deposited)\b/i;
// Our own refunds / payouts produce debit alerts — never treat those as money in
const DEBIT = /\b(debited|debit|withdrawn|sent|paid to|transferred to)\b/i;
const AMOUNT = /(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const LABELLED_UTR =
  /(?:upi\s*(?:ref(?:erence)?\.?\s*(?:no\.?|number|id)?|txn\s*(?:id|no\.?)|:)|ref(?:erence)?\.?\s*(?:no\.?|number)|rrn|utr)\s*[:\-#]?\s*(\d{12})\b/i;
const BARE_12 = /(?<![\d-])(\d{12})(?![\d])/g;

/**
 * Bank credit alert text → amount + UTR. Deliberately strict: an alert we cannot read with
 * certainty goes to admin review, never to a guessed order. Covers the common Indian bank
 * formats ("Rs.500.00 credited to a/c XX1234 … UPI Ref No 123456789012", "Money Received - INR
 * 500.00 … UPI Ref:123456789012", "credited by Rs500 … (Ref no 123456789012)"); add a fixture test
 * with your bank's real alert before going live.
 */
export function parseCreditAlert(text: string): ParseResult {
  const t = text.replace(/\s+/g, ' ');
  if (!CREDIT.test(t) || DEBIT.test(t)) return { ok: false, reason: 'NOT_A_CREDIT' };

  // The first amount is the credited one; "Avl Bal" / "balance" amounts come later
  let amountPaise: number | null = null;
  for (const m of t.matchAll(AMOUNT)) {
    const before = t.slice(Math.max(0, m.index - 20), m.index).toLowerCase();
    if (/bal(ance)?\.?\s*:?\s*$|avl/.test(before)) continue;
    amountPaise = rupeesToPaise(m[1]!);
    if (amountPaise) break;
  }
  if (!amountPaise) return { ok: false, reason: 'NO_AMOUNT' };

  const labelled = LABELLED_UTR.exec(t)?.[1] ?? null;
  // Unlabelled fallback only when exactly one 12-digit number exists (account numbers are masked)
  const bare = [...new Set([...t.matchAll(BARE_12)].map((m) => m[1]!))];
  const utr = labelled ?? (bare.length === 1 ? bare[0]! : null);
  return { ok: true, credit: { amountPaise, utr } };
}
