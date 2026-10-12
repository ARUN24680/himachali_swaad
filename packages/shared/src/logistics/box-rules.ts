/**
 * Parcel size + weight (Phase 6 §6.4, D-33, D-34). Single-jar orders ship in the product's own
 * package dimensions (`products.package_*_cm`); multi-jar orders use the box table below. Rows 2
 * and 3–4 are PROVISIONAL until Phase 0 procurement fixes the real boxes (D-53) — change them here.
 */
export interface BoxRule {
  /** Inclusive range of 250 g-equivalent jars. */
  minJars: number;
  maxJars: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  /** Extra packaging on top of the per-jar packed weights (bigger box, more filler). */
  extraOverheadG: number;
  provisional: boolean;
}

export const BOX_RULES: readonly BoxRule[] = [
  { minJars: 2, maxJars: 2, lengthCm: 20, breadthCm: 15, heightCm: 10, extraOverheadG: 60, provisional: true },
  { minJars: 3, maxJars: 4, lengthCm: 25, breadthCm: 20, heightCm: 12, extraOverheadG: 120, provisional: true },
];

/** Above this a parcel should be split into boxes — v2; for now one shipment + admin alert. */
export const MAX_JARS_PER_BOX = 4;
/** D-34: a 250 g SKU's packed weight should stay within the 500 g courier slab. */
export const SINGLE_JAR_WEIGHT_TARGET_G = 500;
/** Couriers bill max(dead, volumetric); volumetric kg = L×B×H / 5000 → grams = L×B×H / 5. */
export const VOLUMETRIC_DIVISOR = 5000;

export interface ParcelLine {
  quantity: number;
  netWeightG: number;
  packedWeightG: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export type ParcelWarning = 'OVER_WEIGHT_TARGET' | 'OVERSIZE_SPLIT_NEEDED' | 'PROVISIONAL_BOX';

export interface Parcel {
  jarEquivalents: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  deadWeightG: number;
  volumetricWeightG: number;
  /** What the courier will bill: max(dead, volumetric). */
  chargeableWeightG: number;
  warnings: ParcelWarning[];
}

const volumetricG = (l: number, b: number, h: number) => Math.ceil((l * b * h * 1000) / VOLUMETRIC_DIVISOR);

export function computeParcel(lines: readonly ParcelLine[]): Parcel {
  if (lines.length === 0) throw new Error('A parcel needs at least one item');
  const jarEquivalents = lines.reduce((n, l) => n + l.quantity * Math.max(1, Math.ceil(l.netWeightG / 250)), 0);
  const packedG = lines.reduce((g, l) => g + l.quantity * l.packedWeightG, 0);
  const warnings: ParcelWarning[] = [];

  let dims: { lengthCm: number; breadthCm: number; heightCm: number };
  let overheadG = 0;
  const totalUnits = lines.reduce((n, l) => n + l.quantity, 0);
  if (totalUnits === 1) {
    const only = lines.find((l) => l.quantity > 0)!;
    dims = { lengthCm: only.lengthCm, breadthCm: only.breadthCm, heightCm: only.heightCm };
    if (only.netWeightG <= 250 && only.packedWeightG > SINGLE_JAR_WEIGHT_TARGET_G) warnings.push('OVER_WEIGHT_TARGET');
  } else {
    const rule = BOX_RULES.find((r) => jarEquivalents >= r.minJars && jarEquivalents <= r.maxJars) ?? BOX_RULES.at(-1)!;
    if (jarEquivalents > MAX_JARS_PER_BOX) warnings.push('OVERSIZE_SPLIT_NEEDED');
    if (rule.provisional) warnings.push('PROVISIONAL_BOX');
    dims = { lengthCm: rule.lengthCm, breadthCm: rule.breadthCm, heightCm: rule.heightCm };
    overheadG = rule.extraOverheadG;
  }

  const deadWeightG = packedG + overheadG;
  const volumetricWeightG = volumetricG(dims.lengthCm, dims.breadthCm, dims.heightCm);
  return {
    jarEquivalents,
    ...dims,
    deadWeightG,
    volumetricWeightG,
    chargeableWeightG: Math.max(deadWeightG, volumetricWeightG),
    warnings,
  };
}
