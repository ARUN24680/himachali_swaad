import type { ProductListResponse } from '@pk/shared';
import type { Metadata } from 'next';
import { catalogApi } from '@/modules/catalog';
import { EnjoySection, FeaturedProducts, HomeHero, HomeStickyCta, OriginStory, PillarsSection } from '@/modules/home';

export const metadata: Metadata = { alternates: { canonical: '/' } };

/**
 * ISR (audit 2026-11-03, M-3): the Docker image is built on a laptop with no backend, so the catalogue
 * fetch fails at build time. The previous `connection()` bail-out made the route permanently dynamic
 * (`Cache-Control: private, no-store` on every request). Now the page is static with a 60 s
 * revalidate; the backend's `/api/revalidate` webhook still purges the `products` tag instantly.
 */
export const revalidate = 60;

async function loadCatalog(): Promise<ProductListResponse | null> {
  try {
    return await catalogApi.list();
  } catch {
    // Backend unreachable: render the inline error state. It is cached for at most `revalidate`
    // seconds (ISR) and re-rendered on the next request after that.
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
