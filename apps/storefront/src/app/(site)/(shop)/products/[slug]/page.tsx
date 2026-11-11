import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/common/JsonLd';
import { isNotFound } from '@/lib/server-api';
import { productJsonLd } from '@/lib/seo';
import { ProductDetailView, catalogApi, seoPhrases } from '@/modules/catalog';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * ISR for product pages (audit 2026-11-03, M-3). Without `generateStaticParams` a dynamic segment is
 * rendered on every request (`Cache-Control: private, no-store`). Slugs are prebuilt when the
 * backend is reachable at build time; otherwise (Docker build on a laptop) nothing is prebuilt and
 * each page is rendered on first request, then cached until the `products` / `product:<slug>` tag is
 * purged by the backend's revalidate webhook or 5 minutes pass.
 */
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const { groups } = await catalogApi.list();
    return groups.flatMap((g) => g.variants.map((v) => ({ slug: v.slug })));
  } catch {
    return [];
  }
}

async function load(slug: string) {
  try {
    return await catalogApi.detail(slug);
  } catch (err) {
    if (isNotFound(err)) notFound(); // drafts + unknown slugs
    throw err; // → error.tsx (retry)
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // Never throw notFound() from metadata: Next streams metadata, which would downgrade the 404 to 200
  const product = await catalogApi.detail(slug).catch(() => null);
  if (!product) return { title: 'Pickle not found', robots: { index: false } };
  // Long-tail phrasing from the product's own meat type + weight (audit R-17) — nothing hardcoded
  const { metaTitle, metaDescription } = seoPhrases(product);
  return {
    title: metaTitle,
    description: metaDescription,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { type: 'website', title: metaTitle, description: metaDescription, url: `/products/${product.slug}` },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await load(slug);
  return (
    <>
      <ProductDetailView product={product} />
      <JsonLd data={productJsonLd(product)} />
    </>
  );
}
