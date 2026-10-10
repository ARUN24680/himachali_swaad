# 🏛️ 00. Master Architecture & Tech Stack (2026 Standards)

> Versions aur stack decisions ka source: `08-decisions-log.md` (D-01 … D-11). Exact latest stable versions Phase 1 me pin honge.

---

## 🎯 Architecture Goals
1. **Zero ORM Overhead:** Pure Raw SQL using `pg` (Node-Postgres Connection Pool) — Nexus pattern. Migrations `dbmate` (plain SQL) se (D-01).
2. **Blazing Fast Customer Storefront:** Next.js 16 App Router + React 19, sub-second load time, optimized mountain imagery, SEO-first. Storefront **sirf API se baat karta hai, DB se nahi** (D-05).
3. **Dedicated Operations Dashboard:** React 19 + Vite SPA for order processing, label printing, batch inventory, settlements.
4. **High Concurrency & Zero Race Conditions:** Strict ACID transactions, DB-based stock reservation (D-22) with sorted `SELECT ... FOR UPDATE` row locks.
5. **Lightweight Partner Interface:** Kitchen Partner smartphone se PWA ke through kaam karega (packing queue, label print, mark packed, batch entry, push alerts) (D-16).
6. **Async by Default for External Calls:** Shiprocket, WhatsApp, PDFs — BullMQ worker process me (D-06).

---

## 📦 Monorepo Workspace Structure (pnpm + Turborepo, D-04)

> Folder-level detail, backend module pattern (Nexus) aur hybrid frontend rules: **[`09-codebase-structure.md`](./09-codebase-structure.md)** (D-43, D-44, D-45).

```text
pahadi-khatki/
├── apps/
│   ├── backend/                # @pk/backend — Fastify 5 + TS, Pure Raw SQL REST API
│   │   └── src/
│   │       ├── server.ts       # HTTP entrypoint
│   │       ├── worker.ts       # BullMQ workers + repeat/cron jobs (separate process, D-06)
│   │       ├── app.ts          # buildApp(): plugins + module routes
│   │       ├── config/         # env.ts (Zod), db.ts (pg pool), logger.ts (pino), redis.ts
│   │       ├── plugins/  middleware/  utils/  integrations/  jobs/
│   │       └── modules/        # <module>/{routes,controller,service,repository,validation}.ts
│   ├── storefront/             # @pk/storefront — Next.js 16 (App Router, React 19), hybrid: app/ + modules/ + components/
│   └── admin/                  # @pk/admin — React 19 + Vite SPA, Admin Ops + Kitchen Partner PWA, hybrid
├── packages/
│   ├── shared/                 # @pk/shared — Zod contracts, types, order transitions map, permissions, errors, money
│   ├── database/               # @pk/database — dbmate migrations (migrations/*.sql) & seed scripts
│   ├── ui/                     # @pk/ui — globals.css theme tokens, shadcn components, StatusBadge, NonVegMark
│   └── tsconfig/               # @pk/tsconfig — base / node / nextjs / vite / library presets
├── docker-compose.yml          # Local PostgreSQL 17 + Redis
├── .env.example
├── turbo.json                  # Turborepo task pipeline
├── pnpm-workspace.yaml
└── package.json
```

---

## 🛠️ Complete Tech Stack Matrix

