# 🧩 09. Codebase Structure & Code Organisation (Nexus Pattern + Hybrid Frontend)

> Decisions: **D-43** (app naming + Nexus backend module pattern), **D-44** (hybrid frontend architecture), **D-45** (`@pk/*` package scope) — `08-decisions-log.md`.
> Stack decisions (pnpm + Turborepo D-04, Fastify 5 D-02, Next.js storefront D-05) **unchanged** — sirf folder/code organisation Nexus jaisi hai.
> Naya file/folder banane se pehle yeh doc padho. Koi naya top-level folder chahiye toh pehle is doc me add karo (PR me), phir banao.

---

## 🗺️ 1. Monorepo Layout

```text
pahadi-khatki/
├── apps/
│   ├── backend/        # @pk/backend    — Fastify 5 API (server.ts) + BullMQ worker (worker.ts)
│   ├── storefront/     # @pk/storefront — Next.js 16 customer site (SEO, SSR/ISR)
│   └── admin/          # @pk/admin      — Vite + React 19 SPA: Admin ops + Kitchen Partner PWA
├── packages/
│   ├── shared/         # @pk/shared     — Zod contracts, types, order transitions, permissions, error codes, money
│   ├── database/       # @pk/database   — dbmate migrations + seeds (plain SQL)
│   ├── ui/             # @pk/ui         — globals.css tokens, shadcn primitives, StatusBadge, NonVegMark
│   └── tsconfig/       # @pk/tsconfig   — base / node / nextjs / vite / library presets
├── architecture/  Phases/  Rules/      # Docs (source of truth)
├── package.json  pnpm-workspace.yaml  turbo.json  .nvmrc
└── AGENTS.md  CLAUDE.md
```

**Dependency direction (strict, ulta kabhi nahi):**

```text
apps/storefront ──┐
apps/admin ───────┼──▶ packages/ui ──▶ (tokens only)
                  └──▶ packages/shared ◀── apps/backend ──▶ packages/database (migrations, CLI only)
```

* Frontend apps **kabhi** `apps/backend` ya `packages/database` import nahi karte — sirf HTTP (D-05).
* `packages/shared` kisi app ko import nahi karta. Runtime deps sirf `zod` (framework-free).
* `packages/ui` me business logic nahi — sirf presentational primitives + tokens.

---

## ⚙️ 2. Backend — `apps/backend` (Nexus Module Pattern)

```text
apps/backend/
├── src/
│   ├── server.ts              # HTTP entrypoint: env → logger → db/redis → buildApp(deps) → listen, graceful shutdown (D-06)
│   ├── worker.ts              # Worker entrypoint: BullMQ processors + repeat jobs (alag process, D-06)
│   ├── app.ts                 # buildApp(): Fastify instance, plugins register, modules ke routes mount
│   ├── config/                # env.ts (Zod), db.ts (pg pool + transaction + BIGINT/DATE parsers), redis.ts, logger.ts (pino), sentry.ts,
│   │                          #   auth.ts, storage.ts (storageFromEnv / revalidatorFromEnv)
│   ├── plugins/               # Fastify plugins (app-wide): helmet, cors, rate-limit, raw-body, request-id, error-handler
│   ├── middleware/            # Route-level preHandlers: requireAuth, requireRole, requireOrigin (CSRF), idempotency
│   ├── utils/                 # app-error.ts, response.ts (envelope ok/fail), request-id.ts, with-timeout.ts
│   ├── integrations/          # External APIs ke thin clients (Nexus ka `services/`): razorpay, shiprocket,
│   │                          #   whatsapp, sms, storage (R2), pdf — koi DB access nahi, koi business rule nahi
│   ├── jobs/                  # queues.ts (queue names + deterministic jobId), schedules.ts (repeat jobs),
│   │   └── processors/        #   ek file per job type — module service ko call karta hai
│   └── modules/               # Domain modules (neeche)
│       ├── health/  auth/  users/  catalog/  inventory/  cart/  checkout/  payments/
│       ├── orders/  account/  logistics/  notifications/  partner/  admin/
│       └── settlements/  settings/  webhooks/
├── scripts/build.mjs          # esbuild production bundle (inlines @pk/*, npm deps external) → dist/server.js, dist/worker.js
└── tests/
    ├── helpers/               # global-setup (PG 17 + Redis containers, migrated template DB), createTestDb(), factories (D-08)
    ├── unit/
    └── integration/
```

