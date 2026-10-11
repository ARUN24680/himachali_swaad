import { CartQuoteResponseSchema, type CartQuoteRequest, type CartQuoteResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

export const cartApi = {
  /** Server-side price + stock + shipping revalidation (D-15). */
  quote: async (body: CartQuoteRequest, signal?: AbortSignal): Promise<CartQuoteResponse> =>
    CartQuoteResponseSchema.parse(await apiRequest('/cart/quote', { method: 'POST', body, signal })),
};
