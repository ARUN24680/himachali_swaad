import { z } from 'zod';

/** Row schemas for migration 0004 (D-07). NUMERIC comes back from `pg` as a string → coerce. */
export const ShipmentRowSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  shiprocket_order_id: z.string().nullable(),
  shiprocket_shipment_id: z.string().nullable(),
  courier_company_id: z.number().int().nullable(),
  courier_name: z.string().nullable(),
  awb_code: z.string().nullable(),
  label_key: z.string().nullable(),
  manifest_key: z.string().nullable(),
  dead_weight_g: z.number().int().nullable(),
  volumetric_weight_g: z.number().int().nullable(),
  length_cm: z.coerce.number().nullable(),
  breadth_cm: z.coerce.number().nullable(),
  height_cm: z.coerce.number().nullable(),
  charged_weight_g: z.number().int().nullable(),
  freight_paise: z.number().int().nullable(),
  rto_freight_paise: z.number().int().nullable(),
  pickup_scheduled_for: z.string().nullable(), // DATE kept as 'YYYY-MM-DD'
  pickup_requested_at: z.date().nullable(),
  pickup_token: z.string().nullable(),
  etd: z.string().nullable(),
  last_status_text: z.string().nullable(),
  last_status_at: z.date().nullable(),
  booking_attempts: z.number().int(),
  last_error: z.string().nullable(),
  cancelled_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type ShipmentRow = z.infer<typeof ShipmentRowSchema>;

export const TrackingEventRowSchema = z.object({
  id: z.number().int(),
  shipment_id: z.uuid(),
  status_code: z.string().nullable(),
  status_text: z.string(),
  location: z.string().nullable(),
  event_time: z.date(),
  source: z.enum(['WEBHOOK', 'POLL']),
  raw: z.unknown().nullable(),
  created_at: z.date(),
});
export type TrackingEventRow = z.infer<typeof TrackingEventRowSchema>;
