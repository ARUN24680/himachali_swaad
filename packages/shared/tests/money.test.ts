import { describe, expect, it } from 'vitest';
import { applyBasisPoints, formatINR, multiplyPaise, sumPaise } from '../src/money';

describe('formatINR', () => {
  it('formats paise as rupees with Indian digit grouping', () => {
    expect(formatINR(39900)).toBe('₹399.00');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(0)).toBe('₹0.00');
  });

  it('can drop zero paise', () => {
    expect(formatINR(39900, { trimZeroPaise: true })).toBe('₹399');
    expect(formatINR(39950, { trimZeroPaise: true })).toBe('₹399.50');
  });

  it('rejects non-integer paise', () => {
    expect(() => formatINR(399.5)).toThrow(TypeError);
  });
});

describe('integer money arithmetic', () => {
  it('sums and multiplies without floats', () => {
    expect(sumPaise([39900, 8500, 942])).toBe(49342);
    expect(multiplyPaise(39900, 3)).toBe(119700);
    expect(() => sumPaise([100, 0.1])).toThrow(TypeError);
    expect(() => multiplyPaise(100, 1.5)).toThrow(TypeError);
  });

  it('floors basis-point shares so no paisa is invented (D-41 worked example)', () => {
    const pool = 13358; // ₹133.58 net profit pool
    const partner = applyBasisPoints(pool, 5000);
    expect(partner).toBe(6679);
    expect(pool - partner).toBe(6679);
    expect(applyBasisPoints(13359, 5000)).toBe(6679); // remainder goes to admin share
  });
});
