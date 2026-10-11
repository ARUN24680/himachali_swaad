import { z } from 'zod';
import { ISO_DATE_REGEX } from '../catalog/batch-code';
import { MovementTypeEnum } from '../catalog/rows';
import { SHELF_STATUSES } from '../catalog/shelf-life';
import { PaiseSchema } from '../schemas/common';

/** Request/response contracts for /api/v1/batches (Phase 3 §3.4–3.5). */

export const ShelfStatusEnum = z.enum(SHELF_STATUSES);
export const MAX_BATCH_QUANTITY = 10_000;

const IsoDateSchema = z.string().regex(ISO_DATE_REGEX, 'Use YYYY-MM-DD');
const notes = z.string().trim().min(1).max(500);

/** Partner enters only product, jars and total cost (D-42); code, expiry and per-jar cost are derived. */
export const BatchCreateRequestSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive().max(MAX_BATCH_QUANTITY),
  totalCostPaise: PaiseSchema,
  /** Defaults to today (IST). Cannot be in the future. */
  manufacturedAt: IsoDateSchema.optional(),
  /** Optional when the user has exactly one kitchen. */
  pickupLocationId: z.uuid().optional(),
  notes: notes.optional(),
});
export type BatchCreateRequest = z.infer<typeof BatchCreateRequestSchema>;

/** Only notes are editable; a wrong quantity is fixed with an ADJUSTMENT movement. */
export const BatchUpdateRequestSchema = z.object({ notes: notes.nullable() });

export const ADJUSTMENT_TYPES = ['ADJUSTMENT', 'WASTAGE'] as const;
export const AdjustmentRequestSchema = z
  .object({
    type: z.enum(ADJUSTMENT_TYPES),
    quantityDelta: z
      .number()
      .int()
      .min(-MAX_BATCH_QUANTITY)
      .max(MAX_BATCH_QUANTITY)
      .refine((n) => n !== 0, 'Change cannot be zero'),
    reason: z.string().trim().min(3, 'Add a short reason').max(300),
  })
  .refine((a) => a.type !== 'WASTAGE' || a.quantityDelta < 0, {
    path: ['quantityDelta'],
    message: 'Wastage removes jars — use a negative number',
  });
export type AdjustmentRequest = z.infer<typeof AdjustmentRequestSchema>;

export const BatchListQuerySchema = z.object({
  productId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  status: ShelfStatusEnum.optional(),
  /** Include batches with 0 jars left (default false). */
  includeEmpty: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type BatchListQuery = z.input<typeof BatchListQuerySchema>;

export const BatchSchema = z.object({
  id: z.uuid(),
  batchCode: z.string(),
  product: z.object({ id: z.uuid(), sku: z.string(), title: z.string(), netWeightG: z.number().int() }),
  pickupLocation: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  manufacturedAt: z.string(),
  expiryDate: z.string(),
  initialQuantity: z.number().int(),
  availableStock: z.number().int(),
  totalCostPaise: z.number().int(),
  costPerUnitPaise: z.number().int(),
  notes: z.string().nullable(),
  /** expiry_date − today (IST); ≤ 0 means expired. */
  daysToExpiry: z.number().int(),
  shelfStatus: ShelfStatusEnum,
  createdAt: z.iso.datetime(),
});
export type Batch = z.infer<typeof BatchSchema>;

export const BatchResponseSchema = z.object({ batch: BatchSchema });
export const BatchListResponseSchema = z.object({
  batches: z.array(BatchSchema),
  /** min_remaining_shelf_days + transit_buffer_days used for shelfStatus. */
  sellableBufferDays: z.number().int(),
});
export type BatchListResponse = z.infer<typeof BatchListResponseSchema>;

export const MovementSchema = z.object({
  id: z.number().int(),
  type: MovementTypeEnum,
  quantityDelta: z.number().int(),
  /** Jars in the batch right after this movement (ledger running total). */
  balanceAfter: z.number().int(),
  reason: z.string().nullable(),
  orderId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Movement = z.infer<typeof MovementSchema>;
export const MovementListResponseSchema = z.object({ movements: z.array(MovementSchema) });

/** GET /batches/product-options — products a batch can be logged against (drafts included). */
export const BatchProductOptionSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  title: z.string(),
  netWeightG: z.number().int(),
  /** null → batch logging is blocked until the lab shelf life is entered (Q-07). */
  shelfLifeDays: z.number().int().nullable(),
  isActive: z.boolean(),
});
export const BatchProductOptionsResponseSchema = z.object({ products: z.array(BatchProductOptionSchema) });
export type BatchProductOption = z.infer<typeof BatchProductOptionSchema>;

/** GET /partner/pickup-locations — ADMIN: all kitchens; KITCHEN_PARTNER: own kitchens. */
export const PickupLocationSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
  isActive: z.boolean(),
});
export const PickupLocationListResponseSchema = z.object({ locations: z.array(PickupLocationSummarySchema) });
export type PickupLocationSummary = z.infer<typeof PickupLocationSummarySchema>;
