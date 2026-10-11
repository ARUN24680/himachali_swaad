# 🛍️ Phase 4: Storefront, Cart, Legal Pages, SEO & Analytics

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md` · `architecture/03-storefront-ux-customer.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 3  ·  **Migration:** —

---

## 🎯 Objective
High-converting, mountain-aesthetic **Next.js 16** storefront jo sirf `backend` se data leta hai (D-05): storytelling home, product pages with full food-compliance info, instant Zustand cart with **server quote revalidation** (D-15), pincode serviceability, **legal pages jo Razorpay live KYC ke liye zaroori hain**, SEO aur consent-based analytics (Instagram traffic ke liye Meta Pixel + Conversions API). Mobile, tablet, desktop teeno par perfect.

---

## 📋 Granular Tasks & Checklist

### 4.1 App Setup
- [x] Next.js 16 App Router + React 19, `packages/ui` tokens, fonts via `next/font` (serif headings + sans body token). — `apps/storefront/src/app/layout.tsx` (next/font Inter + Playfair, `@pk/ui` tokens)
- [x] API client (`src/lib/api.ts`): server-side `fetch` with cache tags (`products`, `product:<slug>`), envelope unwrap, typed by `packages/shared` Zod schemas. **Koi DB import nahi** (D-05) — lint rule `no-restricted-imports` for `pg`. — implemented as `lib/server-api.ts` (server fetch, tags `products` / `product:<slug>`, Zod-parsed) + `lib/api-client.ts` (browser); `pg` banned via eslint `no-restricted-imports`
- [x] Theme: `next-themes` (system default + toggle, D-14); sirf semantic tokens. — theme toggle; screenshots light + dark `Phases/evidence/phase-04/`

### 4.2 Page Map
> `app/` sirf routing hai (thin `page.tsx`) — UI sections `src/modules/<feature>/components/` me, reusable composites `src/components/common/` me (hybrid, D-44, `architecture/09-codebase-structure.md` §3.2).
```text
apps/storefront/src/app/
├── (shop)/
│   ├── page.tsx                     # Home: hero, 3 pillars, featured products, origin story, current batch badge
│   ├── products/page.tsx            # Product grid (grouped by product_group)
│   ├── products/[slug]/page.tsx     # Product detail
│   ├── about/page.tsx               # Himachal kitchen story
│   ├── faq/page.tsx
│   └── contact/page.tsx             # Phone, email, WhatsApp, address (Razorpay KYC)
├── (legal)/
│   ├── privacy-policy/page.tsx      # DPDP Act 2023 aligned consent + data use
│   ├── terms/page.tsx
│   ├── refund-cancellation/page.tsx # Q-04 policy text (food non-returnable, damage claim process)
│   ├── shipping-policy/page.tsx     # Delivery timelines, serviceable areas, free-shipping rule (Q-03)
│   └── grievance/page.tsx           # Grievance officer (Consumer Protection (E-Commerce) Rules, 2020)
├── checkout/page.tsx                # Phase 5
├── order/[orderCode]/page.tsx       # Phase 5 (success/status)
├── track/page.tsx                   # Phase 8
├── not-found.tsx · error.tsx · global-error.tsx
├── sitemap.ts · robots.ts · opengraph-image.tsx
```
- [x] Footer (har page): seller entity name + address, FSSAI license no., GSTIN, customer care, legal links — e-commerce rules ke hisaab se seller details visible. — `SiteFooter`; `legal-footer.spec.ts`. Values from `src/config/site.ts` / `NEXT_PUBLIC_SELLER_*` — **real entity/address/FSSAI/GSTIN/grievance officer still Pending (Q-02)**, shown as visible Pending badges

### 4.3 Home & Storytelling
- [x] Hero (optimised `next/image`, `priority`, fixed aspect ratio → zero CLS), serif headline, CTA "Taste the Mountains". — CLS 0 (Lighthouse reports `Phases/evidence/phase-04/lighthouse/`)
- [x] "3 Pillars of Purity" section; origin story; **current batch badge** (latest sellable batch `manufactured_at` — real data, no fake counters). — `freshestBatch` from `GET /products` (real batch, hidden when null)
- [x] Scarcity copy sirf real `stockBadge` se.

