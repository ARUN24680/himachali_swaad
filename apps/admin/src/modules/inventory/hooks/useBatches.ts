import type { AdjustmentRequest, BatchCreateRequest, BatchListQuery } from '@pk/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { inventoryApi } from '../api/inventoryApi';

export function useBatches(filters: BatchListQuery) {
  return useQuery({
    queryKey: queryKeys.batches.list(filters),
    queryFn: ({ signal }) => inventoryApi.list(filters, signal),
    placeholderData: keepPreviousData, // filters change without flashing the skeleton
  });
}

export function useBatchProductOptions() {
  return useQuery({
    queryKey: queryKeys.batches.productOptions,
    queryFn: ({ signal }) => inventoryApi.productOptions(signal).then((r) => r.products),
    staleTime: 5 * 60_000,
  });
}

export function usePickupLocations() {
  return useQuery({
    queryKey: queryKeys.pickupLocations,
    queryFn: ({ signal }) => inventoryApi.pickupLocations(signal).then((r) => r.locations),
    staleTime: 10 * 60_000,
  });
}

export function useBatchMovements(batchId: string | null) {
  return useQuery({
    queryKey: queryKeys.batches.movements(batchId ?? 'none'),
    queryFn: ({ signal }) => inventoryApi.movements(batchId as string, signal).then((r) => r.movements),
    enabled: Boolean(batchId),
  });
}

/** Stock changed → every batch list, ledger and the product stock counts are stale. */
function useInvalidateStock() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.batches.all }),
      qc.invalidateQueries({ queryKey: queryKeys.products.all }),
    ]);
}

export function useCreateBatch() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (body: BatchCreateRequest) => inventoryApi.create(body).then((r) => r.batch),
    onSuccess: () => invalidate(),
  });
}

export function useAdjustBatch(batchId: string) {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (body: AdjustmentRequest) => inventoryApi.adjust(batchId, body).then((r) => r.batch),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBatchNotes(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string | null) => inventoryApi.updateNotes(batchId, notes).then((r) => r.batch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches', 'list'] }),
  });
}

export function useExpiryAlerts(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.batches.expiryAlerts,
    queryFn: ({ signal }) => inventoryApi.expiryAlerts(signal).then((r) => r.batches),
    enabled,
  });
}
