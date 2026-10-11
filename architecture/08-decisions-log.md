# 🧭 08. Architecture Decisions Log (ADR-Lite)

> Yeh file har bade technical/business decision ka **single source of truth** hai. Agar kisi doc aur is file me conflict ho, toh **yeh file jeetegi** — aur us doc ko fix karna hai.
> Har decision ka status: `ACCEPTED` (final), `PROPOSED` (default chal raha hai, business confirm kare), `OPEN` (decide karna baaki — Phase 0 me close karna hai).

---

## ⚙️ A. Tech Stack & Platform

| ID | Decision | Status | Rationale |
| :--- | :--- | :--- | :--- |
| **D-01** | **Pure Raw SQL (`pg`), Zero-ORM.** Migrations **`dbmate`** se (plain `.sql` files, `-- migrate:up` / `-- migrate:down`). | ACCEPTED | ORM nahi, lekin migration versioning, rollback aur CI apply ke liye tested tool chahiye. Hand-rolled runner nahi. |
| **D-02** | API framework: **Fastify 5 + TypeScript** (`fastify-type-provider-zod`). Express nahi. | ACCEPTED | Schema-first validation, high throughput, raw-body webhook support via `addContentTypeParser`. |
| **D-03** | Versions (minimum; Phase 1 me exact latest stable pin karna): **Node.js 24 LTS, Next.js 16, React 19.x, Vite (latest), Tailwind CSS v4, Zod 4, PostgreSQL 17, Redis 7+, TanStack Query v5, Zustand v5, BullMQ (latest).** | ACCEPTED | Purane docs me Next 15 / Node 22 / Zod 3 / PG 16 the — 2026 me naye project ke liye outdated. |
| **D-04** | **pnpm workspaces + Turborepo.** | ACCEPTED | Fast, strict dependency isolation. |
| **D-05** | **Storefront kabhi DB se direct baat nahi karega.** Next.js sirf `backend` ko call karega (Server Components me `fetch` + cache tags). | ACCEPTED | Ek hi jagah business logic, DB pool explosion nahi (serverless), security boundary clear. |
| **D-06** | `backend` ke **do entrypoints**: `src/server.ts` (HTTP) aur `src/worker.ts` (BullMQ workers + cron). Same codebase, **alag process** me deploy. | ACCEPTED | Heavy jobs HTTP latency ko affect na karein; code sharing bina extra package ke. |
| **D-07** | Raw SQL type-safety: har query ka result **Zod schema se parse** hoga (`packages/shared`), ya `pgtyped` adopt karein (Phase 1 me spike). | PROPOSED | Raw SQL me compile-time types nahi milte; runtime parse se silent bugs nahi aate. |
| **D-08** | Testing: **Vitest** (unit/integration) + **Testcontainers** (real PostgreSQL + Redis) + **Playwright** (E2E, 375/768/1440 viewports). | ACCEPTED | Concurrency aur transactions mock DB par test nahi ho sakte. |
| **D-09** | Observability: **pino** structured logs, **Sentry** (FE + BE), uptime monitor, **bull-board** (admin-only) queue dashboard. | ACCEPTED | Production me bina logs/alerts ke order drop ka pata nahi chalega. |
| **D-10** | Hosting: Storefront → Vercel; API + Worker → container host (Railway / Render / Fly / AWS ECS); **Managed PostgreSQL with PITR backups**; **Managed Redis with persistent TCP connections** (BullMQ ke liye per-request-priced Redis avoid). | PROPOSED | Final vendor Phase 0 me cost dekh kar. |
| **D-11** | File storage: Cloudflare R2. **Product images = public bucket/CDN.** **Shipping labels, invoices, settlement PDFs = PRIVATE bucket + short-lived signed URLs (5 min).** | ACCEPTED | Labels/invoices me customer ka naam, phone, address hai — public URL = PII leak. |
| **D-47** | **Toolchain (Phase 1):** pnpm 12 + `minimumReleaseAge` 7 din (supply-chain guard) + `allowBuilds` allow-list; **TypeScript 6.0.3** (7.x typescript-eslint support nahi karta); sab workspaces `moduleResolution: Bundler`; `@pk/shared` / `@pk/ui` **Just-in-Time packages** (TS source export, koi build step nahi) — Next `transpilePackages`, Vite native, backend production build **esbuild bundle** (`@pk/*` inline, npm deps external). ESLint + Prettier (Biome nahi). | ACCEPTED | Ek hi resolution model sab jagah; shared code edit par rebuild nahi; latest-day releases (compromised package risk) se bachav. |
| **D-43** | **App naming + backend code pattern (Nexus standard):** apps = `apps/backend` (Fastify API + worker), `apps/storefront` (Next.js), `apps/admin` (Vite admin + partner PWA) — purane naam `api-server` / `admin-portal` replace. Backend har domain ek module: `<module>.routes.ts → .controller.ts → .service.ts → .repository.ts (+ .validation.ts)`; external clients `src/integrations/`, jobs `src/jobs/`. Layer rules: `09-codebase-structure.md` §2. | ACCEPTED | Project Nexus ka proven layout reuse — predictable files, SQL sirf repository me, transactions sirf service me. Stack (D-02, D-04, D-05) unchanged. |
| **D-44** | **Hybrid frontend architecture** (dono apps): 3 layers — primitives `packages/ui` → app-level `src/components/common` → feature modules `src/modules/<feature>/{components,hooks,api,store,pages}` + `index.ts` public API. Storefront `app/` sirf routing. Import direction one-way, cross-module sirf `index.ts` se (ESLint enforce, Phase 1). | ACCEPTED | Pure component-based bade project me bikhar jata hai, pure feature-based me common UI duplicate hota hai. |
| **D-45** | Workspace package scope **`@pk/*`** (`@pk/backend`, `@pk/storefront`, `@pk/admin`, `@pk/shared`, `@pk/database`, `@pk/ui`, `@pk/tsconfig`). | ACCEPTED | Short, consistent imports. |

