import { z } from 'zod';
import { MAX_CART_LINES } from '../constants/limits';
import { PincodeSchema } from '../schemas/common';

/** POST /api/v1/cart/quote (Phase 4 §4.5, D-15). The cart stores only {productId, quantity}; prices always come from here. */

export { MAX_CART_LINES };

export const CartItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive().max(99),
});
export type CartItemInput = z.infer<typeof CartItemInputSchema>;

export const CartQuoteRequestSchema = z.object({
  items: z.array(CartItemInputSchema).max(MAX_CART_LINES),
  pincode: PincodeSchema.optional(),
});
export type CartQuoteRequest = z.infer<typeof CartQuoteRequestSchema>;

export const CART_ISSUES = ['OUT_OF_STOCK', 'QTY_REDUCED', 'INACTIVE'] as const;
export const CartIssueEnum = z.enum(CART_ISSUES);
export type CartIssue = z.infer<typeof CartIssueEnum>;

export const CartQuoteLineSchema = z.object({
  productId: z.uuid(),
  /** null when the product no longer exists. */
  slug: z.string().nullable(),
  title: z.string().nullable(),
  netWeightG: z.number().int().nullable(),
  image: z.url().nullable(),
  unitPricePaise: z.number().int(),
  comparePricePaise: z.number().int().nullable(),
  /** What the customer asked for (from their cart). */
  requestedQuantity: z.number().int(),
  /** What can actually be bought now: min(requested, sellable stock, max_qty_per_item); 0 when unavailable. */
  quantity: z.number().int(),
  availableQuantity: z.number().int(),
  lineTotalPaise: z.number().int(),
  issue: CartIssueEnum.nullable(),
});
export type CartQuoteLine = z.infer<typeof CartQuoteLineSchema>;

export const CartQuoteResponseSchema = z.object({
  items: z.array(CartQuoteLineSchema),
  subtotalPaise: z.number().int(),
  shippingFeePaise: z.number().int(),
  discountPaise: z.number().int(),
  totalPaise: z.number().int(),
  /** settings.free_shipping_threshold_paise — null until Q-03 is decided. */
  freeShippingThresholdPaise: z.number().int().nullable(),
  freeShippingRemainingPaise: z.number().int().nullable(),
  /** settings.max_qty_per_item — cart steppers cap at this. */
  maxQtyPerItem: z.number().int(),
  /** settings.reservation_ttl_minutes — how long checkout holds the jars (copy on the checkout page). */
  reservationTtlMinutes: z.number().int(),
});
export type CartQuoteResponse = z.infer<typeof CartQuoteResponseSchema>;
