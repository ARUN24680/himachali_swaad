import type { MetadataRoute } from 'next';
import { legalNav } from '@/config/navigation';
import { absoluteUrl } from '@/lib/seo';
import { catalogApi } from '@/modules/catalog';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/products'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/faq'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.4 },
    ...legalNav.map((l) => ({ url: absoluteUrl(l.href), changeFrequency: 'yearly' as const, priority: 0.2 })),
  ];
  try {
    const { groups } = await catalogApi.list();
    const products = groups.flatMap((g) => g.variants);
    return [
      ...pages,
      ...products.map((p) => ({
        url: absoluteUrl(`/products/${p.slug}`),
        changeFrequency: 'daily' as const,
        priority: 0.8,
        images: p.images.slice(0, 1),
      })),
    ];
  } catch {
    return pages; // backend down → static pages only
  }
}
