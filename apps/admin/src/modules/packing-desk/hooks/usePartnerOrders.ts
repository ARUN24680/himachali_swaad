import type { PartnerOrdersQuery } from '@pk/shared';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { packingDeskApi } from '../api/packingDeskApi';

export type OrderTab = NonNullable<PartnerOrdersQuery['status']>;

/** Partner's orders for one status tab, oldest first. The to-pack tab polls so new orders appear. */
export function usePartnerOrders(status: OrderTab) {
  return useQuery({
    queryKey: queryKeys.partner.orders.list(status),
    queryFn: ({ signal }) => packingDeskApi.orders(status, signal),
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
