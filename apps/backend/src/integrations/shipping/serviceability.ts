/**
 * Pincode serviceability (Phase 4 §4.6). Phase 6 adds a Shiprocket-backed provider behind this
 * same interface; until then the stub gives honest "estimate" ranges by distance from the
 * Himachal kitchen (pincode zone = first digit; 17xxxx = Himachal Pradesh).
 */
export interface ServiceabilityResult {
  serviceable: boolean;
  estimatedDays: { min: number; max: number } | null;
  courierHint: string | null;
}

export interface ServiceabilityProvider {
  check(pincode: string): Promise<ServiceabilityResult>;
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
    async check(pincode) {
      const days = ZONE_DAYS[pincode[0] ?? ''];
      if (!days) return { serviceable: false, estimatedDays: null, courierHint: null };
      return { serviceable: true, estimatedDays: days, courierHint: null };
    },
  };
}
