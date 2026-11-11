import { seller, site } from '@/config/site';
import { absoluteUrl } from '@/lib/seo';

/**
 * RFC 9116 security.txt (audit 2026-11-03, R-11). Static output, regenerated daily so `Expires`
 * (required, ≤ 1 year) keeps rolling forward. The contact is the published customer-care e-mail
 * when the business has set it, otherwise the contact page — never an invented address.
 */
export const dynamic = 'force-static';
export const revalidate = 86_400;

export function GET() {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months
  const contact = seller.email ? `mailto:${seller.email}` : absoluteUrl('/contact');
  const body = [
    `# ${site.name} — how to report a security issue`,
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en, hi',
    `Canonical: ${absoluteUrl('/.well-known/security.txt')}`,
    `Policy: ${absoluteUrl('/privacy-policy')}`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}
