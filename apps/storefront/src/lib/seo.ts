import type { ProductDetail, StockBadge } from '@pk/shared';
import { origin, publishedSocialLinks, seller, site } from '@/config/site';
import { env } from '@/lib/env';

export const absoluteUrl = (path = '/') => new URL(path, env.NEXT_PUBLIC_SITE_URL).toString();

/** Paise → "449.00" for schema.org (string, no float maths on money). */
const paiseToDecimalString = (paise: number) =>
  `${Math.trunc(paise / 100)}.${String(Math.abs(paise % 100)).padStart(2, '0')}`;

const AVAILABILITY: Record<StockBadge, string> = {
  IN_STOCK: 'https://schema.org/InStock',
  LOW_STOCK: 'https://schema.org/LimitedAvailability',
  SOLD_OUT: 'https://schema.org/OutOfStock',
};

const ORG_ID = () => `${absoluteUrl('/')}#organization`;
const BUSINESS_ID = () => `${absoluteUrl('/')}#business`;

/**
 * Site-wide structured data (audit 2026-11-03, R-20): the brand as an `Organization` plus the shop as a
 * `LocalBusiness` (Google's "FoodEstablishment" is for places that serve food on site — wrong for a
 * pickle kitchen that ships). Facts that are still Pending (address, phone) are simply left out; the
 * postal address appears only once `NEXT_PUBLIC_SELLER_ADDRESS` is set. `sameAs` lists the published
 * social profiles only.
 */
export function organizationJsonLd() {
  const sameAs = publishedSocialLinks().map(([, url]) => url);
  const logo = absoluteUrl('/opengraph-image');
  const contactPoint =
    seller.phone || seller.email
      ? {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          areaServed: 'IN',
          availableLanguage: ['en', 'hi'],
          ...(seller.phone ? { telephone: seller.phone } : {}),
          ...(seller.email ? { email: seller.email } : {}),
        }
      : null;
  const organization = {
    '@type': 'Organization',
    '@id': ORG_ID(),
    name: site.name,
    ...(seller.legalName ? { legalName: seller.legalName } : {}),
    url: absoluteUrl('/'),
    logo,
    description: site.description,
    ...(sameAs.length ? { sameAs } : {}),
    ...(contactPoint ? { contactPoint } : {}),
  };
  const business = {
    '@type': ['LocalBusiness', 'Store'],
    '@id': BUSINESS_ID(),
    name: site.name,
    url: absoluteUrl('/'),
    image: logo,
    description: site.description,
    parentOrganization: { '@id': ORG_ID() },
    areaServed: { '@type': 'Country', name: 'IN' },
    currenciesAccepted: 'INR',
    paymentAccepted: 'UPI, credit card, debit card, net banking',
    ...(seller.phone ? { telephone: seller.phone } : {}),
    ...(seller.email ? { email: seller.email } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(seller.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: seller.address,
            addressRegion: origin.region,
            addressCountry: origin.country,
          },
        }
      : {}),
  };
  return { '@context': 'https://schema.org', '@graph': [organization, business] };
}

export interface BreadcrumbItem {
  name: string;
  /** Site-relative path, e.g. `/products`. */
  href: string;
}

/** `BreadcrumbList` for the visible breadcrumb trail (R-19). The last item is the current page. */
export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export function productJsonLd(product: ProductDetail) {
  const url = absoluteUrl(`/products/${product.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${product.title} (${product.netWeightG} g)`,
    description: product.shortDescription ?? product.description,
    image: product.images,
    sku: product.slug,
    brand: { '@type': 'Brand', name: site.name },
    weight: { '@type': 'QuantitativeValue', value: product.netWeightG, unitCode: 'GRM' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'INR',
      price: paiseToDecimalString(product.pricePaise),
      availability: AVAILABILITY[product.stockBadge],
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: seller.legalName ?? site.name },
    },
  };
}

export interface ArticleJsonLdInput {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD). */
  publishedAt: string;
  updatedAt?: string;
  image?: string;
  /** Plain-text word count for `wordCount`. */
  wordCount: number;
  keywords?: string[];
}

/** `Article` for a journal post (audit §5.3). Author/publisher are the brand, never a person. */
export function articleJsonLd(a: ArticleJsonLdInput) {
  const url = absoluteUrl(`/blog/${a.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: a.title,
    description: a.description,
    url,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt ?? a.publishedAt,
    inLanguage: 'en-IN',
    wordCount: a.wordCount,
    ...(a.keywords?.length ? { keywords: a.keywords.join(', ') } : {}),
    image: a.image ? absoluteUrl(a.image) : absoluteUrl('/opengraph-image'),
    author: { '@id': ORG_ID() },
    publisher: { '@id': ORG_ID() },
  };
}
