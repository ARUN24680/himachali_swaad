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
- [ ] Next.js 16 App Router + React 19, `packages/ui` tokens, fonts via `next/font` (serif headings + sans body token).
- [ ] API client (`src/lib/api.ts`): server-side `fetch` with cache tags (`products`, `product:<slug>`), envelope unwrap, typed by `packages/shared` Zod schemas. **Koi DB import nahi** (D-05) — lint rule `no-restricted-imports` for `pg`.
- [ ] Theme: `next-themes` (system default + toggle, D-14); sirf semantic tokens.

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
- [ ] Footer (har page): seller entity name + address, FSSAI license no., GSTIN, customer care, legal links — e-commerce rules ke hisaab se seller details visible.

### 4.3 Home & Storytelling
- [ ] Hero (optimised `next/image`, `priority`, fixed aspect ratio → zero CLS), serif headline, CTA "Taste the Mountains".
- [ ] "3 Pillars of Purity" section; origin story; **current batch badge** (latest sellable batch `manufactured_at` — real data, no fake counters).
- [ ] Scarcity copy sirf real `stockBadge` se.

### 4.4 Product Grid & Detail
- [ ] `ProductCard`: `bg-card text-card-foreground border-border rounded-xl`, **non-veg mark** (brown circle in brown-outlined square — as a token-based SVG component, `--nonveg` mapped to a semantic token in `packages/ui`, not a hardcoded hex in the component), 250g/500g toggle (same `product_group`), price + compare price + discount %, stock badge, "Add to Cart" micro-interaction.
- [ ] Grid: 1 col mobile, 2 col tablet, 3 col desktop; hover zoom desktop only.
- [ ] Product detail: gallery, variant toggle, price, stock badge, ingredients, allergens, **nutrition table (per 100g)**, spice level, shelf life + storage instructions ("dry spoon, cool place"), FSSAI no., net weight, pincode checker, sticky mobile "Add to Cart" bar (thumb reach, ≥ 44px).

### 4.5 Cart (D-15)
- [ ] Zustand store `useCartStore` with `persist` (localStorage, versioned key `pk-cart-v1`): items `{ productId, quantity }` only — **prices store nahi** (stale ho jaate hain).
- [ ] Cart drawer: Radix Dialog — mobile bottom sheet, desktop right drawer; qty +/- (max `settings.max_qty_per_item`), remove with undo toast.
- [ ] **`POST /api/v1/cart/quote`** (new endpoint, `backend`): input `{ items: [{ productId, quantity }], pincode? }` → `{ items: [{ productId, title, unitPricePaise, quantity, availableQuantity, lineTotalPaise, issue?: 'OUT_OF_STOCK' | 'QTY_REDUCED' | 'INACTIVE' }], subtotalPaise, shippingFeePaise, discountPaise, totalPaise, freeShippingRemainingPaise }`. Same pricing function Phase 5 `createOrder` use karega (`quoteCart`).
- [ ] Drawer open + checkout entry par quote call (TanStack Query); issues inline dikhao ("Only 2 left — quantity updated").
- [ ] **No `useOptimistic`** for cart — local state already instant hai.
- [ ] Free-shipping progress bar from `freeShippingRemainingPaise` (Q-03 settings).

### 4.6 Pincode Serviceability
- [ ] `POST /api/v1/shipping/check-pincode` `{ pincode }` → `{ serviceable, estimatedDays, courierHint }`. Is phase me Shiprocket serviceability call (token mgmt basic) **ya** stub provider behind interface — full client Phase 6 me. Redis cache 24h per pincode.
- [ ] Debounced input (6 digits), states: checking / serviceable (`success` token) / not serviceable (`destructive` token) / error.
- [ ] Last checked pincode localStorage me (checkout prefill).

### 4.7 SEO
- [ ] Per-page `generateMetadata` (title, description, canonical), product **JSON-LD `Product`** (offers, price INR, availability from stock badge), `Organization` JSON-LD.
- [ ] `sitemap.ts` (products from API), `robots.ts` (block `/checkout`, `/order`, `/track`).
- [ ] OG images (dynamic for products).

### 4.8 Analytics & Consent
- [ ] Cookie/consent banner (DPDP-aligned): analytics/marketing scripts **sirf consent ke baad** load.
- [ ] GA4 + Meta Pixel events: `view_item`, `add_to_cart`, `begin_checkout` (purchase Phase 5 me).
- [ ] **Meta Conversions API** server-side endpoint scaffold (`backend`, hashed identifiers, event_id dedup with Pixel) — `Purchase` event Phase 5 me fire hoga.

### 4.9 Quality
- [ ] Skeleton loaders, empty states, error boundaries.
- [ ] Accessibility: focus rings (`ring` token), labels, contrast check both themes.

---

## 🚫 Out of Scope
- Checkout form, Razorpay, order success page logic → **Phase 5**.
- `/track`, My Orders → **Phase 8**.
- Coupons, reviews → **v2**.
- Full Shiprocket client → **Phase 6**.

---

## 🔍 Verification Checklist
- [ ] Lighthouse mobile: Performance > 90, CLS < 0.05 on home + product detail (CI Lighthouse run or recorded report).
- [ ] Playwright: browse → variant toggle → add to cart → reload → cart persists; at 375 / 768 / 1440, **no horizontal overflow** (`document.documentElement.scrollWidth <= innerWidth` assertion).
- [ ] Quote endpoint: price change in DB → drawer shows new price; stock reduced → `QTY_REDUCED` issue (integration test `cart-quote.test.ts`).
- [ ] Storefront bundle/imports me `pg` nahi (lint + build check).
- [ ] Saare legal pages + contact live, footer me FSSAI/GSTIN/grievance officer (Playwright link check) — **Razorpay KYC submission ke liye ready**.
- [ ] Product JSON-LD Google Rich Results test pass (manual evidence).
- [ ] Consent decline par GA4/Pixel network requests zero (Playwright network assertion).
- [ ] Hardcoded color lint clean; light/dark toggle par saare pages correct.

---

## ✅ Definition of Done
Customer mobile par products explore karke cart bana sakta hai jo hamesha server-verified price/stock dikhata hai; legal + contact pages Razorpay live KYC ke liye ready hain; SEO aur consent-based tracking launch campaigns ke liye wired hain.
