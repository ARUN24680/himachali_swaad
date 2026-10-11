import type { BatchListQuery } from '@pk/shared';

/** Central TanStack Query keys (architecture/09 §3.3). Hierarchical so a prefix invalidates a family. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  products: {
    all: ['products'] as const,
    list: () => ['products', 'list'] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
  },
  batches: {
    all: ['batches'] as const,
    list: (filters: BatchListQuery) => ['batches', 'list', filters] as const,
    movements: (batchId: string) => ['batches', 'movements', batchId] as const,
    productOptions: ['batches', 'product-options'] as const,
  },
  pickupLocations: ['partner', 'pickup-locations'] as const,
};
