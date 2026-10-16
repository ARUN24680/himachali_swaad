import type { ProductListResponse } from '@pk/shared';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { catalogApi } from '@/modules/catalog';
import { FeaturedProducts, HomeHero, OriginStory, PillarsSection, TestimonialsSection } from '@/modules/home';

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

export default async function HomePage() {
  const catalog = await loadCatalog();
  const hero = catalog?.groups.flatMap((g) => g.variants).find((v) => v.images.length > 0);
  return (
    <>
      <HomeHero
        freshestBatch={catalog?.freshestBatch ?? null}
        heroImage="/home/hero-jar-studio.webp"
        heroAlt={hero ? `${hero.title} jar` : 'Pahadi Khatki pickle jar'}
      />
      <PillarsSection />
      <OriginStory />
      <FeaturedProducts groups={catalog?.groups ?? null} />
      <TestimonialsSection />
    </>
  );
}
