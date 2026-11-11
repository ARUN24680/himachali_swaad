import type { ProductListResponse } from '@pk/shared';
import type { Metadata } from 'next';
import { CatalogListing, CatalogUnavailable, catalogApi } from '@/modules/catalog';

export const metadata: Metadata = {
  title: 'Shop Himachali non-veg pickles',
  description: 'Chicken, mutton and trout pickles in 250 g and 500 g jars — small batches from a Himachal kitchen.',
  alternates: { canonical: '/products' },
};

/** ISR, see the home page — static + 60 s revalidate instead of a permanent dynamic bail-out (M-3). */
export const revalidate = 60;

async function load(): Promise<ProductListResponse | null> {
  try {
    return await catalogApi.list();
  } catch {
    return null; // cached ≤ `revalidate` seconds, then re-rendered
  }
}

export default async function ProductsPage() {
  const catalog = await load();
  return catalog ? <CatalogListing groups={catalog.groups} /> : <CatalogUnavailable />;
}
