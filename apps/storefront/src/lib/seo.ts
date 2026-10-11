import type { ProductDetail, StockBadge } from '@pk/shared';
import { seller, site } from '@/config/site';
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

export function organizationJsonLd() {
  const contact = seller.phone ?? seller.email;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    ...(seller.legalName ? { legalName: seller.legalName } : {}),
    url: absoluteUrl('/'),
    logo: absoluteUrl('/opengraph-image'),
    description: site.description,
    ...(contact
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            areaServed: 'IN',
            ...(seller.phone ? { telephone: seller.phone } : {}),
            ...(seller.email ? { email: seller.email } : {}),
          },
        }
      : {}),
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
