import type { PartnerOrdersQuery } from '@pk/shared';
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/services/api/http';
import { queryKeys } from '@/services/api/query-keys';
import { packingDeskApi } from '../api/packingDeskApi';
import { queueCache } from '../offline/queue-cache';
import { useDeskOfflineStore } from '../store/offline.store';

export type OrderTab = NonNullable<PartnerOrdersQuery['status']>;

/**
 * Partner's orders for one status tab, oldest first. The to-pack tab polls so new orders appear.
 * Offline (Phase 7 §7.2): every good answer is saved; when the API can't be reached (no response —
 * not a 4xx/5xx answer) the saved list is shown instead and the banner says how old it is.
 * `networkMode: 'always'` so the query runs (and falls back) while the phone is offline instead of
 * pausing on a skeleton.
 */
export function usePartnerOrders(status: OrderTab) {
  return useQuery({
    queryKey: queryKeys.partner.orders.list(status),
    queryFn: async ({ signal }) => {
      try {
        const data = await packingDeskApi.orders(status, signal);
        void queueCache.put(status, data);
        useDeskOfflineStore.getState().fresh(status);
        return data;
      } catch (err) {
        if (isApiError(err, 'NETWORK_ERROR')) {
          const saved = await queueCache.get(status);
          if (saved) {
            useDeskOfflineStore.getState().servedFromCache(status, saved.savedAt);
            return saved.data;
          }
        }
        throw err;
      }
    },
    networkMode: 'always',
    refetchInterval: status === 'AWAITING_PACKING' ? 60_000 : false,
  });
}

export function useManifests(enabled = true) {
  return useQuery({
    queryKey: queryKeys.partner.manifests,
    queryFn: ({ signal }) => packingDeskApi.manifests(signal),
    enabled,
    staleTime: 60_000, // URLs are signed for 5 min; actions refetch when one is about to expire
  });
}
