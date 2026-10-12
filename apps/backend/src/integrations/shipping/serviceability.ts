import type { ShiprocketApi } from '../shiprocket/client';

/**
 * Pincode serviceability (Phase 4 §4.6 stub → Phase 6 §6.3 Shiprocket). The stub gives honest
 * "estimate" ranges by distance from the Himachal kitchen (pincode zone = first digit) and stays
 * for tests / offline dev.
 */
export interface ServiceabilityResult {
  /** null = courier partner unreachable — say "we'll confirm at checkout", never block. */
  serviceable: boolean | null;
  estimatedDays: { min: number; max: number } | null;
  courierHint: string | null;
}

export interface ServiceabilityProvider {
  check(pincode: string): Promise<ServiceabilityResult>;
  /** Cache scope — the origin pincode (results differ per kitchen). */
  scope(): Promise<string>;
}

/** Shiprocket-backed (Phase 6 §6.3): origin = the default kitchen, 0.5 kg prepaid (one jar). */
export function createShiprocketServiceabilityProvider(deps: {
  shiprocket: ShiprocketApi;
  originPincode: () => Promise<string | null>;
}): ServiceabilityProvider {
  return {
    scope: async () => (await deps.originPincode()) ?? 'none',
    async check(pincode) {
      const origin = await deps.originPincode();
      if (!origin) return { serviceable: null, estimatedDays: null, courierHint: null };
      try {
        const couriers = await deps.shiprocket.checkServiceability({
          pickupPincode: origin,
          deliveryPincode: pincode,
          weightKg: 0.5,
        });
        if (couriers.length === 0) return { serviceable: false, estimatedDays: null, courierHint: null };
        const days = couriers.map((c) => c.etdDays).filter((d): d is number => d !== null && d > 0);
        return {
          serviceable: true,
          estimatedDays: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
          // Courier names aren't shown to customers (Phase 6 §6.3)
          courierHint: null,
        };
      } catch {
        return { serviceable: null, estimatedDays: null, courierHint: null };
      }
    },
  };
}

const ZONE_DAYS: Record<string, { min: number; max: number }> = {
  '1': { min: 2, max: 4 }, // Delhi, Haryana, Punjab, HP, J&K
  '2': { min: 3, max: 5 }, // UP, Uttarakhand
  '3': { min: 4, max: 6 }, // Rajasthan, Gujarat
  '4': { min: 4, max: 7 }, // Maharashtra, MP, Chhattisgarh
  '5': { min: 5, max: 7 }, // Telangana, AP, Karnataka
  '6': { min: 5, max: 8 }, // Tamil Nadu, Kerala
  '7': { min: 5, max: 8 }, // West Bengal, Odisha, North-East
  '8': { min: 4, max: 7 }, // Bihar, Jharkhand
  '9': { min: 6, max: 9 }, // Army Post Office
};

export function createStubServiceabilityProvider(): ServiceabilityProvider {
  return {
    scope: async () => 'stub',
    async check(pincode) {
      const days = ZONE_DAYS[pincode[0] ?? ''];
      if (!days) return { serviceable: false, estimatedDays: null, courierHint: null };
      return { serviceable: true, estimatedDays: days, courierHint: null };
    },
  };
}