### 4.4 Product Grid & Detail
- [x] `ProductCard`: `bg-card text-card-foreground border-border rounded-xl`, **non-veg mark** (brown circle in brown-outlined square — as a token-based SVG component, `--nonveg` mapped to a semantic token in `packages/ui`, not a hardcoded hex in the component), 250g/500g toggle (same `product_group`), price + compare price + discount %, stock badge, "Add to Cart" micro-interaction. — `modules/catalog/components/ProductCard.tsx`, `NonVegMark` from `@pk/ui`; screenshots `products-*`
- [x] Grid: 1 col mobile, 2 col tablet, 3 col desktop; hover zoom desktop only.
- [x] Product detail: gallery, variant toggle, price, stock badge, ingredients, allergens, **nutrition table (per 100g)**, spice level, shelf life + storage instructions ("dry spoon, cool place"), FSSAI no., net weight, pincode checker, sticky mobile "Add to Cart" bar (thumb reach, ≥ 44px). — `ProductDetailView`; `storefront-cart.spec.ts` (variant, pincode, sticky bar); screenshots `product-detail-*`, `sticky-atc-mobile-375-light.png`

### 4.5 Cart (D-15)
- [x] Zustand store `useCartStore` with `persist` (localStorage, versioned key `pk-cart-v1`): items `{ productId, quantity }` only — **prices store nahi** (stale ho jaate hain). — `modules/cart/store`; spec asserts localStorage holds only `{productId, quantity}`
- [x] Cart drawer: Radix Dialog — mobile bottom sheet, desktop right drawer; qty +/- (max `settings.max_qty_per_item`), remove with undo toast. — `storefront-cart.spec.ts` (remove + undo); screenshots `cart-drawer-*`
- [x] **`POST /api/v1/cart/quote`** (new endpoint, `backend`): input `{ items: [{ productId, quantity }], pincode? }` → `{ items: [{ productId, title, unitPricePaise, quantity, availableQuantity, lineTotalPaise, issue?: 'OUT_OF_STOCK' | 'QTY_REDUCED' | 'INACTIVE' }], subtotalPaise, shippingFeePaise, discountPaise, totalPaise, freeShippingRemainingPaise }`. Same pricing function Phase 5 `createOrder` use karega (`quoteCart`). — `modules/cart/cart.service.ts` `quoteCart()`; `cart-quote.test.ts`
- [x] Drawer open + checkout entry par quote call (TanStack Query); issues inline dikhao ("Only 2 left — quantity updated"). — `storefront-cart.spec.ts` › server quantity adjustment applied with inline notice
- [x] **No `useOptimistic`** for cart — local state already instant hai.
- [x] Free-shipping progress bar from `freeShippingRemainingPaise` (Q-03 settings). — rendered when `freeShippingRemainingPaise` non-null; hidden while Q-03 settings are null (D-50); backend math in `cart-quote.test.ts`

### 4.6 Pincode Serviceability
- [x] `POST /api/v1/shipping/check-pincode` `{ pincode }` → `{ serviceable, estimatedDays, courierHint }`. Is phase me Shiprocket serviceability call (token mgmt basic) **ya** stub provider behind interface — full client Phase 6 me. Redis cache 24h per pincode. — stub zone provider behind `ServiceabilityProvider`, Redis 24 h cache; `shipping-analytics.test.ts`
- [x] Debounced input (6 digits), states: checking / serviceable (`success` token) / not serviceable (`destructive` token) / error. — `storefront-cart.spec.ts` › pincode checker
- [x] Last checked pincode localStorage me (checkout prefill). — same spec (remembered after reload)

