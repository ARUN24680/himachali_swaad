# 📜 Pahadi Khatki — Engineering, UI/UX & Architectural Rules (The Source of Truth)

> **CRITICAL INSTRUCTION FOR ALL DEVELOPMENT PHASES:**
> Yeh file project ke har ek phase, module aur component ke liye **MANDATORY CONSTITUTION (SURVIVAL RULES)** hai.
> Jab bhi koi phase execute kiya jaye, us phase ka har ek line of code (Frontend, Backend, Database, Styling, UX) in rules ke 100% compliance mein hona chahiye. Koi bhi shortcut ya deviation allowed nahi hai.

> **⚖️ Decisions Override:** Specific technical/business decisions (versions, roles, reservation model, COD, settlement formula, etc.) **`architecture/08-decisions-log.md`** me hain. Agar kisi doc aur decisions log me conflict ho, **decisions log jeetega** — conflict ko report karo aur us doc ko fix karo.

---

## 🎨 1. Frontend & Design Architecture Rules

### 1.1 Responsive Design Across All Devices (Mobile First, Tab & Desktop Perfection)
* **Mobile-First Priority:** Customer storefront ho ya Kitchen Partner Packing Desk, 80%+ traffic mobile se aayega. Mobile UX kisi bhi haalat me cramped ya broken nahi hona chahiye.
* **The 3-Screen Viewport Mandate:**
  * **Mobile (`< 640px`):** Bottom sheets/drawers for cart & filters, sticky thumb-reachable CTA bars ("Buy Now"), minimal header, touch target size minimum `44px x 44px`.
  * **Tablet (`640px - 1024px`):** 2-column responsive layout, smooth sliding sidebars, balanced typography.
  * **Desktop / Web (`> 1024px`):** Full widescreen aesthetic, high-density order data tables, multi-column storytelling layout, generous whitespace.
* **No Horizontal Overflow:** Kisi bhi device ya screen size par horizontal scroll nahi aana chahiye (`overflow-x-hidden` root par + har table apne container me scroll kare).
* **Accessibility:** Radix primitives ke keyboard/focus behaviour ko override mat karo; har icon-only button par `aria-label`; text contrast WCAG AA.

### 1.2 Strict UI Component Stack (No Random 3rd-Party UI Bloat)
* **Allowed Styling:** **Tailwind CSS v4 ONLY** (CSS-first config, semantic tokens) (D-12).
* **Allowed UI Primitives:** **shadcn/ui (Tailwind v4 version) + Radix UI Primitives ONLY** (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-accordion`, etc.).
* **Allowed Icons:** **Lucide React (`lucide-react`) ONLY**.
* **STRICT BAN:**
  * ❌ Material UI (MUI), Bootstrap, Ant Design, Chakra UI, ya koi bhi heavy component library use karna strictly prohibited hai.
  * ❌ Ad-hoc inline CSS ya raw random external CSS files strictly banned hain.

### 1.3 Aesthetics, Theme & Branding
* **Mountain Artisanal Aesthetic:** Visual tone pure, organic, aur mountain-rooted hona chahiye (Earthy forest tones, slate darks, warm terracotta, sun-gold accents, cream/off-white text).
* **Theme Adaptability (Light & Dark Mode):** Dono apps system preference follow karenge + manual toggle (D-14).
  * Semantic color utility tokens use karo (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`).
  * Never hardcode static colors like `bg-[#000]` or `text-black` directly on core components.
* **Micro-Interactions & Feel:**
  * Button hovers, active tap states, skeleton loaders while data fetching, empty states with helpful illustrations.
  * UI should feel alive, snappy, aur premium.

### 1.4 🎨 Generic Global Theme Palette System (Single Source of Truth — Tailwind v4)
> **MANDATORY RULE:** Kisi bhi component (Button, Card, Badge, Modal, Input, Text, Border, Background) me color hardcode nahi kiya jayega. Poore project ka rang-roop ek single file (`packages/ui/src/styles/globals.css`) se control hoga. Palette me ek variable change karte hi poore project ke buttons, cards, headings aur accents instant update ho jayenge.

