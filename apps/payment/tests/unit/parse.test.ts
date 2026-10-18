import { describe, expect, it } from 'vitest';
import { parseCreditAlert } from '../../src/modules/alerts/parse';
import { paiseToRupees, rupeesToPaise } from '../../src/lib/money';

describe('parseCreditAlert', () => {
  it.each([
    [
      'HDFC "Money Received"',
      'Money Received - INR 499.37 in your HDFC Bank A/c xx1234 on 17-10-26 from abc@ybl UPI Ref:629012345678 Avl bal: INR 12,000.00',
      49_937,
      '629012345678',
    ],
    [
      'ICICI credited with',
      'Dear Customer, Acct XX123 is credited with Rs 1,250.50 on 17-Oct-26 from RAHUL K. UPI:629012345679-ICICI Bank.',
      125_050,
      '629012345679',
    ],
    [
      'SBI credited by',
      'Dear SBI UPI User, ur A/cX1234 credited by Rs500 on 17Oct26 by (Ref no 629012345670)',
      50_000,
      '629012345670',
    ],
    [
      'Axis rupee sign',
      '₹ 2,199.01 credited to A/c no. XX9876 on 17-10-2026 by UPI ref no 629012345671. Not you? Call 1860...',
      219_901,
      '629012345671',
    ],
  ])('%s', (_name, text, amountPaise, utr) => {
    expect(parseCreditAlert(text)).toEqual({ ok: true, credit: { amountPaise, utr } });
  });

  it('never treats a debit (our own refund) as money in', () => {
    const text = 'Rs.499.37 debited from A/c XX1234 and credited to abc@ybl UPI Ref 629012345672';
    expect(parseCreditAlert(text)).toEqual({ ok: false, reason: 'NOT_A_CREDIT' });
  });

  it('skips the balance amount and reads the credited one', () => {
    const r = parseCreditAlert('Avl Bal Rs 9,999.00. Rs 120.00 credited to your a/c. UPI Ref 629012345673');
    expect(r).toEqual({ ok: true, credit: { amountPaise: 12_000, utr: '629012345673' } });
  });

  it('no UTR when two unlabelled 12-digit numbers exist (ambiguous)', () => {
    const r = parseCreditAlert('Rs 100 credited. 629012345674 629012345675');
    expect(r).toEqual({ ok: true, credit: { amountPaise: 10_000, utr: null } });
  });

  it('OTP / promo text is not a credit', () => {
    expect(parseCreditAlert('Your OTP is 123456. Do not share.').ok).toBe(false);
  });

  it('a credit without an amount is reported as such', () => {
    expect(parseCreditAlert('Amount credited to your account, UPI Ref 629012345676')).toEqual({
      ok: false,
      reason: 'NO_AMOUNT',
    });
  });
});

describe('money', () => {
  it('rupees ↔ paise without floats', () => {
    expect(rupeesToPaise('1,234.5')).toBe(123_450);
    expect(rupeesToPaise('0.07')).toBe(7);
    expect(rupeesToPaise('12,34,567.89')).toBe(123_456_789);
    expect(rupeesToPaise('1.234')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
    expect(paiseToRupees(49_937)).toBe('499.37');
    expect(paiseToRupees(100)).toBe('1.00');
  });
});
