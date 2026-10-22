'use client';

import type { OrderStatusResponse } from '@pk/shared';
import { useEffect } from 'react';
import { takeOrderPlacedHere } from '@/lib/order-session';
import { useCartStore } from '@/modules/cart';
import { ACTIVE_STATUSES } from '../lib/labels';

/**
 * Empties the cart once an order placed in this tab is paid. Razorpay/mock checkout already clears it
 * (and consumes the marker) before navigating here; Direct UPI leaves for the pay page, so this is
 * where its cart gets emptied. Abandoned/expired UPI payments never reach a paid status, so the cart
 * survives them. Waits for the persisted cart to hydrate, otherwise rehydration would restore it.
 */
export function useClearCartWhenPaid(order: OrderStatusResponse | undefined): void {
  const hydrated = useCartStore((s) => s.hydrated);
  const clear = useCartStore((s) => s.clear);
  const code = order?.orderCode;
  const paid = !!order && ACTIVE_STATUSES.includes(order.status);

  useEffect(() => {
    if (code && paid && hydrated && takeOrderPlacedHere(code)) clear();
  }, [code, paid, hydrated, clear]);
}