---

## 🎨 B. Frontend & Design

| ID | Decision | Status | Rationale |
| :--- | :--- | :--- | :--- |
| **D-12** | **Tailwind v4 CSS-first config** (`@theme inline`) + shadcn/ui (Tailwind v4 version). Tokens `Rules/00-project-rules.md` §1.4 me defined. | ACCEPTED | v3/v4 ambiguity khatam. |
| **D-13** | Status badges ke liye semantic tokens **`--success`, `--warning`, `--info`** add kiye gaye (destructive pehle se tha). | ACCEPTED | Hardcoded colors banned hain, toh "Delivered = green" ke liye token zaroori tha. |
| **D-14** | Theme: dono apps **system preference follow** karenge + manual toggle (`next-themes` storefront me). | PROPOSED | Brand imagery dono modes me kaam kare. |
| **D-15** | **Cart = Zustand + `localStorage`** (guest cart). `useOptimistic` cart ke liye **use nahi hoga** (koi server round-trip nahi hai). Cart drawer khulne par aur checkout par `POST /api/v1/cart/quote` server-side price + stock revalidate karega. | ACCEPTED | Local state already instant hai; asli risk stale price/stock hai. |
| **D-16** | Partner Packing Desk ek **PWA** hoga (installable, push notifications, Hindi + English i18n). | ACCEPTED | Partner phone par kaam karta hai; naye order ka alert zaroori. |
| **D-46** | **Theme palette = Stitch "The Himalayan Pantry" se derived**, WCAG AA contrast-checked (light + dark). Changes vs purane Rules tokens: `--primary-foreground` **charcoal** (white on gold ≈ 2.3:1 fail tha); `--secondary` = **Deep Pine** CTA (pehle sandstone); naya **`--tertiary`** (Terracotta), **`--overlay`**, **`--shadow-float`**; `--input` hairline se alag (form boundary ≥ 3:1); `--ring` darker gold; gold text ke liye `text-accent-foreground` (`text-primary` light bg par banned). Dark mode alag design kiya (pine-night), inverted nahi. Values: `packages/ui/src/styles/globals.css`. | ACCEPTED | Stitch design ka mood rakhte hue accessibility pass karna; purane tokens me CTA text contrast fail tha. User ne preview approve kiya (2026-10-11). |

---

## 🔐 C. Auth & Roles

