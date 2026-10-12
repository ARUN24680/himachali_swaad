import { describe, expect, it } from 'vitest';
import {
  computeParcel,
  isPastCutoff,
  mapShiprocketStatus,
  pickupDateFor,
  SINGLE_JAR_WEIGHT_TARGET_G,
} from '../src/logistics';

const jar = (packedWeightG: number, quantity = 1, netWeightG = 250) => ({
  quantity,
  netWeightG,
  packedWeightG,
  lengthCm: 15,
  breadthCm: 10,
  heightCm: 10,
});

describe('computeParcel (Phase 6 §6.4, D-33, D-34)', () => {
  it('1 × 250 g SKU: dims from the product, dead weight = packed weight, within the 500 g slab', () => {
    const p = computeParcel([jar(480)]);
    expect(p).toMatchObject({ lengthCm: 15, breadthCm: 10, heightCm: 10, deadWeightG: 480, volumetricWeightG: 300 });
    expect(p.deadWeightG).toBeLessThanOrEqual(SINGLE_JAR_WEIGHT_TARGET_G);
    expect(p.warnings).toEqual([]);
    expect(p.chargeableWeightG).toBe(480);
  });

  it('a 250 g jar packed over 500 g → OVER_WEIGHT_TARGET warning (logged by the booking job)', () => {
    expect(computeParcel([jar(520)]).warnings).toContain('OVER_WEIGHT_TARGET');
  });

  it('multi-jar uses the box table (+ overhead), > 4 jars flags a split; 500 g jars count double', () => {
    const two = computeParcel([jar(480, 2)]);
    expect(two).toMatchObject({ jarEquivalents: 2, lengthCm: 20, deadWeightG: 960 + 60 });
    expect(two.warnings).toContain('PROVISIONAL_BOX');
    expect(computeParcel([jar(480, 1), jar(800, 1, 500)]).jarEquivalents).toBe(3);
    expect(computeParcel([jar(480, 5)]).warnings).toContain('OVERSIZE_SPLIT_NEEDED');
    expect(() => computeParcel([])).toThrow();
  });
});

describe('mapShiprocketStatus (07 §5)', () => {
  it.each([
    ['Picked Up', 'IN_TRANSIT'],
    ['in_transit', 'IN_TRANSIT'],
    ['REACHED AT DESTINATION HUB', 'IN_TRANSIT'],
    ['OUT FOR DELIVERY', 'OUT_FOR_DELIVERY'],
    ['Delivered', 'DELIVERED'],
    ['UNDELIVERED', 'DELIVERY_FAILED'],
    ['RTO OFD', 'RTO_IN_TRANSIT'],
    ['RTO DELIVERED', 'RTO_DELIVERED'],
    ['DAMAGED', 'LOST'],
  ])('%s → %s', (text, status) => {
    expect(mapShiprocketStatus(text)).toEqual({ kind: 'status', status });
  });

  it('pickup problems alert without a status change; pickup/AWB events are stored only', () => {
    expect(mapShiprocketStatus('PICKUP EXCEPTION')).toEqual({ kind: 'alert', reason: 'PICKUP_EXCEPTION' });
    expect(mapShiprocketStatus('OUT FOR PICKUP')).toEqual({ kind: 'none' });
    expect(mapShiprocketStatus('AWB ASSIGNED')).toEqual({ kind: 'none' });
    expect(mapShiprocketStatus('Delayed')).toEqual({ kind: 'none' });
  });

  it('falls back to the numeric shipment_status_id for unknown labels', () => {
    expect(mapShiprocketStatus('Something new', 7)).toEqual({ kind: 'status', status: 'DELIVERED' });
    expect(mapShiprocketStatus('Something new', 42)).toEqual({ kind: 'status', status: 'IN_TRANSIT' });
    expect(mapShiprocketStatus('Something new', 999)).toEqual({ kind: 'none' });
    expect(mapShiprocketStatus(null, null)).toEqual({ kind: 'none' });
  });
});

describe('pickupDateFor (D-36)', () => {
  const ist = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m - 1, d, h, 0) - 5.5 * 3600_000);
  it('before cut-off same day, after → next working day, Sunday → Monday', () => {
    expect(pickupDateFor(ist(2026, 10, 12, 10), 11)).toBe('2026-10-12'); // Mon 10:00
    expect(pickupDateFor(ist(2026, 10, 12, 11), 11)).toBe('2026-10-13'); // Mon 11:00 = past
    expect(pickupDateFor(ist(2026, 10, 17, 12), 11)).toBe('2026-10-19'); // Sat afternoon → Mon
    expect(pickupDateFor(ist(2026, 10, 18, 9), 11)).toBe('2026-10-19'); // Sun → Mon
    expect(pickupDateFor(ist(2026, 10, 12, 23), 11)).toBe('2026-10-13'); // 23:00 IST = next UTC day boundary safe
  });
  it('isPastCutoff uses IST hours', () => {
    expect(isPastCutoff(ist(2026, 10, 12, 10), 11)).toBe(false);
    expect(isPastCutoff(ist(2026, 10, 12, 11), 11)).toBe(true);
  });
});
