'use client';

import type { CartQuoteLine } from '@pk/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { readLastPincode } from '@/lib/last-pincode';
import { cartApi } from '../api/cartApi';
import { useCartStore, type CartItem } from '../store/cart.store';

export const cartKeys = {
  all: ['cart', 'quote'] as const,
  quote: (items: CartItem[], pincode: string | undefined) => ['cart', 'quote', items, pincode ?? null] as const,
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function noticeFor(line: CartQuoteLine): string | null {
  switch (line.issue) {
    case 'QTY_REDUCED':
      return line.quantity === 1
        ? 'Only 1 jar left — quantity updated'
        : `Only ${line.quantity} jars available — quantity updated`;
    case 'OUT_OF_STOCK':
      return 'Sold out — this batch has run out';
    case 'INACTIVE':
      return 'No longer available';
    default:
      return null;
  }
}

/**
 * Server quote for the local cart (D-15) — runs while the drawer is open and whenever the cart
 * changes (debounced so +/- taps don't spam the API). When the server can sell fewer jars than asked,
 * its adjusted quantity is written back to the store and a notice is kept for that line.
 *
 * `pincode` (checkout): quote shipping for the address being typed; otherwise the last checked one.
 */
export function useCartQuote(enabled: boolean, opts: { pincode?: string } = {}) {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const debouncedItems = useDebounced(items, 350);
  const [notices, setNotices] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: cartKeys.quote(debouncedItems, opts.pincode),
    queryFn: async ({ signal }) => {
      const pincode = opts.pincode ?? readLastPincode(); // shipping for the last checked pincode, if any
      const quote = await cartApi.quote({ items: debouncedItems, ...(pincode ? { pincode } : {}) }, signal);
      // Apply the server's adjusted quantities to the local cart and keep a notice per affected line
      const fresh: Record<string, string> = {};
      for (const line of quote.items) {
        const message = noticeFor(line);
        if (message) fresh[line.productId] = message;
        if (line.quantity > 0 && line.quantity < line.requestedQuantity) setQuantity(line.productId, line.quantity);
      }
      if (Object.keys(fresh).length > 0) setNotices((prev) => ({ ...prev, ...fresh }));
      return quote;
    },
    enabled: enabled && debouncedItems.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  /** Quote is behind the local cart (debounce pending or request in flight). */
  const isSyncing = query.isFetching || debouncedItems !== items;

  return {
    ...query,
    notices,
    isSyncing,
    clearNotice: (id: string) => setNotices(({ [id]: _, ...rest }) => rest),
    /** Attach a notice to a line from outside the quote (e.g. checkout's 409 OUT_OF_STOCK). */
    setNotice: (id: string, message: string) => setNotices((prev) => ({ ...prev, [id]: message })),
  };
}