* **Token values ka single source:** [`packages/ui/src/styles/globals.css`](../packages/ui/src/styles/globals.css) (Tailwind v4 CSS-first, `@theme inline` mapping, `.dark` overrides). Palette = Stitch "The Himalayan Pantry" se derived, **har pair WCAG AA contrast-checked** light + dark dono me (D-46). Values yahan copy mat karo — wahi file padho.
* **Token map (intent → utility):**

  | Token | Light | Dark | Kahan use |
  | :--- | :--- | :--- | :--- |
  | `background` / `foreground` | Warm Ivory `#F8F5EF` / Charcoal `#211D1A` | Pine-night `#0E1411` / `#F1ECE2` | Page canvas, body text |
  | `card` / `popover` | White `#FFFFFF` | `#161E1A` | Cards, drawers, modals, dropdowns |
  | `primary` / `-foreground` | Mountain Gold `#D4A359` / **Charcoal** | `#D9AA62` / `#1A1510` | Main CTA (Add to cart, Pay), verified seals |
  | `secondary` / `-foreground` | Deep Pine `#121A16` / Ivory | `#2C3B34` / `#F1ECE2` | Secondary CTA, editorial bands, nav shell |
  | `tertiary` / `-foreground` | Terracotta `#964824` / White | `#D98560` / `#1A1510` | Harvest/batch stamps, highlight badges |
  | `muted` / `muted-foreground` | Sandstone `#EAE3D2` / Granite `#5F574F` | `#202A25` / `#B3AA9D` | Nested sections, chips, steppers / metadata text |
  | `accent` / `accent-foreground` | `#F3EBDC` / Dark gold `#7A5414` | `#26302B` / `#E6BC74` | Hover/selected bg / **gold-coloured text** |
  | `border` | Hairline `#E5DED2` | `#2A3530` | Dividers, card strokes (decorative) |
  | `input` | `#8E8478` | `#6F7A73` | Form control borders (≥ 3:1) |
  | `ring` | `#9A6B1F` | `#D9AA62` | Focus ring (≥ 3:1) |
  | `success` · `warning` · `info` · `destructive` | `#2F6B4A` · `#8F5A0B` · `#2B5F86` · `#B3261E` | `#6CC395` · `#E9B05A` · `#7DB6E0` · `#F08A80` | Status (D-13) |
  | `nonveg` | Madder brown `#7B2C1C` | `#C2664D` | FSSAI non-veg mark only |
  | `overlay`, `shadow-float` | Pine dim 45% / mist shadow | Black 60% / deeper shadow | Modal backdrop / drawers, sticky bars |
  | `radius` | `0.75rem` → `rounded-lg` 12px (cards, inputs), `rounded-md` 10px (buttons), `rounded-sm` 6px (badges, batch tags) | | |
  | `font-serif` / `font-sans` | Playfair Display (headings) / Inter (body, prices) | | |

  > Hex values sirf documentation ke liye — components me kabhi nahi.
  > Fonts `next/font` (storefront) / `@fontsource` (admin) se self-host honge — Google Fonts runtime link nahi. Prices, weights, quantities aur batch numbers par `tabular-nums`.

* **Standard Usage Rule for Developers/Agents:**
  * **Buttons:** `bg-primary text-primary-foreground hover:bg-primary/90 rounded-md active:scale-[0.98]`
  * **Secondary Buttons (Deep Pine):** `bg-secondary text-secondary-foreground hover:bg-secondary/90`
  * **Outline / Subtle Buttons:** `border border-border bg-transparent text-foreground hover:bg-accent`
  * **Gold text (links, highlights):** `text-accent-foreground` — ❌ `text-primary` light background par text ke liye banned (gold on ivory ≈ 2:1 contrast, AA fail).
  * **Batch / harvest tags:** `bg-tertiary/15 text-tertiary border border-tertiary/30 rounded-sm`
  * **Cards & Containers:** `bg-card text-card-foreground border border-border rounded-lg` (depth tonal layers + hairline se — heavy shadows nahi)
  * **Headings:** `text-foreground font-serif`
  * **Subtitles & Helpers:** `text-muted-foreground text-sm`
  * **Borders & Dividers:** `border-border`
  * **Input Fields:** `bg-background text-foreground border border-input rounded-lg focus-visible:ring-2 focus-visible:ring-ring` (`border-input`, `border-border` nahi — input boundary ≥ 3:1 chahiye)
  * **Floating surfaces (drawer, sticky ATC):** `bg-card border border-border shadow-float` · **Modal backdrop:** `bg-overlay`
  * **Status Badges (order/batch status):**
    * Success (`DELIVERED`, `PAID`, `FRESH`): `bg-success/15 text-success border border-success/30`
    * Warning (`AWAITING_PACKING`, `DELIVERY_FAILED`, `AGING`): `bg-warning/15 text-warning border border-warning/30`
    * Info (`IN_TRANSIT`, `OUT_FOR_DELIVERY`): `bg-info/15 text-info border border-info/30`
    * Destructive (`CANCELLED`, `LOST`, `EXPIRED` batch): `bg-destructive/15 text-destructive border border-destructive/30`
    * Neutral (`PENDING_PAYMENT`, `EXPIRED` order): `bg-muted text-muted-foreground border border-border`
  * **Non-Veg Mark:** `border-2 border-nonveg` square + `bg-nonveg` circle — component `packages/ui/src/nonveg-mark.tsx` (sirf yahi use karo).
  * Status → variant mapping ek hi jagah: `packages/ui/src/status-badge.tsx`.