### 2.1 Module anatomy (har module me same files)

```text
modules/orders/
├── orders.routes.ts        # Fastify plugin: URL + method + Zod schema (from @pk/shared/contracts) + preHandlers → controller
├── orders.controller.ts    # HTTP layer: request se input nikalo → service call → reply envelope. Koi SQL nahi.
├── orders.service.ts       # Business logic + transactions (db.transaction). transitionOrder(), side-effects, job enqueue.
├── orders.repository.ts    # SIRF raw parameterized SQL ($1, $2…). Har result Zod se parse (D-07). Client param leta hai.
├── orders.validation.ts    # Module-internal Zod schemas (row schemas, internal DTOs). Public contracts → @pk/shared.
└── orders.types.ts         # (optional) module-internal types
```

**Layer rules (code review checklist):**

| Layer | Kar sakta hai | Nahi kar sakta |
| :--- | :--- | :--- |
| `routes` | schema attach, `requireAuth`/`requireRole` preHandler, controller bind | logic, SQL |
| `controller` | input map, service call, `reply.ok()` / `AppError` throw | SQL, transactions, external API |
| `service` | `db.transaction()`, multiple repositories, `transitionOrder()`, enqueue jobs, integrations call **transaction ke bahar** (D-30) | raw `pool.query` bypass, `UPDATE orders SET status` (D-29) |
| `repository` | parameterized SQL, `FOR UPDATE` (sorted lock order, D-23), `SKIP LOCKED` | business decisions, external calls, string-interpolated SQL |
| `integrations/*` | HTTP call, signature verify, retry/backoff | DB access |

* **Dependency injection:** `config/*` factories (`createDb`, `createRedis`, `createLogger`, `initSentry`) sirf entrypoints (`server.ts`, `worker.ts`) me bante hain; services `createXService(deps)` factories hain aur routes plugin options se service lete hain — tests real DB ke saath `buildApp(deps)` + `app.inject` use karte hain.
* Ek module doosre module ki **repository** directly import nahi karega — doosre module ki **service** ka exported function use karo (e.g. `checkout.service` → `inventory.service.reserveStock()`).
* Canonical flows ka location: `createOrder()` → `modules/checkout/checkout.service.ts`, `confirmPayment()` → `modules/payments/payments.service.ts`, `transitionOrder()` → `modules/orders/orders.service.ts` (allowed map `@pk/shared/order/transitions.ts`).
* Routes prefix: `/api/v1/<module>`; webhooks `/api/v1/webhooks/<provider>` (raw body, Origin check exempt).

---

## 🛍️ 3. Frontend — Hybrid Architecture (Component-based + Feature-based)

**Kyun hybrid?** Pure component-based (`components/` me sab kuch) bade project me unmanageable ho jata hai; pure feature-based me common UI duplicate hota hai. Hybrid = **3 layers**:

| Layer | Location | Kya rakhna hai | Example |
| :--- | :--- | :--- | :--- |
| **1. Primitives** (design system) | `packages/ui` | shadcn/Radix primitives, tokens, brand-neutral. Dono apps share karte hain. | `Button`, `Dialog`, `Sheet`, `Badge`, `StatusBadge`, `NonVegMark` |
| **2. Common components** (app-level reusable) | `apps/<app>/src/components/common` | App ke multiple features me use hone wale composites. Business-aware ho sakte hain, feature-specific nahi. | `PriceTag` (paise → ₹), `PageHeader`, `KpiCard`, `DataTable`, `EmptyState`, `ConfirmDialog` |
| **3. Feature modules** | `apps/<app>/src/modules/<feature>` | Ek feature ka sab kuch: pages/sections, feature components, hooks (TanStack Query), API calls, local store. | `modules/cart/components/CartDrawer.tsx`, `modules/orders/hooks/useOrders.ts` |

**Import rules (ESLint `no-restricted-imports` se Phase 1 me enforce):**
1. Direction: `routes/pages → modules → components/common → @pk/ui`. Ulta import banned (`@pk/ui` kabhi app ko import nahi karta, `components/common` kabhi `modules/*` ko nahi).
2. Ek module doosre module ke **internals** import nahi karega — sirf uske `index.ts` (public API) se. E.g. `modules/checkout` → `import { useCart } from '@/modules/cart'`.
3. Koi component 2+ features me chahiye → `components/common` me promote karo. 2+ apps me chahiye aur presentational hai → `packages/ui` me.
4. Server data sirf **TanStack Query** hooks (`modules/<f>/hooks`) se; client UI state sirf **Zustand** (Rules §3.2). API data Zustand me copy nahi.
5. Colors sirf semantic tokens (Rules §1.4) — har layer par.
6. **Exception — router lazy pages:** `app/router` (admin) code-splitting ke liye `lazy(() => import('@/modules/<f>/pages/XPage'))` deep path use kar sakta hai. Static imports hamesha module `index.ts` se.

