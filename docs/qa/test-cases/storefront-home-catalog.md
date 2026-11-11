# Test cases — storefront: home, catalogue, chrome (audit 2026-11-03 §4.2)

Scope: home hero + sticky CTA, product cards, trust strip, footer, breadcrumbs, loading / empty / error states, plus regression rows for the existing cart, checkout, consent, track, legal-footer and smoke specs.
Every Playwright spec runs at 375 / 768 / 1440 (`playwright.viewports.ts`). Run: start infra + backend + demo catalogue (`pnpm dev:infra`, `pnpm --filter @pk/backend dev`, `pnpm db:demo:seed`), then `pnpm --filter @pk/storefront test:e2e`.

| ID | Area | Precondition | Steps | Expected | Automated test (file › name) | Manual? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| HC-01 | Trust strip | Any store page | Scroll to the strip above the footer | FSSAI Lic. No., GSTIN (value or visible "Pending"), Made in Kangra, No added preservatives, Prepaid only, non-veg mark; phones scroll-snap sideways, no page overflow | `audit-ui.spec.ts › trust strip shows every compliance fact without page overflow` | — |
| HC-02 | Overflow | — | Open `/`, `/products`, `/about`, `/faq`, `/contact`, `/blog` | `scrollWidth ≤ innerWidth` at every viewport | `audit-ui.spec.ts › no horizontal overflow on <path>` | — |
| HC-03 | Footer | — | Inspect the footer | Legal links (5), Journal link, seller details block, support hours, "Prepaid orders only" payments line, Made in Kangra | `audit-ui.spec.ts › footer keeps legal links, seller facts, support hours, journal + payments line` | — |
| HC-04 | Footer social | `NEXT_PUBLIC_SOCIAL_*_URL` blank | Inspect the footer | No social block rendered (no dead links) | `audit-ui.spec.ts › social block is hidden when no social URL is configured` | — |
| HC-05 | Footer social (positive) | Set `NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL=https://…`, rebuild | Inspect footer + JSON-LD | Instagram icon link (`aria-label`, opens in new tab); URL in Organization `sameAs` | — | Yes — needs a build with the env set |
| HC-06 | Product card | Demo catalogue | `/products`, inspect every card | Stock line always visible (In stock / Only N jars left / Sold out); "₹… · 250 g jar" price unit; photo alt "<title>, <weight> jar"; ATC enabled unless sold out | `audit-ui.spec.ts › every product card has a stock line, a jar-size price unit and a descriptive photo alt` | — |
| HC-07 | Batch tag | Demo catalogue (has a LOW_STOCK variant) | Inspect cards | "Limited batch" tag only on `data-stock=LOW_STOCK` cards — never invented | `audit-ui.spec.ts › "Limited batch" tag only appears on low-stock cards` | — |
| HC-08 | Sold-out card | A SOLD_OUT variant | Inspect the card | Greyed photo + "Sold out" stamp, button disabled, size pill struck through | covered by HC-06 (disabled ATC) | Yes — visual |
| HC-09 | Breadcrumbs | — | `/products`, `/about`, `/faq`, `/contact`, `/blog` | Visible trail "Home › <page>", current page `aria-current="page"`, links ≥ 44 px on phones | `audit-ui.spec.ts › pages show visible breadcrumbs` | — |
| HC-10 | Hero + sticky CTA | 375 px | Scroll past the hero and the quick-shop cards | Hero CTAs above the fold; sticky "Shop pickles" bar slides in, hides over cards / footer; never on ≥ 768 | `audit-ui.spec.ts › phone sticky CTA appears once the hero has scrolled away`; `smoke.spec.ts › home renders hero, quick shop and pillars with no horizontal overflow` | — |
| HC-11 | Loading skeletons | Slow network (DevTools "Slow 3G") | Navigate to about, faq, contact, a legal page, track, my orders, checkout, journal | Route-level skeleton matching the page footprint (`PageSkeleton` / `CheckoutSkeleton`), `role=status` | — | Yes — skeletons flash too fast to assert reliably |
| HC-12 | Catalogue unavailable | Backend stopped, cache expired | Open `/products` | `CatalogUnavailable` state with retry, not a crash | — | Yes |
| HC-13 | Empty catalogue | All variants unpublished | Open `/products` | "The next batch is curing" empty state | — | Yes |
| HC-14 | Empty cart at checkout | Cart empty | Open `/checkout` | "Your cart is empty" + Shop pickles | — (`checkout.spec.ts` covers the filled path) | Yes |
| HC-15 | Out of stock at checkout | A cart line sells out between add and pay | Pay | "Some jars just sold out" alert, line adjusted, no order created | — | Yes (backend `checkout` integration tests cover the API) |
| HC-16 | Payment failed / window ended | — | Fail payment; let the reservation expire | Retry state "Payment not completed … No money was taken"; expired → "Payment window ended — jars released" | `checkout.spec.ts › mock "Fail payment" → retry state → same order pays` | Expired: Yes |
| HC-17 | Preconnect | — | View source on `/checkout` vs `/` | `<link rel=preconnect>` to checkout.razorpay.com + api.razorpay.com only on pages rendering `PaymentHost` | — | Yes |
| R-CART-01 | Regression: cart | Demo catalogue | Browse → variant toggle → add → reload | Cart persists | `storefront-cart.spec.ts › browse → variant toggle → add to cart → reload → cart persists` | — |
| R-CART-02 | Regression: cart | Line in cart | Remove → Undo | Line restored | `storefront-cart.spec.ts › remove with undo restores the line` | — |
| R-CART-03 | Regression: cart | — | Server adjusts quantity | Inline notice | `storefront-cart.spec.ts › server quantity adjustment is applied with an inline notice` | — |
| R-CART-04 | Regression: pincode | — | Check pincode | serviceable / not / unknown; remembered | `storefront-cart.spec.ts › pincode checker reports serviceable / not serviceable / unknown and remembers the pincode` | — |
| R-CHK-01 | Regression: checkout | Mock gateway | Cart → checkout → pay | `/order/PK-XXXXXX` confirmed | `checkout.spec.ts › cart → checkout → mock "Pay successfully" → /order/PK-XXXXXX confirmed` | — |
| R-CHK-02 | Regression: checkout | Mock gateway | Pay then close | Webhook polling confirms | `checkout.spec.ts › mock "Pay, then close browser" → order page confirms via webhook polling` | — |
| R-CON-01 | Regression: consent | Test GA4 / Pixel ids | Decline / no choice / accept / edit | Zero vendor requests until consent; AddToCart eventId shared; editable from footer | `consent.spec.ts › (4 tests)` | — |
| R-TRK-01 | Regression: track | Tracking mocks | Empty, prefill, lookup, wrong phone, 429, terminal states | As per spec | `track.spec.ts › (7 tests)` | — |
| R-LEG-01 | Regression: legal footer | — | Footer seller facts + each legal link | Resolves with the right H1, no overflow | `legal-footer.spec.ts › footer shows seller, FSSAI, GSTIN and grievance officer`, `› footer link "<name>" resolves`, `› grievance page lists officer details…` | — |
| R-SMK-01 | Regression: smoke | — | Home, quick-shop ATC, 404s, robots/sitemap | As per spec | `smoke.spec.ts › (5 tests)` | — |
| R-ACC-01 | Regression: account | OTP mock | My orders list / detail / empty | As per spec | `account-orders.spec.ts › (4 tests)`, `otp-login.spec.ts › (3 tests)`, `order-cart-clear.spec.ts › (3 tests)` | — |
