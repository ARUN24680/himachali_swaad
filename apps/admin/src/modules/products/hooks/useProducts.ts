import type { AdminProduct, ProductCreateRequest, ProductUpdateRequest } from '@pk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { productsApi } from '../api/productsApi';

export function useProducts() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: ({ signal }) => productsApi.list(signal).then((r) => r.products),
  });
}

export function useProduct(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery<AdminProduct>({
    queryKey: queryKeys.products.detail(id ?? 'new'),
    queryFn: ({ signal }) => productsApi.get(id as string, signal).then((r) => r.product),
    enabled: Boolean(id),
    // Opening a product from the list paints instantly from the list cache, then refreshes
    placeholderData: () => qc.getQueryData<AdminProduct[]>(queryKeys.products.list())?.find((p) => p.id === id),
  });
}

/** Write the fresh product into both caches; batches' product options may change too (shelf life). */
function useSyncProduct() {
  const qc = useQueryClient();
  return (product: AdminProduct) => {
    qc.setQueryData(queryKeys.products.detail(product.id), product);
    qc.setQueryData<AdminProduct[]>(queryKeys.products.list(), (list) => {
      if (!list) return list;
      const idx = list.findIndex((p) => p.id === product.id);
      return idx === -1 ? [...list, product] : list.map((p) => (p.id === product.id ? product : p));
    });
    void qc.invalidateQueries({ queryKey: queryKeys.batches.productOptions });
  };
}

export function useCreateProduct() {
  const sync = useSyncProduct();
  return useMutation({
    mutationFn: (body: ProductCreateRequest) => productsApi.create(body).then((r) => r.product),
    onSuccess: sync,
  });
}

export function useUpdateProduct(id: string) {
  const sync = useSyncProduct();
  return useMutation({
    mutationFn: (body: ProductUpdateRequest) => productsApi.update(id, body).then((r) => r.product),
    onSuccess: sync,
  });
}

export function usePublishProduct(id: string) {
  const sync = useSyncProduct();
  return useMutation({
    mutationFn: (publish: boolean) =>
      (publish ? productsApi.publish(id) : productsApi.unpublish(id)).then((r) => r.product),
    onSuccess: sync,
  });
}