### 3.1 Feature module anatomy

```text
modules/<feature>/
├── components/     # Feature-only UI (sections, cards, forms)
├── hooks/          # useXxx() — TanStack Query queries/mutations, feature logic hooks
├── api/            # xxxApi.ts — typed HTTP calls (contracts from @pk/shared), no React
├── store/          # (optional) Zustand slice — sirf jab feature ko client state chahiye (e.g. cart)
├── pages/          # (admin only) route-level page components
├── types.ts        # (optional) feature-local types
└── index.ts        # Public API — sirf yahi doosre modules/routes import karte hain
```

### 3.2 Storefront — `apps/storefront` (Next.js 16 App Router)

```text
apps/storefront/src/
├── app/                     # ROUTING ONLY — thin page.tsx/layout.tsx: data fetch (Server Components) + module sections render
│   ├── (shop)/              #   home, products, products/[slug], about, faq, contact
│   ├── checkout/  order/[orderCode]/  track/
│   ├── account/             #   login, orders, orders/[orderCode], addresses
│   └── (legal)/             #   privacy-policy, terms, refund-cancellation, shipping-policy, grievance
├── modules/                 # home · catalog · cart (+store) · checkout · orders · tracking · account · content (about/faq/legal copy)
│                            #   · analytics (consent store + banner, GA4/Pixel loaders, CAPI relay — Phase 4)
├── components/
│   ├── common/              # PriceTag, ProductImage, EmptyState, SectionHeading …
│   └── layout/              # Header, Footer, MobileNav, AnnouncementBar
├── providers/               # QueryProvider, ThemeProvider (next-themes, D-14)
├── lib/                     # api-client.ts (server + client fetch, cache tags), env.ts (Zod), seo.ts, utils
├── config/                  # site.ts (brand, FSSAI no. display), navigation.ts
└── styles/                  # globals.css → imports @pk/ui/globals.css (app-specific additions only)
```

* `app/**/page.tsx` me UI logic nahi — sirf `fetch` + `<ProductDetailSection />` jaisa module component.
* Server Components default; `"use client"` sirf interactive leaf components (cart, checkout form, filters).

### 3.3 Admin + Partner PWA — `apps/admin` (Vite + React 19)

```text
apps/admin/src/
├── main.tsx  App.tsx
├── app/
│   ├── router/              # Route table, lazy-loaded module pages, AuthGuard/RoleGuard wrapping
│   └── providers/           # QueryProvider, ThemeProvider, I18nProvider
├── layouts/                 # AdminLayout (sidebar), PartnerLayout (mobile bottom-nav, /desk/*), AuthLayout
│                            # (Phase 1: temporary AppShell)
├── components/
│   ├── common/              # PageHeader, KpiCard, DataTable, FilterBar, ConfirmDialog, EmptyState (Nexus 3-tier, doc 04)
│   ├── guards/              # AuthGuard, RoleGuard (UX only — API enforce karta hai)
│   ├── navigation/          # Sidebar, Topbar, BottomNav
│   └── feedback/            # Toaster, ErrorBoundary
├── modules/                 # auth · dashboard · orders · ops-issues · packing-desk · inventory · products ·
│                            # customers · settlements · expenses · settings · staff · audit-log · queues
│                            # + home (placeholder) · dev-tools (/dev/tokens — dev build only)
├── services/api/            # http.ts (fetch wrapper, credentials: 'include', 401 → refresh), endpoints.ts, query-keys.ts
├── store/                   # Zustand: theme.store.ts (D-14), ui (sidebar, modals)
├── styles/globals.css       # imports @pk/ui/globals.css (+ app-only additions)
├── hooks/  lib/  constants/
├── i18n/                    # en/, hi/ — Packing Desk Hindi + English (D-16)
└── pwa/                     # Service worker registration, push subscription (D-16)
```

* Module → role mapping (`04-admin-operations-portal.md`): `packing-desk` = KITCHEN_PARTNER + ADMIN; `settlements` = ADMIN (full) + PARTNER (read-only); baaki ADMIN only.

