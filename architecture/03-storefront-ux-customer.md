# 🎨 03. Customer Storefront UX & Architecture (Next.js 16 + React 19)

> Storefront sirf `backend` ko call karta hai (D-05). Colors sirf semantic tokens se (`Rules/00-project-rules.md` §1.4).

---

## 🎯 Design Vision & Aesthetics
* **Theme:** Deep mountain moody atmosphere meets premium artisanal craft. System preference + toggle (D-14).
* **Palette (design reference → token mapping):** Hex values sirf designer reference ke liye hain — code me **sirf tokens**.

| Design intent | Reference hex | Token |
| :--- | :--- | :--- |
| Slate Charcoal / Dark Forest Pine base | `#121619` / `#18231E` | `--background` (dark) |
| Elevated dark surface | `#1E2522` | `--card` (dark) |
| Warm Sandstone surface | `#EAE3D2` | `--secondary` / `--muted` (light) |
| Sunlit Mountain Gold accent / CTA | `#D4A359` / `#C59B27` | `--primary`, `--ring` |
| Crisp Off-White & Cream text | — | `--foreground` (dark), `--primary-foreground` |

* **Typography:** `font-serif` (Playfair Display) for headings + `font-sans` (Inter) for body — `next/font` se self-hosted.

---

## 📱 Page Map & Component Breakdown

> **Hybrid structure (D-44, `09-codebase-structure.md` §3.2):** `app/` = sirf routing (thin pages). Feature UI `src/modules/<feature>/` me (home, catalog, cart, checkout, orders, tracking, account, content), reusable composites `src/components/common/`, primitives `@pk/ui`. E.g. `CartDrawer` → `src/modules/cart/components/CartDrawer.tsx`, cart store → `src/modules/cart/store/cart.store.ts`.

```text
apps/storefront/src/app/
├── (shop)/
│   ├── page.tsx                         # Hero, Mountain Origin Story, current batch, featured products
│   ├── products/
│   │   ├── page.tsx                     # Product grid (Chicken, Mutton, Fish)
│   │   └── [slug]/page.tsx              # Detail: 250g/500g variant toggle, ingredients, nutrition, shelf life, batch info
│   ├── about/page.tsx                   # Himachal village roots, no-preservative promise
│   ├── faq/page.tsx                     # Storage, shelf life, shipping, refunds
│   └── contact/page.tsx                 # WhatsApp, email, address, grievance officer link
├── checkout/page.tsx                    # Single-page checkout (guest allowed, D-18)
├── order/[orderCode]/page.tsx           # Polls GET /orders/:orderCode/status until CONFIRMED
├── track/page.tsx                       # Order code + phone lookup (D-39)
├── account/
│   ├── login/page.tsx                   # Phone OTP
│   ├── orders/page.tsx                  # My Orders
│   ├── orders/[orderCode]/page.tsx      # Order detail + invoice download + cancel (if allowed)
│   └── addresses/page.tsx               # Saved addresses
├── (legal)/                             # Route group (URL me "legal" nahi aata)
│   ├── privacy-policy/page.tsx
│   ├── terms/page.tsx
│   ├── refund-cancellation/page.tsx
│   ├── shipping-policy/page.tsx
│   └── grievance/page.tsx               # Consumer Protection (E-Commerce) Rules 2020
├── not-found.tsx · error.tsx
├── sitemap.ts · robots.ts               # SEO
└── layout.tsx                         # Root layout: providers, Header/Footer, global <CartDrawer /> (from modules/cart)
```

> Legal pages + contact **launch blockers** hain (Razorpay activation ke liye bhi zaroori).

---

## ⚡ Key Storefront Features

### 1. The Mountain Heritage Hero
* Parallax backdrop of snow-capped Himachal peaks with morning fog (`next/image`, AVIF/WebP, priority only for LCP image).
* Live "Small-Batch" counter: *"Batch PK-2610-CHK250-01: Only 34 jars remaining"* — sellable stock (D-24) se, `low_stock_threshold` setting se badge. Genuine scarcity, no fake timers.
* Product/stock data Server Components me `fetch` + cache tags; order/stock change par API revalidate trigger karta hai.

### 2. Fast Cart Drawer (`modules/cart/components/CartDrawer.tsx`) — D-15
* Slide-out drawer built with Radix Dialog primitive (mobile par bottom sheet).
* **Zustand + `localStorage`** guest cart → quantity change instantly UI me reflect (local state, koi network roundtrip nahi). `useOptimistic` use **nahi** hoga.
* Drawer open hone par aur checkout par **`POST /api/v1/cart/quote`**: server-side price, stock aur shipping revalidate. Agar price/stock badla → item par "updated" notice + quantity auto-adjust.
* Free Delivery progress bar: copy `freeShippingRemainingPaise` se — threshold `settings.free_shipping_threshold_paise` (Q-03), hardcoded nahi.

### 3. Frictionless Single-Screen Checkout
* **Guest checkout** (name, phone, address) — OTP optional (D-18).
* **Pincode auto-fill + serviceability:** 6-digit PIN par city/state auto-fill aur `POST /shipping/check-pincode` se estimated delivery days.
* **Prepaid only at launch (D-25):** Razorpay Standard Checkout — UPI Intent (PhonePe/GPay) default on mobile, cards, netbanking. **COD option dikhaya nahi jayega.**
* `Idempotency-Key` per checkout attempt; double-tap se double order nahi.
* Razorpay modal `timeout` = reservation bacha hua time (15 min, D-22); expire hone par clear message: *"Your jars were held for 15 minutes — please try again."*
* Consent: order updates (required) + **WhatsApp opt-in checkbox** (stored as `orders.whatsapp_opt_in` + `whatsapp_opt_in_at`; opt-in nahi toh SMS only). Marketing opt-in alag, default off — DPDP.

### 4. Order Tracking Page (`/track`) — D-39
* User enters **order code (e.g. `PK-7KQ2M9`) + phone number — dono required**. Sirf phone se lookup nahi.
* Rate-limited; mismatch par generic "Order not found".
* Timeline (`tracking_events` + status log se):
  * 🟢 Prepared in Himachal (batch code & date)
  * 🟢 Packed & Sealed
  * 🟢 Handed over to Courier (Delhivery / Bluedart, AWB + courier link)
  * 🚚 In Transit (current hub)
  * 📦 Out for Delivery
  * 🏡 Delivered
  * ⚠️ Delivery attempt failed → help CTA (WhatsApp support)
* Logged-in users ko `account/orders/[orderCode]` par same timeline bina lookup ke.

### 5. Compliance & Trust Badges (mandatory)
* **Non-veg mark** (brown circle in brown square, `--nonveg` token) har product card, detail page aur cart item par.
* **FSSAI license number** footer + product page par.
* Product page: ingredients, allergens, nutrition per 100g, net weight, MRP (incl. taxes), shelf life, storage instructions, current batch mfg date.

### 6. SEO & Analytics
* Per-product metadata, Open Graph images, JSON-LD `Product` schema, `sitemap.ts`, canonical URLs.
* Analytics (GA4 + Meta Pixel / Conversions API) **consent ke baad** load.
