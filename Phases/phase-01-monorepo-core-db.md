# 🧱 Phase 1: Monorepo, Infra, CI, Testing, DB Foundation & Design Tokens

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **Depends on:** —  ·  **Migration:** `0001_foundation.sql`

---

## 🎯 Objective
Project ka rock-solid foundation: pnpm + Turborepo monorepo, local infra (Docker Compose), validated config, logging/error tracking, CI pipeline, real-database test harness, Pure Raw SQL `pg` client + `dbmate` migrations (`0001`), API skeleton with standard envelope/errors, aur Tailwind v4 semantic theme tokens. Is phase ke baad koi bhi feature "production-grade plumbing" ke upar banega.

---

## 📋 Granular Tasks & Checklist

### 1.1 Version Pinning (D-03)
- [ ] Install se pehle latest stable versions check karke `package.json` me **exact** pin karo (minimum: Node.js 24 LTS, Next.js 16, React 19.x, Vite latest, Tailwind CSS v4, Fastify 5, Zod 4, TanStack Query v5, Zustand v5, BullMQ latest, `pg` latest, PostgreSQL 17, Redis 7+).
- [ ] `.nvmrc` / `engines.node` + `packageManager` field (pnpm) set.
- [ ] Pinned versions ki list `architecture/00-master-architecture.md` stack table me update karne ke liye PR note.

### 1.2 Monorepo Workspace (pnpm + Turborepo, D-04)
- [ ] Structure:
  ```text
  pahadi-khatki/
  ├── apps/
  │   ├── storefront/      # Next.js 16 (App Router, React 19) — calls api-server only (D-05)
  │   ├── admin-portal/    # Vite + React 19 SPA — Admin + Kitchen Partner desk
  │   └── api-server/      # Fastify 5 + TS — src/server.ts (HTTP) + src/worker.ts (BullMQ + cron) (D-06)
  ├── packages/
  │   ├── shared/          # Zod schemas, types, constants, order transitions map, error codes
  │   ├── database/        # dbmate migrations (.sql), seed scripts
  │   ├── ui/              # Tailwind v4 theme tokens (globals.css), shadcn primitives
  │   └── tsconfig/        # base / nextjs / vite / node tsconfig presets
  ├── docker-compose.yml
  ├── turbo.json
  ├── pnpm-workspace.yaml
  ├── AGENTS.md
  └── CLAUDE.md            # points to AGENTS.md
  ```
- [ ] `turbo.json` pipelines: `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`.
- [ ] TypeScript `strict: true`, `noUncheckedIndexedAccess: true` sab workspaces me (shared preset).
- [ ] `CLAUDE.md` create karo jo `AGENTS.md` aur `Rules/00-project-rules.md` ko point kare.

### 1.3 Local Infra & Configuration
- [ ] `docker-compose.yml`: PostgreSQL 17 + Redis 7 (named volumes, healthchecks).
- [ ] `apps/api-server/src/config/env.ts`: **Zod-validated env** — app boot par missing/invalid var = crash with clear message. Vars: `DATABASE_URL`, `DB_POOL_MAX` (default 10), `SLOW_QUERY_MS`, `PROCESS_NAME`, `REDIS_URL`, `NODE_ENV`, `APP_ORIGINS`, `COOKIE_DOMAIN`, `JWT_SECRET`, `SENTRY_DSN` (optional in dev); baaki integration vars apne phase me add honge.
- [ ] `.env.example` har app ke liye (koi real secret nahi). `.env*` gitignored.
- [ ] Storefront & admin env bhi Zod se validated (`NEXT_PUBLIC_*`, `VITE_*` sirf public values).

### 1.4 Database Client & Migrations (D-01)
- [ ] `apps/api-server/src/config/db.ts` — **exactly** `architecture/01` wala client: pool (`statement_timeout`, `application_name`, SSL in prod), `db.query` with slow-query log (params never logged), `db.transaction` with isolation option + broken-client release.
- [ ] `dbmate` setup in `packages/database` (`pnpm db:new`, `db:up`, `db:down`, `db:status`), migrations dir `packages/database/migrations/`.
- [ ] Migration **`0001_foundation.sql`** (copy from `architecture/01`): `citext`, `set_updated_at()`, `forbid_mutation()`, `user_role` (`CUSTOMER`, `ADMIN`, `KITCHEN_PARTNER`), `users`, `refresh_tokens`, `settings` (+ seed defaults), `pickup_locations`, `user_pickup_locations`, `admin_audit_log`.
- [ ] `settings` read helper `getSetting<T>(client, key)` with Zod parse + short in-memory cache (invalidate on update).
- [ ] Rule: applied migration kabhi edit nahi — naya file.