| ID | Decision | Status | Rationale |
| :--- | :--- | :--- | :--- |
| **D-17** | Roles: **`CUSTOMER`, `ADMIN`, `KITCHEN_PARTNER`**. City-based names (`ADMIN_CHENNAI`, `PARTNER_HIMACHAL`) hata diye. Partner kis kitchen ka hai woh `user_pickup_locations` table se. | ACCEPTED | Future me doosra kitchen / doosra admin add karna bina enum change ke. |
| **D-18** | **Guest checkout allowed** (phone + address required, OTP nahi). **OTP login optional** — "My Orders", saved addresses ke liye. | PROPOSED | Prepaid-only launch me fake-order risk kam hai; checkout friction minimum. |
| **D-19** | Staff login: **email + password (bcrypt cost 12)**; ADMIN ke liye **TOTP 2FA** (Phase 10 se pehle mandatory). Magic link nahi. | ACCEPTED | Ek hi method, simple + secure. |
| **D-20** | Session: **access token (JWT, 15 min) + refresh token (opaque, 30 din, rotating, reuse-detection)** — **dono httpOnly cookies**. Cookie `Domain=.pahadikhatki.in`, `SameSite=Lax`, `Secure`. Mutating requests par `Origin` header check (CSRF defence). Refresh tokens DB me **hash** karke (`refresh_tokens` table). | ACCEPTED | Headers + localStorage me token rakhna XSS risk; revocation ke liye DB record chahiye. |
| **D-21** | OTP: 6-digit, Redis TTL 5 min, **max 5 verify attempts per OTP**, send limit 3 / 10 min per phone + per-IP limit. Provider interface: `MockOtpProvider`, `Msg91Provider` (**TRAI DLT registration mandatory**), `WhatsAppOtpProvider`. | ACCEPTED | Brute-force aur SMS-pumping fraud protection. |
| **D-48** | **Auth hardening details (Phase 2):** (a) OTP login sirf `CUSTOMER` ke liye — staff ya deactivated user ka phone OTP se kabhi login nahi karega (`ON CONFLICT … DO UPDATE … WHERE role = 'CUSTOMER' AND is_active`); doc 01/02 ka plain upsert staff account ko OTP se kholne deta. (b) Refresh **race grace 10 s**: rotate hua token 10 s ke andar dobara aaye (do tabs ek saath refresh) → `401 reason: race`, family revoke **nahi**; 10 s ke baad = reuse → poori family revoke + audit. (c) CSRF: mutating request me `Origin` **missing ho toh bhi 403** — Next.js server-side mutations ko `Origin` header bhejna hoga. (d) OTP code Redis me sirf HMAC hash; 30 s resend cooldown + 3 sends / 10 min / phone. | ACCEPTED | (a) privilege escalation band; (b) admin multi-tab par galat logout nahi; (c) strict default safer hai. |

---

## 🛒 D. Commerce, Orders & Inventory

