/**
 * Money is always integer paise (D-26). These helpers never do float arithmetic on amounts;
 * division is only used for display formatting.
 */
export type Paise = number;

export function assertPaise(value: number): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Money must be an integer number of paise, got ${value}`);
  }
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 39900 → "₹399.00"; with `{ trimZeroPaise: true }` → "₹399". */
export function formatINR(paise: Paise, opts: { trimZeroPaise?: boolean } = {}): string {
  assertPaise(paise);
  const rupees = paise / 100;
  if (opts.trimZeroPaise && paise % 100 === 0) return inrWholeFormatter.format(rupees);
  return inrFormatter.format(rupees);
}

export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) {
    assertPaise(v);
    total += v;
  }
  assertPaise(total);
  return total;
}

/** unit × quantity, both integers. */
export function multiplyPaise(unitPaise: Paise, quantity: number): Paise {
  assertPaise(unitPaise);
  if (!Number.isSafeInteger(quantity)) throw new TypeError(`Quantity must be an integer, got ${quantity}`);
  const total = unitPaise * quantity;
  assertPaise(total);
  return total;
}

/**
 * Basis-point share with floor rounding (e.g. partner split, D-41): 13358 paise × 5000 bp → 6679.
 * Integer-only: floor(amount × bp / 10000).
 */
export function applyBasisPoints(amountPaise: Paise, basisPoints: number): Paise {
  assertPaise(amountPaise);
  if (!Number.isSafeInteger(basisPoints)) throw new TypeError(`Basis points must be an integer, got ${basisPoints}`);
  return Math.floor((amountPaise * basisPoints) / 10_000);
}
