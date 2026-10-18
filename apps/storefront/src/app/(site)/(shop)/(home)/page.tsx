import type { ProductListResponse } from '@pk/shared';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { catalogApi } from '@/modules/catalog';
import { EnjoySection, FeaturedProducts, HomeHero, HomeStickyCta, OriginStory, PillarsSection } from '@/modules/home';

export const metadata: Metadata = { alternates: { canonical: '/' } };

async function loadCatalog(): Promise<ProductListResponse | null> {
  try {
    return await catalogApi.list();
  } catch {
    // Backend unreachable: render the page with an inline error state, and don't cache this render
    await connection();
    return null;
  }
}

/** Hero → quick shop → why us → story → serving ideas + FAQ teaser. */
export default async function HomePage() {
  const catalog = await loadCatalog();
  return (
    <>
      <HomeHero freshestBatch={catalog?.freshestBatch ?? null} />
      <FeaturedProducts groups={catalog?.groups ?? null} />
      <PillarsSection />
      <OriginStory />
      <EnjoySection />
      <HomeStickyCta />
    </>
  );
}