* **STRICT ENFORCEMENT:** Agar kisi ne `bg-yellow-500`, `text-gray-400`, `border-zinc-800` ya `bg-[#18231E]` jaise arbitrary hardcoded Tailwind colors likhe, toh code review **REJECT** ho jayega. Hamesha semantic tokens use honge! (ESLint rule / CI grep isko enforce karega.)

### 1.5 🎨 Design Reference Policy (Stitch / Figma = Reference, NOT Spec)
> **MANDATORY for every phase, feature ya new addition jisme UI ho.** UI ka kaam **`ui-developer` agent** (`.claude/agents/ui-developer.md`) karega, jo is section ko follow karta hai.

* **Design source:** Stitch project **"New Project"** (ID `8514017347539119853`, design system "The Himalayan Pantry") — storefront, admin, partner desk, auth screens.
* **Yeh design sirf REFERENCE hai, priority nahi.** Theek-thaak hai, final nahi. Agar UI ko aur better / zyada aesthetic / zyada usable banaya ja sakta hai — **toh banao.** Blindly copy mat karo.
* **Priority order (conflict ho toh upar wala jeetega):**
  1. Yeh Rules file + `architecture/08-decisions-log.md` (stack, tokens, accessibility, compliance).
  2. Architecture docs + phase file (functional requirements — kya dikhana/karna hai).
  3. Better UX & aesthetics (hamara judgement — mobile-first, premium artisanal feel).
  4. Stitch / Figma screen (sirf reference — layout idea, mood, content hierarchy).
* **Improve karna allowed / encouraged:** layout, spacing rhythm, typography hierarchy, imagery treatment, micro-interactions, loading skeletons, empty/error states, mobile thumb-reach, conversion flow, accessibility.
* **Kabhi nahi:**
  * ❌ Stitch ka exported HTML / hex colors / arbitrary Tailwind classes copy-paste — sirf semantic tokens (§1.4) + `@pk/ui` primitives.
  * ❌ Compliance elements hatana (non-veg mark, FSSAI no., batch/expiry, MRP incl. taxes, legal links, consent checkboxes).
  * ❌ Phase scope se bahar features add karna (e.g. COD, reviews, coupons — v2 backlog) sirf kyunki design me dikh rahe hain.
  * ❌ Brand palette ad-hoc badalna — color change sirf `globals.css` tokens (§1.4) + decisions log entry se.
* **Process har UI task par:**
  1. Us page/flow ka Stitch screen dekho (reference), phir phase file + architecture doc ke requirements se compare karo.
  2. Gaps aur improvements identify karo (missing states, compliance, mobile UX, accessibility).
  3. Hybrid structure me build karo (`architecture/09-codebase-structure.md` §3).
  4. **Design deviation note** PR / phase evidence me likho: *"Stitch se alag: X — kyunki Y"*.
  5. Evidence: 375 / 768 / 1440 screenshots, light + dark dono.

---

## ⚙️ 2. Backend & Database Architecture Rules

