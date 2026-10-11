import type {
  AbandonOrderResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  PincodeLocalityResponse,
  SavedAddress,
  SimulatePaymentRequest,
  SimulatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/**
 * Checkout + payment calls (Phase 5 §5.4–5.7). Typed by the shared contracts, never re-parsed in the
 * browser (keeps zod out of client bundles, D-51 b) — `import type` only.
 */
export const checkoutApi = {
  /** Reserves the jars and opens a gateway order. Same Idempotency-Key → same order (07 §4.1). */
  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    apiRequest<CreateOrderResponse>('/checkout/create-order', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * Release a still-unpaid reservation right away ("Change details" / "Start again"). The order's own
   * Idempotency-Key is the ownership proof. `released: false` = already paid / no longer pending.
   */
  abandonOrder: (orderCode: string, idempotencyKey: string) =>
    apiRequest<AbandonOrderResponse>('/checkout/abandon', {
      method: 'POST',
      body: { orderCode },
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  verifyPayment: (body: VerifyPaymentRequest) =>
    apiRequest<VerifyPaymentResponse>('/payments/verify', { method: 'POST', body }),

  /** Dev/CI mock gateway only — the backend refuses this route in production. */
  simulatePayment: (body: SimulatePaymentRequest) =>
    apiRequest<SimulatePaymentResponse>('/dev/payments/simulate', { method: 'POST', body }),

  /** India Post PIN → city/state (nulls when unknown). */
  pincodeLocality: (pincode: string, signal?: AbortSignal) =>
    apiRequest<PincodeLocalityResponse>(`/shipping/pincode/${encodeURIComponent(pincode)}/locality`, { signal }),

  /** Logged-in customers only; guests get 401 (treated as "no saved addresses"). */
  savedAddresses: (signal?: AbortSignal) => apiRequest<{ addresses: SavedAddress[] }>('/me/addresses', { signal }),
};