### 1.5 API Server Skeleton (Fastify 5, D-02)
- [ ] `fastify-type-provider-zod` — har route ka body/query/params Zod schema se validate.
- [ ] **Response envelope** (`Rules` §2.2): `{ success, data, error, timestamp }` via a reply helper.
- [ ] `AppError(code, httpStatus, details?)` + **error code registry** in `packages/shared/src/errors.ts` (e.g. `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `OUT_OF_STOCK`, `ILLEGAL_TRANSITION`, `STALE_STATE`, `INTERNAL`). Global error handler → envelope; unknown errors → `INTERNAL` + Sentry, stack trace kabhi client ko nahi.
- [ ] **Request ID**: incoming `X-Request-Id` ya generated UUID → pino child logger + response header.
- [ ] Health endpoints: `GET /healthz` (process alive), `GET /readyz` (DB `SELECT 1` + Redis `PING`).
- [ ] Security baseline: `@fastify/helmet`, `@fastify/cors` (sirf `APP_ORIGINS`), `@fastify/rate-limit` (Redis store) global default, body size limit.
- [ ] `src/worker.ts` entrypoint: BullMQ connection + graceful shutdown (abhi koi job nahi; Phase 5 se add honge).
- [ ] Graceful shutdown (SIGTERM): stop accepting, drain, `pool.end()`, Redis quit.

### 1.6 Logging & Error Tracking (D-09)
- [ ] **pino** structured JSON logs (pretty in dev), PII redaction paths (`phone`, `email`, `address`, `authorization`, `cookie`).
- [ ] **Sentry** in api-server, storefront, admin-portal (release + environment tags).

### 1.7 Testing Harness (D-08)
- [ ] **Vitest** across workspaces.
- [ ] **Testcontainers** (PostgreSQL 17 + Redis): integration tests real DB par, migrations auto-apply, per-test-file isolated DB/schema.
- [ ] Shared test helpers: `createTestDb()`, factory functions for users/pickup locations.
- [ ] **Playwright** setup (projects: 375px, 768px, 1440px) — Phase 4 se real specs.

### 1.8 Code Quality & CI
- [ ] ESLint + Prettier (ya Biome — ek choose karo, dono nahi). Lint rule/script jo **hardcoded Tailwind colors** (`bg-yellow-500`, `text-gray-400`, `bg-[#...]`) ko fail kare (Rules §1.4).
- [ ] Pre-commit hook (lint-staged) for format + lint.
- [ ] **GitHub Actions CI** on every PR: install (pnpm cache) → typecheck → lint → unit tests → integration tests (Testcontainers) → **migrations `up` → `down` → `up` round-trip** on a fresh PostgreSQL 17 service.
- [ ] Branch protection: CI green required on `main`.

### 1.9 Design Tokens (Tailwind v4, D-12, D-13)
- [ ] `packages/ui/src/globals.css`: Tailwind v4 CSS-first config (`@import "tailwindcss"`, `@theme inline` mapping) — tokens **exactly** `Rules/00-project-rules.md` §1.4 se: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`, `destructive`, **`success`, `warning`, `info`** (+ `*-foreground`), `radius`, font tokens (serif headings + sans body).
- [ ] `.dark` me **har** token override (popover, accent, destructive, success/warning/info included).
- [ ] shadcn/ui (Tailwind v4 compatible) initialised in both apps, consuming `packages/ui` tokens.
- [ ] Token preview page (`/dev/tokens` in admin dev build): har token + Button/Card/Badge/Input variants light & dark me.

### 1.10 Shared Contracts (`packages/shared`)
- [ ] Base Zod schemas: `PhoneSchema` (E.164 `+91[6-9]XXXXXXXXX`), `PincodeSchema`, `PaiseSchema` (non-negative int), `AddressSchema`, `RoleEnum`, `EnvelopeSchema<T>`.
- [ ] Money helpers: `formatINR(paise)`, no floats in arithmetic (D-26).

---

## 🚫 Out of Scope
- Auth endpoints & guards → **Phase 2**.
- Products/batches tables (`0002`) → **Phase 3**.
- Any real BullMQ job → **Phase 5+**.
- Production hosting/deploy → **Phase 10** (sirf CI is phase me).

---

## 🔍 Verification Checklist
- [ ] `docker compose up` + `pnpm dev` se teeno apps + api-server + worker start hote hain (fresh clone par README steps follow karke).
- [ ] Invalid/missing env var par api-server boot fail hota hai with readable error (unit test `env.test.ts`).
- [ ] `db.transaction` rollback test: simulated error ke baad koi row persist nahi; failing ROLLBACK par client destroy hota hai (integration test `db.transaction.test.ts`).
- [ ] Pool connection leak test: 100 sequential transactions (with thrown errors) ke baad `pool.totalCount <= DB_POOL_MAX` aur `waitingCount = 0`.
- [ ] Migration `0001` up → down → up CI me green.
- [ ] `settings` seed rows exist; `users_staff_login` CHECK staff ko bina password reject karta hai (integration test).
- [ ] `GET /readyz` DB/Redis down hone par `503` deta hai.
- [ ] Unknown thrown error → client ko `INTERNAL` envelope, Sentry event, log me `requestId` (integration test).
- [ ] Hardcoded color lint rule ek sample violation par CI fail karta hai.
- [ ] Ek CSS variable change karne par token preview page ke saare components light & dark dono me update (screenshot evidence).
- [ ] `tsc --noEmit` + lint saare workspaces me clean.

---

## ✅ Definition of Done
Fresh machine par 1 command se local stack chalta hai, CI har PR par typecheck/lint/tests/migration round-trip chalata hai, DB client + migration `0001` production-ready hai, aur design tokens single source se poore UI ko control karte hain.
