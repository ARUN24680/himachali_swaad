import { z } from 'zod';
import {
  ACTOR_TYPES,
  ALLOCATION_STATUSES,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
} from './statuses';

/** Database row schemas for migration 0003 (D-07). snake_case as returned by `pg`; BIGINT → number. */
export const OrderStatusEnum = z.enum(ORDER_STATUSES);
export const PaymentStatusEnum = z.enum(PAYMENT_STATUSES);
export const PaymentAttemptStatusEnum = z.enum(PAYMENT_ATTEMPT_STATUSES);
export const AllocationStatusEnum = z.enum(ALLOCATION_STATUSES);
export const RefundStatusEnum = z.enum(REFUND_STATUSES);
export const ActorTypeEnum = z.enum(ACTOR_TYPES);

const paise = z.number().int().nonnegative();

/** orders.shipping_address JSONB — immutable snapshot taken at checkout. */
export const ShippingAddressSnapshotSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  landmark: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
});
export type ShippingAddressSnapshot = z.infer<typeof ShippingAddressSnapshotSchema>;

export const OrderRowSchema = z.object({
  id: z.uuid(),
  order_code: z.string(),
  idempotency_key: z.string(),
  user_id: z.uuid().nullable(),
  customer_name: z.string(),
  customer_phone: z.string(),
  customer_email: z.string().nullable(),
  shipping_address: ShippingAddressSnapshotSchema,
  whatsapp_opt_in: z.boolean(),
  whatsapp_opt_in_at: z.date().nullable(),
  pickup_location_id: z.uuid(),
  status: OrderStatusEnum,
  payment_status: PaymentStatusEnum,
  payment_method: z.enum(['PREPAID', 'COD']),
  subtotal_paise: paise,
  shipping_fee_paise: paise,
  cod_fee_paise: paise,
  discount_paise: paise,
  total_paise: paise,
  tax_paise: paise,
  coupon_code: z.string().nullable(),
  gateway_order_id: z.string().nullable(),
  reservation_expires_at: z.date(),
  invoice_number: z.string().nullable(),
  invoice_key: z.string().nullable(),
  ops_issue: z.string().nullable(),
  cancel_reason: z.string().nullable(),
  confirmed_at: z.date().nullable(),
  packed_at: z.date().nullable(),
  shipped_at: z.date().nullable(),
  delivered_at: z.date().nullable(),
  cancelled_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type OrderRow = z.infer<typeof OrderRowSchema>;

export const OrderItemRowSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  product_id: z.uuid(),
  sku: z.string(),
  title: z.string(),
  net_weight_g: z.number().int(),
  quantity: z.number().int().positive(),
  unit_price_paise: paise,
  total_price_paise: paise,
  hsn_code: z.string(),
  gst_rate_bp: z.number().int(),
});
export type OrderItemRow = z.infer<typeof OrderItemRowSchema>;

export const AllocationRowSchema = z.object({
  id: z.uuid(),
  order_item_id: z.uuid(),
  batch_id: z.uuid(),
  quantity: z.number().int().positive(),
  status: AllocationStatusEnum,
  created_at: z.date(),
  updated_at: z.date(),
});
export type AllocationRow = z.infer<typeof AllocationRowSchema>;

export const PaymentRowSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  gateway: z.string(),
  gateway_order_id: z.string(),
  gateway_payment_id: z.string(),
  amount_paise: paise,
  fee_paise: paise.nullable(),
  fee_tax_paise: paise.nullable(),
  method: z.string().nullable(),
  status: PaymentAttemptStatusEnum,
  error_code: z.string().nullable(),
  error_description: z.string().nullable(),
  raw: z.unknown().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type PaymentRow = z.infer<typeof PaymentRowSchema>;

export const RefundRowSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  payment_id: z.uuid(),
  idempotency_key: z.string(),
  gateway_refund_id: z.string().nullable(),
  amount_paise: paise,
  reason: z.string(),
  notes: z.string().nullable(),
  status: RefundStatusEnum,
  initiated_by_type: ActorTypeEnum,
  initiated_by_id: z.uuid().nullable(),
  processed_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type RefundRow = z.infer<typeof RefundRowSchema>;

export const AddressRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  label: z.string().nullable(),
  full_name: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  landmark: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  // CHAR(6)
  pincode: z.string(),
  is_default: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type AddressRow = z.infer<typeof AddressRowSchema>;

export const StatusLogRowSchema = z.object({
  id: z.number().int(),
  order_id: z.uuid(),
  from_status: OrderStatusEnum.nullable(),
  to_status: OrderStatusEnum,
  actor_type: ActorTypeEnum,
  actor_id: z.uuid().nullable(),
  reason: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.date(),
});
export type StatusLogRow = z.infer<typeof StatusLogRowSchema>;
