import type { PartnerOrdersResponse } from '@pk/shared';
import { snapshotCache } from '@/lib/offline-cache';
import type { OrderTab } from '../hooks/usePartnerOrders';

/**
 * Last good GET /partner/orders answer per status tab (Phase 7 §7.2 offline cold start). Read only
 * when the API can't be reached; cleared with the identity on sign-out / 401 (lib/offline-cache).
 */
const key = (status: OrderTab) => `partner-orders:${status}`;

export const queueCache = {
  get: (status: OrderTab) => snapshotCache.get<PartnerOrdersResponse>(key(status)),
  put: (status: OrderTab, data: PartnerOrdersResponse) => snapshotCache.put(key(status), data),
  /** Packed on this phone → drop it from the saved to-pack list too, so a cold start won't show it. */
  removeToPack: (orderCode: string) =>
    snapshotCache.update<PartnerOrdersResponse>(key('AWAITING_PACKING'), (d) => {
      const orders = d.orders.filter((o) => o.orderCode !== orderCode);
      return { ...d, orders, toPack: Math.max(0, d.toPack - (d.orders.length - orders.length)) };
    }),
};