### 2.1 Pure Raw SQL & Zero-ORM Rule (Nexus Standard)
* **Database Driver:** Direct `pg` (Node-Postgres Connection Pool). Migrations **`dbmate`** se (plain `.sql`, up + down) (D-01).
* **Zero ORM Policy:** ❌ No Sequelize, ❌ No Prisma, ❌ No TypeORM.
* **Parameterized Queries Only:** Every SQL query must use parameterized placeholders (`$1, $2, ...`). User input kabhi SQL string me interpolate nahi hoga.
* **Strict ACID Transactions:** Financial mutations (payments, refunds) aur inventory changes hamesha `db.transaction()` block mein honge.
* **Race Condition Prevention:** Stock rows `SELECT ... FOR UPDATE` se lock hongi, aur multiple rows lock karte waqt **deterministic order** (`product_id ASC`, `id ASC`) — deadlock prevention (D-23).
* **No External Calls Inside Transactions:** Razorpay / Shiprocket / WhatsApp / R2 calls kabhi transaction ke andar nahi. Pattern: commit → external call → doosra short transaction (D-30).
* **Order Status Changes:** Sirf `transitionOrder()` se (allowed map `packages/shared`). Direct `UPDATE orders SET status` banned (D-29, `architecture/07-order-state-machine.md`).
* **Worker Scans:** Queue-like table scans (expiry sweeper, reconciliation) `FOR UPDATE SKIP LOCKED` use karenge.
* **Money:** Hamesha integer **paise** (`BIGINT` in DB, `number` integer in API, field names `...Paise`). `DECIMAL`/float money banned (D-26).
* **Row Typing:** Har query result Zod schema se parse (D-07).
* Schema reference: `architecture/01-database-schema-models.md`.

### 2.2 API Design & Validation
* **Strict Contract Validation:** Har API request payload (body, query, params, headers jaise `Idempotency-Key`) **Zod schema** se validate hoga before reaching the service logic (Fastify + `fastify-type-provider-zod`, D-02).
* **Consistent Response Envelope:**
  ```json
  {
    "success": true,
    "data": { },
    "error": null,
    "requestId": "req_01J9...",
    "timestamp": "2026-10-08T18:50:00Z"
  }
  ```
  Error case:
  ```json
  {
    "success": false,
    "data": null,
    "error": { "code": "OUT_OF_STOCK", "message": "Only 2 jars left", "details": { "productId": "..." } },
    "requestId": "req_01J9...",
    "timestamp": "2026-10-08T18:50:00Z"
  }
  ```
  Error codes ki full list: `architecture/02-backend-api-spec.md`. `requestId` har log line me bhi jayega.
* **Authentication (D-20):** Access token (JWT, 15 min) + refresh token (opaque, 30 din, rotating + reuse detection) — **dono httpOnly cookies** (`Secure`, `SameSite=Lax`, `Domain=.pahadikhatki.in`). Cookie names `pk_at` / `pk_rt`. Mutating requests par `Origin` check (CSRF) — `/webhooks/*` exempt (signature-auth). Tokens localStorage me kabhi nahi.
* **RBAC:** Roles `CUSTOMER`, `ADMIN`, `KITCHEN_PARTNER` (D-17). Har protected route par `requireRole([...])`.
* **Webhooks Idempotency:** Har webhook pehle `webhook_events (provider, event_id)` me insert hoga (UNIQUE) — duplicate = no-op. Signature verification raw body par.
* **Background Jobs:** Heavy/External calls (Shiprocket booking, WhatsApp/SMS, PDF invoice/label) **BullMQ + Redis** workers (`apps/backend/src/worker.ts`, alag process, D-06) ke through. Deterministic `jobId` taaki duplicate jobs na banein. API p95 response time < 200ms.
* **Logging:** pino structured logs. **PII (phone, address, email, OTP, tokens, payment payloads) kabhi log nahi hoga** — redact paths configure karo.
* **Files:** Product images → public R2 bucket. **Shipping labels, invoices, settlement statements → PRIVATE R2 bucket + 5-min signed URLs** (D-11).

---

## 🏗️ 3. Code Quality, Modularity & Monorepo Rules

### 3.1 Monorepo Separation of Concerns (pnpm + Turborepo, D-04)
* Monorepo mein boundaries strictly separated honge (packages scope `@pk/*`, D-45):
  * `apps/storefront`: Next.js 16 (App Router) + React 19 (Public customer facing). **DB se direct baat nahi — sirf `backend` call** (D-05).
  * `apps/admin`: React 19 + Vite SPA (Admin operations + Kitchen Partner Packing Desk PWA).
  * `apps/backend`: Fastify 5 + TS. Do entrypoints: `src/server.ts` (HTTP) aur `src/worker.ts` (BullMQ workers + cron) — alag process me deploy (D-06).
  * `packages/shared`: Shared types, Zod schemas, order transitions map, constants.
  * `packages/database`: `dbmate` migrations (`migrations/*.sql`) + seed scripts.
  * `packages/ui`: Theme tokens (`globals.css`), shadcn components, `StatusBadge`.
  * `packages/tsconfig`: Shared TypeScript configs.
