import { z } from 'zod';
import { PincodeSchema } from '../schemas/common';

/** POST /api/v1/shipping/check-pincode (Phase 4 §4.6, Shiprocket-backed from Phase 6 §6.3). */
export const PincodeCheckRequestSchema = z.object({ pincode: PincodeSchema });
export type PincodeCheckRequest = z.infer<typeof PincodeCheckRequestSchema>;

export const PincodeCheckResponseSchema = z.object({
  pincode: z.string(),
  /** null = courier partner unreachable right now; checkout is NOT blocked ("we'll confirm at checkout"). */
  serviceable: z.boolean().nullable(),
  /** Delivery estimate in days after dispatch; null when not serviceable. */
  estimatedDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  courierHint: z.string().nullable(),
});
export type PincodeCheckResponse = z.infer<typeof PincodeCheckResponseSchema>;

/**
 * GET /api/v1/shipping/pincode/:pincode/locality (Phase 5 §5.4) — city/state auto-fill from the
 * India Post PIN directory (cached 30 days). Nulls when unknown; the form keeps manual override.
 */
export const PincodeParamsSchema = z.object({ pincode: PincodeSchema });
export const PincodeLocalityResponseSchema = z.object({
  pincode: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});
export type PincodeLocalityResponse = z.infer<typeof PincodeLocalityResponseSchema>;
