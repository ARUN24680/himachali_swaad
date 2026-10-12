# Security headers (Phase 10 §10.1, D-57 c)

| Header | API (`api.`) | Storefront (Vercel) | Admin (`admin.`, static) |
| :--- | :--- | :--- | :--- |
| Content-Security-Policy | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` (bull-board: own policy, framed only by app origins) | `default-src 'self'`; scripts `'self' 'unsafe-inline'` + Razorpay checkout, GA4, Meta; `connect-src` API, Razorpay, GA4, Meta, Sentry; `frame-src` Razorpay; `img-src` self, data, blob, image CDN, GA/Meta; `object-src 'none'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` (prod) | `default-src 'self'; script-src 'self'`; `connect-src 'self'` + API + Sentry; `frame-src` API (signed PDFs, bull-board); `frame-ancestors 'none'`; `object-src 'none'` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` (production only) | same (production only) | same |
| X-Content-Type-Options | `nosniff` | `nosniff` | `nosniff` |
| X-Frame-Options | `DENY` | `DENY` | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` | same | same |
| Permissions-Policy | — (JSON API) | `camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")` | `camera=(), microphone=(), geolocation=(), payment=()` |

Source: `apps/backend/src/plugins/security.ts`, `apps/backend/src/plugins/queue-dashboard.ts`,
`apps/storefront/next.config.ts`, `apps/admin/public/_headers`. Tests:
`apps/backend/tests/integration/security-hardening.test.ts`.

**After deploy:** run https://securityheaders.com and https://www.ssllabs.com/ssltest/ for all three
hosts (target A), and submit the apex domain to https://hstspreload.org once HSTS has been stable
for a few weeks.