| Layer | Technology | Version (minimum) | Rationale |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | **24 LTS** | Current LTS line. |
| **Database Access** | **Pure Raw SQL (`pg`)** | **latest 8.x** | **Zero ORM overhead**, explicit query control. |
| **Migrations** | **dbmate** | latest | Plain `.sql` up/down files, CI-applied (D-01). |
| **Transactions & Locks** | PostgreSQL Row Locks | Native ACID | Sorted `SELECT ... FOR UPDATE`, `SKIP LOCKED` for workers. |
| **Database** | PostgreSQL | **17** (managed, PITR backups) | ACID, JSONB, partial indexes, generated columns. |
| **Storefront** | Next.js (App Router) | **16.x** | SEO, SSR/ISR for product pages, optimized images. |
| **Client Core** | React | **19.x** | Actions, Server Components, React Compiler. |
| **Admin Portal** | Vite + React | latest Vite, React 19 | Instant HMR, zero SSR overhead, PWA plugin. |
| **Styling** | Tailwind CSS + shadcn/ui + Radix | **Tailwind v4** | CSS-first tokens, accessible headless primitives (D-12). |
| **Client State** | Zustand | **v5** | Cart + UI state (D-15). |
| **Server State** | TanStack Query | **v5** | Caching, refetching, mutations. |
| **API Framework** | **Fastify** + TS | **5.x** | Schema-first, high throughput, raw-body webhooks (D-02). |
| **Type Validation** | Zod | **4.x** | Single source of truth for contracts across monorepo. |
| **Task Queue** | BullMQ + Redis | BullMQ latest, Redis 7+ | Async courier booking, invoices, notifications, sweepers. |
| **Storage** | Cloudflare R2 (S3 API) | — | Public bucket: product images. **Private bucket: labels, invoices, statements (signed URLs)** (D-11). |
| **Payment Gateway** | Razorpay | Standard Checkout | UPI Intent (PhonePe/GPay), cards, refunds. Prepaid only at launch (D-25). |
| **Logistics** | Shiprocket | **External API v1** (`apiv2.shiprocket.in/v1/external`) | AWB, labels, pickups, tracking webhooks. |
| **Messaging** | WhatsApp (Cloud API / BSP) + SMS (MSG91, DLT) | — | Order updates, OTP, partner alerts (D-21, D-38). |
| **Testing** | Vitest + Testcontainers + Playwright | latest | Real PG/Redis in tests, E2E on 3 viewports (D-08). |
| **Observability** | pino + Sentry + uptime monitor + bull-board | latest | Logs, errors, queue visibility (D-09). |
| **CI/CD** | GitHub Actions | — | Lint, typecheck, test, migration up/down, deploy. |

---

## 🌐 Deployment Topology (D-10, PROPOSED vendors)

```text
                         ┌──────────────────────── Cloudflare DNS / CDN / WAF ───────────────────────┐
                         │                                                                            │
     pahadikhatki.in ────▶  Storefront (Next.js 16) on Vercel                                         │
admin.pahadikhatki.in ───▶  Admin Portal + Partner PWA (static Vite build) on Cloudflare Pages/Vercel │
  api.pahadikhatki.in ───▶  API container (server.ts)  ──┐                                           │
                         └───────────────────────────────┼───────────────────────────────────────────┘
                                                         │
          Storefront & Admin ──HTTPS (cookies .pahadikhatki.in)──▶ API
                                                         │
                     ┌───────────────────────────────────┼─────────────────────────────┐
                     ▼                                   ▼                             ▼
          Managed PostgreSQL 17 (PITR)        Managed Redis (persistent TCP)   Worker container (worker.ts)
                     ▲                                   ▲                             │
                     └───────────────────────────────────┴─────────────────────────────┤
                                                                                       │
            Cloudflare R2:  public bucket (product images, CDN)                        │
                            private bucket (labels, invoices, statements → signed URLs)│
                                                                                       ▼
            External:  Razorpay (orders, refunds, webhooks → API)
                       Shiprocket (orders, AWB, labels, pickups, tracking webhooks → API)
                       WhatsApp Cloud API / BSP (templates, delivery-status webhooks → API)
                       SMS provider (OTP, fallback)          Sentry · Uptime monitor
```

* API aur Worker same image, alag command (`node dist/server.js` / `node dist/worker.js`).
* Storefront Server Components API ko `fetch` karte hain (cache tags; stock/price changes par revalidate).
* Staging environment production jaisa hi (Razorpay test mode, Shiprocket test account/sandbox flows).
