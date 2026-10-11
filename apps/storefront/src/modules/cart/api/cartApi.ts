import type { CartQuoteRequest, CartQuoteResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/** Typed by the shared contract; not re-parsed in the browser (keeps zod out of first-load JS). */
export const cartApi = {
  /** Server-side price + stock + shipping revalidation (D-15). */
  quote: (body: CartQuoteRequest, signal?: AbortSignal): Promise<CartQuoteResponse> =>
    apiRequest<CartQuoteResponse>('/cart/quote', { method: 'POST', body, signal }),
};