* **Code organisation (D-43, D-44):** `architecture/09-codebase-structure.md` follow karna mandatory hai.
  * **Backend (Nexus pattern):** har module `routes → controller → service → repository (+ validation)`. SQL sirf repository me, `db.transaction()` sirf service me, external APIs sirf `src/integrations/` me (transaction ke bahar). Doosre module ki repository direct import nahi — uski service use karo.
  * **Frontend (Hybrid):** primitives `packages/ui` → reusable composites `src/components/common` → features `src/modules/<feature>/` (components, hooks, api, store, pages, `index.ts`). Ek module doosre module ke internals import nahi karega — sirf `index.ts`. Storefront `app/` sirf routing (thin pages).
* Shared business logic ya validation contracts ko copy-paste nahi karna — hamesha `packages/shared` se import karna hai.
* Environment variables Zod se validate (`env.ts`); `.env.example` hamesha updated.

### 3.2 State Management Rules
* **Client UI State:** **Zustand** (Cart drawer open/close, guest cart items persisted to `localStorage`, temporary UI filters). Cart prices/stock server se `POST /api/v1/cart/quote` se revalidate (D-15).
* **Server Cache & Async Data:** **TanStack Query v5** (fetching products, live orders, invalidating queries on mutations). Database/API data ko kabhi Zustand client store me manually replicate mat karo.

---

## 🔒 4. Security & Compliance Rules
1. **Credentials & Secrets:** `.env` values, API keys (Razorpay, Shiprocket, WhatsApp), credentials codebase me hardcode nahi honge. Razorpay **webhook secret** aur **key secret** alag hain.
2. **Food Business Compliance:**
   * Packaging labels aur storefront par Non-Veg mark (brown circle in brown square), FSSAI license number, Batch Code aur Expiry date transparency mandatory.
   * **Shelf-life rule (D-24):** Sirf woh batches bikenge jinki `expiry_date >= today + min_remaining_shelf_days + transit_buffer_days` (default 45 + 7, settings se). Storefront count aur allocation dono same filter use karenge.
3. **Legal Pages (launch blocker):** Privacy Policy, Terms, Refund & Cancellation, Shipping Policy, Contact, Grievance Officer details (Consumer Protection (E-Commerce) Rules 2020) storefront par live hone chahiye — Razorpay activation ke liye bhi zaroori.
4. **Data Protection (DPDP Act 2023):** Checkout par clear consent text (order updates via WhatsApp/SMS), marketing opt-in alag aur default OFF. PII sirf zaroori jagah, least-privilege access (partner ko sirf packing ke liye zaroori details).
5. **GST Invoice:** Har confirmed order ka tax invoice worker generate karega (D-32), private R2 me store.
6. **Idempotent Webhooks:** Razorpay aur Shiprocket webhooks hamesha idempotent (`webhook_events`) — duplicate webhook par double order, double refund ya double notification nahi.
7. **Rate Limiting:** OTP, track lookup, checkout aur login endpoints rate-limited (limits: `architecture/02-backend-api-spec.md`).

---

## 📌 5. Phase-by-Phase Verification Protocol
Jab bhi koi phase complete ho:
1. **Lint & Typecheck:** `tsc --noEmit` aur linting cleanly pass.
2. **Tests:**
   * Unit + integration: **Vitest** + **Testcontainers** (real PostgreSQL + Redis — mocked DB par transactions/locks test nahi hote).
   * E2E: **Playwright** on Mobile (375px), Tablet (768px), Desktop (1440px).
   * Har phase ki Verification Checklist ka har item ek automated test ya documented manual evidence se backed ho.
3. **CI Green:** GitHub Actions pipeline (lint, typecheck, test, migrations up/down) pass.
4. **Database Integrity:** Queries parameterized, koi connection leak nahi, stock ledger invariant test pass.
5. **Evidence Rule:** Checklist item `[x]` **sirf evidence ke saath tick** hoga (test name, screenshot, log, PR link). Bina evidence ke tick karna = phase incomplete.
