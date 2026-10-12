import { describe, expect, it } from 'vitest';
import {
  ACTOR_TYPES,
  ORDER_STATUSES,
  canPaymentTransition,
  canTransition,
  cancellableBy,
  financialYearOf,
  formatInvoiceNumber,
  generateOrderCode,
  gstIncludedPaise,
  istDateOf,
  normalizeOrderCode,
  ORDER_CODE_REGEX,
  PAYMENT_STATUSES,
} from '../src/order';

describe('order transitions (architecture/07 §1.2)', () => {
  it('allowed/denied table for every (from, to, actor) — snapshot', () => {
    const allowed: string[] = [];
    for (const from of ORDER_STATUSES)
      for (const to of ORDER_STATUSES)
        for (const actor of ACTOR_TYPES)
          if (canTransition(from, to, actor)) allowed.push(`${from} -> ${to} by ${actor}`);
    expect(allowed).toMatchSnapshot();
    // 14 × 14 × 6 combinations checked; everything not listed is denied
    expect(ORDER_STATUSES.length * ORDER_STATUSES.length * ACTOR_TYPES.length).toBe(1176);
  });

  it('key rules', () => {
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED', 'RAZORPAY')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED', 'ADMIN')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'EXPIRED', 'CUSTOMER')).toBe(false);
    expect(canTransition('PACKED', 'CANCELLED', 'CUSTOMER')).toBe(false);
    expect(canTransition('DELIVERED', 'IN_TRANSIT', 'SHIPROCKET')).toBe(false);
    expect(cancellableBy('CUSTOMER').sort()).toEqual(['AWAITING_PACKING', 'CONFIRMED']);
    expect(cancellableBy('ADMIN').sort()).toEqual(['AWAITING_PACKING', 'CONFIRMED', 'PACKED', 'PICKUP_SCHEDULED']);
  });

  it('payment status map (07 §2)', () => {
    const allowed = PAYMENT_STATUSES.flatMap((f) =>
      PAYMENT_STATUSES.filter((t) => canPaymentTransition(f, t)).map((t) => `${f}->${t}`),
    );
    expect(allowed).toEqual([
      'UNPAID->PAID',
      'PAID->REFUND_PENDING',
      'REFUND_PENDING->PAID',
      'REFUND_PENDING->PARTIALLY_REFUNDED',
      'REFUND_PENDING->REFUNDED',
      'PARTIALLY_REFUNDED->REFUND_PENDING', // a further admin partial refund (D-56)
    ]);
  });
});

describe('order code (D-27)', () => {
  it('generates PK- + 6 Crockford chars', () => {
    for (let i = 0; i < 500; i++) expect(generateOrderCode()).toMatch(ORDER_CODE_REGEX);
    expect(generateOrderCode(() => new Uint8Array([0, 31, 32, 255, 18, 19]))).toBe('PK-0Z0ZJK');
  });
  it('normalises typed codes', () => {
    expect(normalizeOrderCode(' pk-7kq2mo ')).toBe('PK-7KQ2M0');
    expect(normalizeOrderCode('7kq2mi')).toBe('PK-7KQ2M1');
  });
});

describe('GST + invoice numbering (D-26, D-32)', () => {
  it('extracts inclusive GST in integer paise, half up', () => {
    expect(gstIncludedPaise(44_900, 500)).toBe(2138); // 44900 × 5/105 = 2138.09
    expect(gstIncludedPaise(105, 500)).toBe(5);
    expect(gstIncludedPaise(21, 500)).toBe(1); // 1.0 → 1
    expect(gstIncludedPaise(31_500, 1200)).toBe(3375);
    expect(gstIncludedPaise(10_000, 0)).toBe(0);
    expect(() => gstIncludedPaise(1.5, 500)).toThrow();
  });
  it('financial year April–March in IST', () => {
    expect(financialYearOf('2026-04-01')).toBe('2026-27');
    expect(financialYearOf('2027-03-31')).toBe('2026-27');
    expect(financialYearOf('2099-12-31')).toBe('2099-00');
    // 31 Mar 2027 20:00 UTC is already 1 Apr in IST
    expect(financialYearOf(istDateOf(new Date('2027-03-31T20:00:00Z')))).toBe('2027-28');
    expect(formatInvoiceNumber('2026-27', 123)).toBe('PK/2026-27/000123');
  });
});