| ID | Decision | Status | Rationale |
| :--- | :--- | :--- | :--- |
| **D-22** | **Stock reservation DB me hoga (Redis me nahi)** — `POST /checkout/create-order` par stock `inventory_batches` se reserve (`order_item_allocations.status = RESERVED`), **TTL 15 min** (`RESERVATION_TTL_MINUTES`). Payment par `COMMITTED`. Expiry sweeper (har 1 min) unpaid orders ko `EXPIRED` karke stock release karta hai. Late payment → re-reserve try, warna **auto-refund**. Details: `07-order-state-machine.md`. | ACCEPTED | Redis + DB do sources of truth = drift. Small-batch scarcity me "paid but out of stock" sabse bura experience hai. |
| **D-23** | **FIFO by expiry**: allocation `ORDER BY expiry_date ASC, manufactured_at ASC`, **multiple batches me split** allowed (`order_item_allocations`). Locks hamesha `product_id` sorted order me (deadlock prevention). | ACCEPTED | Purani query split nahi karti thi aur expired batch bhi bech deti thi. |
| **D-24** | **Sellable shelf-life rule**: batch tabhi bikega jab `expiry_date >= CURRENT_DATE + min_remaining_shelf_days + transit_buffer_days` (settings: default **45 + 7**). | PROPOSED | FSSAI e-commerce guideline delivery par minimum remaining shelf-life maangti hai (30% ya 45 din) — exact clause FSSAI consultant se confirm karna. |
| **D-25** | **Launch = Prepaid only.** COD v2 me, `settings.cod_enabled` flag ke peeche (aur COD par RTO risk analysis ke baad). | PROPOSED | COD me RTO 20–30% tak, perishable product ke liye loss. |
| **D-26** | **Money = integer paise (`BIGINT`)** har jagah (DB, API, Zod). Prices **GST-inclusive** (MRP). Tax portion order par alag store hoga. | ACCEPTED | Razorpay paise me kaam karta hai; floating/decimal rounding bugs khatam. |
| **D-27** | **Order code** = `PK-` + 6 chars **Crockford Base32** (no `I L O U`), e.g. `PK-7KQ2M9`. `UNIQUE` violation par max 5 retries. | ACCEPTED | Purane docs me 4/5 digit, numeric/alphanumeric mix tha. |
| **D-28** | **Order status aur payment status alag columns** (`orders.status`, `orders.payment_status`). Shipment detail `shipments` + `tracking_events` me. | ACCEPTED | Ek enum me payment + fulfilment mix karne se refund/RTO states represent nahi hote. |
| **D-29** | **Har status change sirf `transitionOrder()` function se** (allowed-transitions map `packages/shared` me). Direct `UPDATE orders SET status` banned. | ACCEPTED | State machine enforce + audit log guaranteed. |
| **D-30** | **External API calls (Razorpay, Shiprocket, WhatsApp) kabhi DB transaction ke andar nahi.** Pattern: commit → call → second short transaction. | ACCEPTED | Network latency ke dauran row locks + pool connection hold hote hain. |
| **D-31** | RTO wapas aaye jars **restock nahi honge** (food safety) → `WASTAGE` movement. Sirf `PACKED`/`PICKUP_SCHEDULED` stage par cancel hue (kitchen se nikle hi nahi) jars restock. | ACCEPTED | Transit me temperature abuse ho chuka ho sakta hai. |
| **D-42** | **Batch code server generate karega**: `PK-<YYMM>-<SKU>-<2-digit seq>`, e.g. `PK-2610-CHK250-01`. Partner batch entry me sirf product, quantity, total cost (+ optional mfg date) deta hai; `cost_per_unit` DB generated column. | ACCEPTED | Purane docs me `PK-OCT26-B1`, `PK-2026-OCT-CH01` jaise 3 alag formats aur `costPerUnit` vs total cost ka mismatch tha. |
| **D-49** | **Catalog/inventory details (Phase 3):** (a) Draft products allowed without `gst_rate_bp` / `shelf_life_days` / `ingredients` / `packed_weight_g` (doc 01 had them `NOT NULL`, but the phase seeds drafts before Q-01/Q-07/D-34 close) — `products_publishable` CHECK + API `422 VALIDATION_FAILED { missing }` enforce them (with `nutrition` + ≥ 1 image) before publish; a live product can't lose them. (b) "Today" = **IST calendar day** via SQL `ist_today()` / `todayInIST()` — `CURRENT_DATE` on a UTC server is a day behind 00:00–05:30 IST. (c) `KITCHEN_PARTNER` may adjust stock (ADJUSTMENT/WASTAGE) for **own kitchen only** — phase 3 file + checklist; doc 02 said ADMIN only. (d) Stock badge values `IN_STOCK` / `LOW_STOCK` / `SOLD_OUT`; shelf filter `FRESH` / `AGING` / `NOT_SELLABLE` / `EXPIRED` (doc 02 had `LOW` / `SELLABLE`). (e) New error codes `VALIDATION_FAILED` 422, `INSUFFICIENT_STOCK` 409, `DUPLICATE` 409. (f) SKU immutable after create (batch codes embed it). (g) Batch seq via `pg_advisory_xact_lock(prefix)` + MAX, UNIQUE as backstop. (h) Images: R2 presign signs Content-Type **and** Content-Length (R2 has no POST size policy); dev/test use a local-disk driver behind the same interface (`STORAGE_DRIVER=local`, refused in production). (i) Storefront freshness: backend → `POST /api/revalidate` (shared secret) → `revalidateTag('products', 'max')` after COMMIT. | ACCEPTED | Docs ke beech conflicts resolve kiye (a, c, d); (b) FSSAI shelf-life boundary ek din galat na ho; (h) bina cloud creds ke local upload flow test ho sake. |
| **D-32** | **Tax invoice** har confirmed order par worker generate karega (PDF → private R2). Number format `PK/<FY>/<6-digit seq>` e.g. `PK/2026-27/000123`, `invoice_sequences` table se row-lock ke saath. | ACCEPTED | GST compliance + Shiprocket ko invoice chahiye. |

