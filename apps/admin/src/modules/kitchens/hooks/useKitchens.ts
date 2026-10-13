import type { KitchenCreateRequest, KitchenUpdateRequest } from '@pk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { kitchensApi } from '../api/kitchensApi';

/** ADMIN kitchens list (all kitchens, active or not, with partner counts). */
export function useKitchens() {
  return useQuery({
    queryKey: queryKeys.kitchens,
    queryFn: ({ signal }) => kitchensApi.list(signal).then((r) => r.kitchens),
  });
}

/** A kitchen change also changes the pickup-location pickers (batch forms, packing desk). */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.kitchens }),
      qc.invalidateQueries({ queryKey: queryKeys.pickupLocations }),
    ]);
}

export function useCreateKitchen() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: KitchenCreateRequest) => kitchensApi.create(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateKitchen(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: KitchenUpdateRequest) => kitchensApi.update(id, body),
    onSuccess: () => invalidate(),
  });
}