---

## 📦 4. Packages

> **Just-in-Time packages (D-47):** `@pk/shared` aur `@pk/ui` TypeScript source export karte hain (koi build step nahi). Next `transpilePackages`, Vite native TS, backend production build esbuild bundle. Sab workspaces `moduleResolution: Bundler` → imports extensionless.

### `packages/shared` (`@pk/shared`)
```text
src/
├── contracts/       # Per-domain request/response Zod schemas (auth, catalog, cart, checkout, orders, partner, admin…)
├── schemas/         # Base: PhoneSchema, PincodeSchema, PaiseSchema, AddressSchema, EnvelopeSchema<T>
├── order/           # statuses.ts, transitions.ts (allowed map + canTransition, doc 07 §1.2)
├── auth/            # roles.ts, permissions.ts (access matrix, Phase 2)
├── catalog/         # rows.ts (DB row Zod schemas, D-07), shelf-life.ts (shelfStatusFor, stockBadgeFor), batch-code.ts (D-42, todayInIST)
├── logistics/       # boxRules.ts, shiprocketStatusMap.ts (Phase 6)
├── notifications/   # templates.ts (Phase 8)
├── constants/       # Shared constants (RESERVATION_TTL default etc. — runtime values settings table se)
├── errors.ts        # Error code registry (doc 02)
├── money.ts         # formatINR(paise), integer-only helpers (D-26)
└── index.ts
```

### `packages/ui` (`@pk/ui`)
```text
src/
├── styles/globals.css   # SINGLE source of theme tokens (Rules §1.4)
├── components/          # shadcn/ui primitives (button, card, dialog, sheet, input, badge…)
├── status-badge.tsx     # Status → variant mapping (ek hi jagah)
├── nonveg-mark.tsx      # FSSAI non-veg mark (ek hi jagah)
├── lib/utils.ts         # cn()
└── hooks/
```

### `packages/database` (`@pk/database`)
`migrations/NNNN_name.sql` (dbmate up/down, applied migration kabhi edit nahi) · `seeds/` (dev/staging seed scripts).

---

## 📛 5. Naming Conventions

| Cheez | Convention | Example |
| :--- | :--- | :--- |
| Backend module files | `<module>.<layer>.ts` (kebab module name) | `ops-issues.service.ts`, `orders.repository.ts` |
| React components | PascalCase file = component name | `CartDrawer.tsx`, `PackingQueuePage.tsx` |
| Hooks | `useXxx.ts` | `useCartQuote.ts` |
| API clients (frontend) | `<feature>Api.ts` | `ordersApi.ts` |
| Zustand stores | `<feature>.store.ts` | `cart.store.ts` |
| Zod schemas | `XxxSchema`, type `Xxx = z.infer<typeof XxxSchema>` | `CreateOrderRequestSchema` |
| Money fields | `...Paise` (integer) | `unitPricePaise` |
| Folders | kebab-case | `packing-desk/`, `audit-log/` |
| Workspace packages | `@pk/<name>` | `@pk/shared` |

---

## ✅ 6. Setup Status

| Item | Status |
| :--- | :--- |
| Folder skeleton + workspace configs | Done (`b918f76`) |
| Deps install + exact pinning, entry files, `db.ts`, `env.ts`, `globals.css`, Docker Compose, tests, lint boundaries, CI workflow | **Phase 1 done** — evidence `Phases/phase-01-monorepo-core-db.md` |
| CI first green run, branch protection | Done (PR #1) — real Sentry DSN pending |
| Auth module, guards, admin login + storefront OTP sheet | **Phase 2 done** (PR #2) |
| `catalog` + `inventory` modules, `integrations/storage` (R2 + local-disk dev driver), `integrations/storefront` (revalidate), `dev-storage` module (STORAGE_DRIVER=local only), storefront `app/api/revalidate` | **Phase 3** |
| `cart` (quoteCart), `shipping` (check-pincode + Redis cache), `analytics` (Meta CAPI relay) modules; `integrations/shipping` (stub serviceability), `integrations/meta` (Conversions API) | **Phase 4** |
| Storefront: home, catalog, PDP, cart drawer (Zustand `pk-cart-v1` + quote), content + legal pages, SEO (metadata, JSON-LD, sitemap, robots, OG), consent + analytics; `lib/server-api.ts` (server fetch + tags), `lib/report-error.ts` (lazy Sentry) | **Phase 4** |
