import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/common/JsonLd';
import { isNotFound } from '@/lib/server-api';
import { productJsonLd } from '@/lib/seo';
import { ProductDetailView, catalogApi, formatWeight } from '@/modules/catalog';

interface Props {
  params: Promise<{ slug: string }>;
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
  const title = `${product.title} (${formatWeight(product.netWeightG)})`;
  const description = product.shortDescription ?? product.description.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { type: 'website', title, description, url: `/products/${product.slug}` },
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
