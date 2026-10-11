'use client';

import type { OrderStatusResponse } from '@pk/shared';
import { useEffect } from 'react';
import { trackPurchase } from '@/modules/analytics';

/**
 * GA4 purchase + Pixel Purchase once per order per tab (event id = order code; the server sends the
 * CAPI Purchase). Vendor scripts load lazily after consent, so try a few times before giving up.
 */
export function PurchaseTracker({ order }: { order: OrderStatusResponse }) {
  const { orderCode, items, totalPaise } = order;
  useEffect(() => {
    const tracked = items.map((i) => ({
      productId: i.productId,
      name: i.title,
      variant: `${i.netWeightG} g`,
      unitPricePaise: i.unitPricePaise,
      quantity: i.quantity,
    }));
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (trackPurchase(orderCode, tracked, totalPaise) || ++tries >= 5) return;
      timer = setTimeout(attempt, 1500);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [orderCode, items, totalPaise]);
  return null;
}
