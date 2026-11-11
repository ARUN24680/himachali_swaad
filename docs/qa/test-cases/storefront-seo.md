# Test cases — storefront: SEO, structured data, journal (audit 2026-11-03 R-17…R-22, §5.3)

Helpers: `lib/seo.ts` (`organizationJsonLd`, `breadcrumbJsonLd`, `productJsonLd`, `articleJsonLd`), `components/common/Breadcrumbs.tsx` (visible trail + JSON-LD in one component), `modules/catalog/lib/format.ts › seoPhrases`, `modules/blog`.
Run: `pnpm --filter @pk/storefront test:e2e -- tests/e2e/seo-audit.spec.ts`.

| ID | Area | Precondition | Steps | Expected | Automated test (file › name) | Manual? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| SEO-01 | Organization | — | Parse every `application/ld+json` on `/` | Valid JSON; `@graph` has `Organization` and `LocalBusiness`; Pending facts (address, phone) omitted, never faked | `seo-audit.spec.ts › Organization + LocalBusiness JSON-LD is rendered site-wide` | — |
| SEO-02 | PDP | Demo catalogue | Open the first product | `BreadcrumbList` Home › Pickles › <title> (positions 1-3, last = PDP URL); `Product` JSON-LD; `<title>` "… — Himachali <meat> pickle online" derived from meatType; canonical = `/products/<slug>` | `seo-audit.spec.ts › PDP has BreadcrumbList + Product JSON-LD, long-tail title and canonical` | — |
| SEO-03 | Listing + content pages | — | `/products`, `/about`, `/faq`, `/contact`, `/blog` | `BreadcrumbList` ending at the page; canonical = path | `seo-audit.spec.ts › <path> has BreadcrumbList JSON-LD and a canonical` | — |
| SEO-04 | Journal | — | `/blog` → first article | ≥ 2 post cards; article H1, "N min read", `Article` JSON-LD (headline, ISO `datePublished`), BreadcrumbList, canonical | `seo-audit.spec.ts › journal index lists articles and each article has Article JSON-LD + reading time` | — |
| SEO-05 | Sitemap | — | GET `/sitemap.xml` | Lists `/blog` and both article URLs | `seo-audit.spec.ts › sitemap lists the journal` | — |
| SEO-06 | Journal 404 | — | GET `/blog/no-such-article` | 404 (`dynamicParams = false`) | `seo-audit.spec.ts › unknown journal slug is a 404` | — |
| SEO-07 | Alt text | — | Inspect card photos, PDP gallery thumbs, cart + order summary lines | "<title>, <weight> jar" style alts, never empty on content images | `audit-ui.spec.ts › every product card has a stock line…` (cards) | Gallery / cart / summary: Yes |
| SEO-08 | Rich results | Staging URL public | Run Google Rich Results Test on `/`, a PDP, an article | No errors for Organization, LocalBusiness, Product, BreadcrumbList, Article | — | Yes |
| SEO-09 | Preconnect | — | Inspect `<head>` on `/checkout` and `/` | Razorpay preconnects only where `PaymentHost` renders | — | Yes |
| SEO-10 | Static pages JS | — | Build output / DevTools coverage on `/blog/<slug>`, `/about` | No client components beyond the shared chrome (cart, consent, theme) | `pnpm --filter @pk/storefront build` route table | Yes |
| R-SMK-05 | Regression: robots + sitemap | — | GET `/robots.txt`, `/sitemap.xml` | Private flows disallowed; products listed | `smoke.spec.ts › robots blocks private flows and sitemap lists products` | — |
