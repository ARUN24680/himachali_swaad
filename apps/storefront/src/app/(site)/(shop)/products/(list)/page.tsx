import type { ProductListResponse } from '@pk/shared';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { CatalogListing, CatalogUnavailable, catalogApi } from '@/modules/catalog';

export const metadata: Metadata = {
  title: 'Shop Himachali non-veg pickles',
  description: 'Chicken, mutton and trout pickles in 250 g and 500 g jars — small batches from a Himachal kitchen.',
  alternates: { canonical: '/products' },
};

async function load(): Promise<ProductListResponse | null> {
  try {
    return await catalogApi.list();
  } catch {
    await connection(); // never cache the failure
    return null;
  }
}

export default async function ProductsPage() {
  const catalog = await load();
  return catalog ? <CatalogListing groups={catalog.groups} /> : <CatalogUnavailable />;
}