### 4.7 SEO
- [x] Per-page `generateMetadata` (title, description, canonical), product **JSON-LD `Product`** (offers, price INR, availability from stock badge), `Organization` JSON-LD. — JSON-LD Product + Organization in PDP/layout HTML; FAQPage on /faq
- [x] `sitemap.ts` (products from API), `robots.ts` (block `/checkout`, `/order`, `/track`). — `smoke.spec.ts` (robots disallows, sitemap lists products)
- [x] OG images (dynamic for products). — `app/opengraph-image.tsx` + `products/[slug]/opengraph-image.tsx`

### 4.8 Analytics & Consent
- [x] Cookie/consent banner (DPDP-aligned): analytics/marketing scripts **sirf consent ke baad** load. — `consent.spec.ts`; screenshots `consent-banner-*`
- [x] GA4 + Meta Pixel events: `view_item`, `add_to_cart`, `begin_checkout` (purchase Phase 5 me). — `consent.spec.ts` › accepting loads vendors + relays AddToCart (ran on a fresh build with test ids; CI)
- [x] **Meta Conversions API** server-side endpoint scaffold (`backend`, hashed identifiers, event_id dedup with Pixel) — `Purchase` event Phase 5 me fire hoga. — `integrations/meta/conversions.ts` (+ `hashForMeta`), `POST /analytics/events`; `conversions.test.ts`, `shipping-analytics.test.ts`

### 4.9 Quality
- [x] Skeleton loaders, empty states, error boundaries.
- [x] Accessibility: focus rings (`ring` token), labels, contrast check both themes. — Lighthouse a11y 96–100; contrast issue fixed (pillar numerals)

---

## 🚫 Out of Scope
- Checkout form, Razorpay, order success page logic → **Phase 5**.
- `/track`, My Orders → **Phase 8**.
- Coupons, reviews → **v2**.
- Full Shiprocket client → **Phase 6**.

---

## 🔍 Verification Checklist
- [ ] Lighthouse mobile: Performance > 90, CLS < 0.05 on home + product detail (CI Lighthouse run or recorded report). — devtools throttling (Slow 4G, 4× CPU): **99 / 99**, LCP 1.7 s, CLS 0 (home, PDP); simulated Lantern on localhost: 85 / 85 (LCP 4.4 s est.). Reports in `Phases/evidence/phase-04/lighthouse/`. **Re-run on the deployed URL (Phase 10) before ticking.**
- [x] Playwright: browse → variant toggle → add to cart → reload → cart persists; at 375 / 768 / 1440, **no horizontal overflow** (`document.documentElement.scrollWidth <= innerWidth` assertion). — `storefront-cart.spec.ts` at 375/768/1440 with overflow assertion
- [x] Quote endpoint: price change in DB → drawer shows new price; stock reduced → `QTY_REDUCED` issue (integration test `cart-quote.test.ts`). — `cart-quote.test.ts`
- [x] Storefront bundle/imports me `pg` nahi (lint + build check). — eslint `no-restricted-imports` (pg) + `pnpm --filter @pk/storefront build` green
- [ ] Saare legal pages + contact live, footer me FSSAI/GSTIN/grievance officer (Playwright link check) — **Razorpay KYC submission ke liye ready**. — pages + footer links live and tested (`legal-footer.spec.ts`), but **legal copy is a draft and seller facts are Pending (Q-02/Q-03/Q-04)** — needs business + lawyer review before Razorpay KYC
- [ ] Product JSON-LD Google Rich Results test pass (manual evidence). — JSON-LD present in PDP HTML; **manual Rich Results test needs a public URL (deploy)**
- [x] Consent decline par GA4/Pixel network requests zero (Playwright network assertion). — `consent.spec.ts` › declining / no choice ⇒ zero requests
- [x] Hardcoded color lint clean; light/dark toggle par saare pages correct. — `pnpm check:colors` ✔ (only `og-palette.ts` / theme-color, D-51); light/dark screenshots

---

## ✅ Definition of Done
Customer mobile par products explore karke cart bana sakta hai jo hamesha server-verified price/stock dikhata hai; legal + contact pages Razorpay live KYC ke liye ready hain; SEO aur consent-based tracking launch campaigns ke liye wired hain.
