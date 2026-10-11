import {
  ProductDetailResponseSchema,
  ProductListResponseSchema,
  type ProductDetail,
  type ProductListResponse,
} from '@pk/shared';
import { CACHE_TAGS, serverGet } from '@/lib/server-api';

/** Server Component reads (D-05). Cached + tagged; the backend purges `products` after every catalog/stock write. */
export const catalogApi = {
  list: (): Promise<ProductListResponse> => serverGet('/products', ProductListResponseSchema, [CACHE_TAGS.products]),

  detail: async (slug: string): Promise<ProductDetail> =>
    (
      await serverGet(`/products/${encodeURIComponent(slug)}`, ProductDetailResponseSchema, [
        CACHE_TAGS.products,
        CACHE_TAGS.product(slug),
      ])
    ).product,
};