---

## 🚚 E. Logistics & Notifications

| ID | Decision | Status | Rationale |
| :--- | :--- | :--- | :--- |
| **D-33** | Package dimensions/weight **product-level columns** (`products.packed_weight_g`, `package_*_cm`). Single-jar standard box: **15 × 10 × 10 cm** (SOP §Procurement). Multi-jar orders: box-size rules table Phase 6 me. | ACCEPTED | SOP aur Phase 6 me alag dimensions the. |
| **D-34** | **Target: 250g SKU ka packed weight ≤ 500g** (jar + box + bubble). | PROPOSED | 500g slab cross karte hi har order par next slab ka courier charge. |
| **D-35** | Shiprocket tracking ka source **Shiprocket webhook** (`POST /api/v1/webhooks/shiprocket`, `x-api-key` header verify) + **har 3 ghante polling fallback** active shipments ke liye. | ACCEPTED | `/track` page purely webhook par depend tha, aur webhook route spec me tha hi nahi. |
| **D-36** | Pickup: partner `PACKED` mark kare → shipment pickup request; **daily cut-off 11:00 AM IST** ke baad wale next day. | PROPOSED | Courier ek din me ek baar aata hai; har order par alag pickup ka koi fayda nahi. |
| **D-37** | Label printing: **4×6 inch PDF** browser print / share-sheet / printer ki companion app se. **Web Bluetooth direct printing scope me nahi** (iOS support nahi). | ACCEPTED | Realistic feasibility. |
| **D-38** | Notifications: **WhatsApp (Cloud API ya BSP — Gupshup/Interakt)** primary, SMS fallback. Customer **aur** partner/admin dono ko alerts. Har message `notifications_log` me. | OPEN | BSP vs direct Cloud API Phase 0 me approval speed aur cost dekh kar. |
| **D-39** | `/track` lookup ke liye **order code + phone number dono** required, rate-limited (10 / 10 min per IP). Sirf phone se lookup nahi. | ACCEPTED | Privacy — koi bhi kisi ka naam/city na dekh sake. |

---

## 💰 F. Partnership & Settlements

| ID | Decision | Status | Rationale |
| :--- | :--- | :--- | :--- |
| **D-40** | **Partner apna settlement statement dekh sakta hai** (read-only, finalized cycles, line items + expenses), aur "Acknowledge" kar sakta hai. Partner **nahi** dekh sakta: live revenue dashboard, customer list, ad-account controls, settings. Settlement create/finalize/mark-paid sirf `ADMIN`. | ACCEPTED | 50/50 partner ko apna hissa transparent dikhna chahiye — purane docs me contradiction tha. |
| **D-41** | **Settlement formula** (per order, GST-exclusive): `Net = Revenue_ex_GST − Raw_Cost (batch cost_per_unit × qty) − Packaging_Cost − Actual_Freight − Gateway_Fee (incl. GST on fee) − Refunds − RTO_Freight`; cycle level par `− Shared_Expenses (ads etc.)`. Split `settlements.partner_split_bp` (default 5000 = 50%). Worked example: `04-admin-operations-portal.md`. | PROPOSED | Purane example me GST, packaging, gateway GST, RTO aur ads missing the — profit inflated dikh raha tha. |

---

## ❓ G. OPEN Questions (Phase 0 me business ko close karne hain)

| ID | Question | Owner |
| :--- | :--- | :--- |
| **Q-01** | Pickle (HSN 2001) ka current GST rate (Sept 2025 rationalisation ke baad) — CA se confirm. | Admin + CA |
| **Q-02** | Kaunsi legal entity FSSAI + GST hold karegi? (Partnership deed / LLP.) Manufacturer = Himachal kitchen, seller = ? | Dono partners |
| **Q-03** | Free-shipping threshold (₹ amount vs jar count). | Admin |
| **Q-04** | Prepaid RTO refund policy (full refund vs minus freight). Transit damage policy (unboxing video required?). | Admin |
| **Q-05** | Settlement cycle: weekly ya monthly? | Dono partners |
| **Q-06** | WhatsApp: direct Cloud API vs BSP (D-38). | Admin |
| **Q-07** | Shelf-life lab result ke baad actual `shelf_life_days` per product. | Kitchen Partner |
