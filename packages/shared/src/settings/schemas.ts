import { z } from 'zod';

/**
 * Per-key validation for admin-editable settings (Phase 9 §9.7). A key not listed here is
 * read-only from the admin UI. Money in integer paise (D-26); `null` = "not decided yet" where the
 * business hasn't closed the question (Q-02, Q-03).
 */
const paise = z.number().int().nonnegative().max(10_000_000_00);
export const SETTING_SCHEMAS = {
  reservation_ttl_minutes: z.number().int().min(5).max(60),
  min_remaining_shelf_days: z.number().int().min(0).max(365),
  transit_buffer_days: z.number().int().min(0).max(30),
  low_stock_threshold: z.number().int().min(0).max(1000),
  free_shipping_threshold_paise: paise.nullable(),
  flat_shipping_fee_paise: paise.nullable(),
  cod_enabled: z.literal(false), // D-25: prepaid only at launch — COD is v2
  cod_fee_paise: paise,
  packaging_cost_per_jar_paise: paise,
  pickup_cutoff_hour_ist: z.number().int().min(6).max(20),
  max_qty_per_item: z.number().int().min(1).max(50),
  min_courier_rating: z.number().min(0).max(5),
  max_courier_etd_days: z.number().int().min(1).max(30),
  shiprocket_wallet_min_paise: paise,
  partner_split_bp: z.number().int().min(0).max(10_000),
  seller_details: z
    .object({
      legalName: z.string().trim().min(2).max(120),
      gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN'),
      addressLine: z.string().trim().min(5).max(250),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().min(2).max(80),
      stateCode: z.string().regex(/^\d{2}$/),
      pincode: z.string().regex(/^[1-9]\d{5}$/),
    })
    .nullable(),
} as const;
export type EditableSettingKey = keyof typeof SETTING_SCHEMAS;
export const EDITABLE_SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as EditableSettingKey[];

export const SettingUpdateRequestSchema = z.object({ key: z.string(), value: z.unknown() }).superRefine((v, ctx) => {
  const schema = (SETTING_SCHEMAS as Record<string, z.ZodType>)[v.key];
  if (!schema) {
    ctx.addIssue({ code: 'custom', path: ['key'], message: 'This setting cannot be edited here.' });
    return;
  }
  const r = schema.safeParse(v.value);
  if (!r.success) for (const i of r.error.issues) ctx.addIssue({ ...i, path: ['value', ...i.path] } as never);
});
export type SettingUpdateRequest = { key: EditableSettingKey; value: unknown };

export const SettingRowSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  editable: z.boolean(),
});
export const SettingsListResponseSchema = z.object({ settings: z.array(SettingRowSchema) });
export type SettingsListResponse = z.infer<typeof SettingsListResponseSchema>;
