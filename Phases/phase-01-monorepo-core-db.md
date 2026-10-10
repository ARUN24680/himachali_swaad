# 🧱 Phase 1: Monorepo, Infra, CI, Testing, DB Foundation & Design Tokens

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** —  ·  **Migration:** `0001_foundation.sql`

---

## 🎯 Objective
Project ka rock-solid foundation: pnpm + Turborepo monorepo, local infra (Docker Compose), validated config, logging/error tracking, CI pipeline, real-database test harness, Pure Raw SQL `pg` client + `dbmate` migrations (`0001`), API skeleton with standard envelope/errors, aur Tailwind v4 semantic theme tokens. Is phase ke baad koi bhi feature "production-grade plumbing" ke upar banega.

---

## 📋 Granular Tasks & Checklist

### 1.1 Version Pinning (D-03)
- [x] Install se pehle latest stable versions check karke `package.json` me **exact** pin karo (minimum: Node.js 24 LTS, Next.js 16, React 19.x, Vite latest, Tailwind CSS v4, Fastify 5, Zod 4, TanStack Query v5, Zustand v5, BullMQ latest, `pg` latest, PostgreSQL 17, Redis 7+).
  > Evidence: exact pins in every `package.json`, `savePrefix: ""` + `minimumReleaseAge: 10080` (7 din) in `pnpm-workspace.yaml`; list `architecture/00-master-architecture.md` §Pinned Versions. TypeScript 6.0.3 (7.x typescript-eslint support nahi karta, D-47).
- [x] `.nvmrc` / `engines.node` + `packageManager` field (pnpm) set.
  > Evidence: `.nvmrc` = 24, root `engines.node` `>=24.0.0 <25`, `packageManager: pnpm@12.10.1`.
- [x] Pinned versions ki list `architecture/00-master-architecture.md` stack table me update karne ke liye PR note.
  > Evidence: `architecture/00-master-architecture.md` §Pinned Versions (Phase 1).

### 1.2 Monorepo Workspace (pnpm + Turborepo, D-04)
- [x] Structure (folder skeleton + workspace configs already created — `architecture/09-codebase-structure.md`, D-43/D-44/D-45; is phase me deps install + entry files):
  > Evidence: commits `b918f76` + Phase 1 commit; `pnpm typecheck` 5/5 workspaces.
  ```text
  pahadi-khatki/
  ├── apps/
  │   ├── backend/         # Fastify 5 + TS — src/server.ts (HTTP) + src/worker.ts (BullMQ + cron) (D-06), Nexus module pattern
  │   ├── storefront/      # Next.js 16 (App Router, React 19) — calls backend only (D-05), hybrid frontend
  │   └── admin/           # Vite + React 19 SPA — Admin + Kitchen Partner desk, hybrid frontend
  ├── packages/
  │   ├── shared/          # Zod schemas, types, constants, order transitions map, error codes
  │   ├── database/        # dbmate migrations (.sql), seed scripts
  │   ├── ui/              # Tailwind v4 theme tokens (src/styles/globals.css), shadcn primitives
  │   └── tsconfig/        # base / node / nextjs / vite / library tsconfig presets
  ├── docker-compose.yml
  ├── turbo.json
  ├── pnpm-workspace.yaml
  ├── AGENTS.md
  └── CLAUDE.md            # points to AGENTS.md
  ```
- [x] `turbo.json` pipelines: `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`.
  > Evidence: `turbo.json` — dev, dev:worker, build, typecheck, lint, test, test:integration, test:e2e.
- [x] TypeScript `strict: true`, `noUncheckedIndexedAccess: true` sab workspaces me (shared preset).
  > Evidence: `packages/tsconfig/base.json` (strict, noUncheckedIndexedAccess, verbatimModuleSyntax) — sab presets extend karte hain.
- [x] `CLAUDE.md` create karo jo `AGENTS.md` aur `Rules/00-project-rules.md` ko point kare.
  > Evidence: `CLAUDE.md` → `@AGENTS.md` (AGENTS.md Rules + docs point karta hai).

### 1.3 Local Infra & Configuration
- [x] `docker-compose.yml`: PostgreSQL 17 + Redis 7 (named volumes, healthchecks).
  > Evidence: `docker compose up -d --wait` → postgres:17-alpine + redis:7.4-alpine Healthy (named volumes, healthchecks).
- [x] `apps/backend/src/config/env.ts`: **Zod-validated env** — app boot par missing/invalid var = crash with clear message. Vars: `DATABASE_URL`, `DB_POOL_MAX` (default 10), `SLOW_QUERY_MS`, `PROCESS_NAME`, `REDIS_URL`, `NODE_ENV`, `APP_ORIGINS`, `COOKIE_DOMAIN`, `JWT_SECRET`, `SENTRY_DSN` (optional in dev); baaki integration vars apne phase me add honge.
  > Evidence: `tests/unit/env.test.ts` (4 tests) + `loadEnvOrExit` exit(1).
- [x] `.env.example` har app ke liye (koi real secret nahi). `.env*` gitignored.
  > Evidence: `.env.example`, `apps/admin/.env.example`, `apps/storefront/.env.example`; `git check-ignore` confirms `.env`, `.env.local` ignored.
- [x] Storefront & admin env bhi Zod se validated (`NEXT_PUBLIC_*`, `VITE_*` sirf public values).
  > Evidence: `apps/storefront/src/lib/env.ts`, `apps/admin/src/lib/env.ts`.

### 1.4 Database Client & Migrations (D-01)
- [x] `apps/backend/src/config/db.ts` — **exactly** `architecture/01` wala client: pool (`statement_timeout`, `application_name`, SSL in prod), `db.query` with slow-query log (params never logged), `db.transaction` with isolation option + broken-client release.
  > Evidence: `src/config/db.ts` (factory form + checked-out client `error` listener fix — doc 01 updated); tests `db.transaction.test.ts`.
- [x] `dbmate` setup in `packages/database` (`pnpm db:new`, `db:up`, `db:down`, `db:status`), migrations dir `packages/database/migrations/`.
  > Evidence: `pnpm db:up/db:down/db:status` local run: Applying → Rolled back → Applying `0001_foundation.sql`.
- [x] Migration **`0001_foundation.sql`** (copy from `architecture/01`): `citext`, `set_updated_at()`, `forbid_mutation()`, `user_role` (`CUSTOMER`, `ADMIN`, `KITCHEN_PARTNER`), `users`, `refresh_tokens`, `settings` (+ seed defaults), `pickup_locations`, `user_pickup_locations`, `admin_audit_log`.
  > Evidence: `packages/database/migrations/0001_foundation.sql` (doc 01 se verbatim); `migration-0001.test.ts` (5 tests).
- [x] `settings` read helper `getSetting<T>(client, key)` with Zod parse + short in-memory cache (invalidate on update).
  > Evidence: `modules/settings/settings.service.ts` `getSetting(db, key, schema)` + TTL cache + `invalidate`; `settings.test.ts` (3 tests).
- [x] Rule: applied migration kabhi edit nahi — naya file.
  > Evidence: header comment in `0001_foundation.sql` + `architecture/01` rule; CI round-trip job.

### 1.5 API Server Skeleton (Fastify 5, D-02)
- [x] `fastify-type-provider-zod` — har route ka body/query/params Zod schema se validate.
  > Evidence: `app.ts` validator/serializer compilers; `app.test.ts › Zod validation failure → VALIDATION_ERROR with issues`.
- [x] **Response envelope** (`Rules` §2.2): `{ success, data, error, requestId, timestamp }` via a reply helper (`apps/backend/src/utils/response.ts`).
  > Evidence: `utils/response.ts`; `app.test.ts` envelope assertions; live `curl /healthz`.
- [x] `AppError(code, httpStatus, details?)` + **error code registry** in `packages/shared/src/errors.ts` — codes exactly `architecture/02-backend-api-spec.md` wale (e.g. `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `OUT_OF_STOCK`, `ILLEGAL_TRANSITION`, `STALE_STATE`, `INTERNAL_ERROR`). Global error handler → envelope; unknown errors → `INTERNAL_ERROR` + Sentry, stack trace kabhi client ko nahi.
  > Evidence: `packages/shared/src/errors.ts`, `utils/app-error.ts`, `plugins/error-handler.ts`; `app.test.ts › AppError keeps its code and status`, `› unknown error → INTERNAL_ERROR …`.
- [x] **Request ID**: incoming `X-Request-Id` ya generated UUID → pino child logger + response header.
  > Evidence: `utils/request-id.ts` (safe incoming id reuse else `req_<uuid>`), log label `requestId`; `app.test.ts › sets x-request-id and echoes it`.
- [x] Health endpoints: `GET /healthz` (process alive), `GET /readyz` (DB `SELECT 1` + Redis `PING`).
  > Evidence: `modules/health/*`; `app.test.ts` healthz/readyz tests; live `curl :4000/readyz` → ready.
- [x] Security baseline: `@fastify/helmet`, `@fastify/cors` (sirf `APP_ORIGINS`), `@fastify/rate-limit` (Redis store) global default, body size limit.
  > Evidence: `plugins/security.ts` (helmet, cors APP_ORIGINS + credentials, rate-limit Redis store 300/min), bodyLimit 1 MB; `app.test.ts › rate limit → RATE_LIMITED envelope with Retry-After`.
- [x] `src/worker.ts` entrypoint: BullMQ connection + graceful shutdown (abhi koi job nahi; Phase 5 se add honge).
  > Evidence: `pnpm --filter @pk/backend dev:worker` → `worker started workers: 0`; SIGTERM → `worker shutting down` exit 0.
- [x] Graceful shutdown (SIGTERM): stop accepting, drain, `pool.end()`, Redis quit.
  > Evidence: `server.ts` shutdown (app.close → pool.end → redis.quit → Sentry flush, 15 s force-exit); built `dist/worker.js` SIGTERM run exited cleanly.

### 1.6 Logging & Error Tracking (D-09)
- [x] **pino** structured JSON logs (pretty in dev), PII redaction paths (`phone`, `email`, `address`, `authorization`, `cookie`).
  > Evidence: `config/logger.ts` REDACT_PATHS; `app.test.ts › logs never contain PII fields`.
- [ ] **Sentry** in backend, storefront, admin (release + environment tags).
  > ⏳ Wired in all 3 apps (no-PII `dataCollection`), unknown-error capture tested with fake reporter — **real DSN se event verify pending** (Sentry project abhi nahi bana).

### 1.7 Testing Harness (D-08)
- [x] **Vitest** across workspaces.
  > Evidence: `packages/shared` 11 tests, backend unit 4 + integration 24.
- [x] **Testcontainers** (PostgreSQL 17 + Redis): integration tests real DB par, migrations auto-apply, per-test-file isolated DB/schema.
  > Evidence: `tests/helpers/global-setup.ts` (PG 17 + Redis 7.4 containers, migrations into template DB) + `test-db.ts` (per-file cloned DB).
- [x] Shared test helpers: `createTestDb()`, factory functions for users/pickup locations.
  > Evidence: `tests/helpers/test-db.ts` `createTestDb()`, `factories.ts` `createUser` / `createPickupLocation`.
- [x] **Playwright** setup (projects: 375px, 768px, 1440px) — Phase 4 se real specs.
  > Evidence: `playwright.viewports.ts` (mobile-375 / tablet-768 / desktop-1440); admin 3/3 + storefront 6/6 smoke passed locally.

### 1.8 Code Quality & CI
- [x] ESLint + Prettier (ya Biome — ek choose karo, dono nahi). Lint rule/script jo **hardcoded Tailwind colors** (`bg-yellow-500`, `text-gray-400`, `bg-[#...]`) ko fail kare (Rules §1.4). Import-boundary rules (`no-restricted-imports`) — `architecture/09-codebase-structure.md` §3 (layer direction, module public API only).
  > Evidence: ESLint + Prettier chose (Biome nahi); `eslint.config.js` import boundaries — 6 probe violations caught; `scripts/check-hardcoded-colors.mjs` + `scripts/tests/check-hardcoded-colors.test.mjs` (2/2).
- [ ] Pre-commit hook (lint-staged) for format + lint.
  > ⏳ `.husky/pre-commit` (lint-staged + colour check) — pehle commit par verify hoga.
- [ ] **GitHub Actions CI** on every PR: install (pnpm cache) → typecheck → lint → unit tests → integration tests (Testcontainers) → **migrations `up` → `down` → `up` round-trip** on a fresh PostgreSQL 17 service.
  > ⏳ `.github/workflows/ci.yml` likha (checks, integration, migrations round-trip, build, e2e) — **abhi GitHub par run nahi hua** (branch push pending).
- [ ] Branch protection: CI green required on `main`.
  > ⏳ GitHub repo settings — user action (CI ek baar green hone ke baad).

### 1.9 Design Tokens (Tailwind v4, D-12, D-13)
- [x] `packages/ui/src/styles/globals.css`: Tailwind v4 CSS-first config (`@import "tailwindcss"`, `@theme inline` mapping) — tokens **exactly** `Rules/00-project-rules.md` §1.4 se: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`, `destructive`, **`success`, `warning`, `info`** (+ `*-foreground`), `radius`, font tokens (serif headings + sans body).
  > Evidence: `globals.css` (D-46 palette, light + dark, `@theme inline`).
- [x] `.dark` me **har** token override (popover, accent, destructive, success/warning/info included).
  > Evidence: `.dark` block overrides every colour token incl. popover, accent, destructive, success/warning/info, tertiary, nonveg, overlay, shadow-float.
- [x] shadcn/ui (Tailwind v4 compatible) initialised in both apps, consuming `packages/ui` tokens.
  > Evidence: `components.json` in `packages/ui`, `apps/admin`, `apps/storefront` (monorepo aliases → `@pk/ui`); Button/Card/Badge/Input/Label in `packages/ui/src/components`.
- [x] Token preview page (`/dev/tokens` in admin dev build): har token + Button/Card/Badge/Input variants light & dark me.
  > Evidence: `apps/admin/src/modules/dev-tools/pages/TokensPage.tsx` (dev-only, prod build se bahar verified); screenshots `Phases/evidence/phase-01/tokens-{mobile-375,tablet-768,desktop-1440}.png`.

### 1.10 Shared Contracts (`packages/shared`)
- [x] Base Zod schemas: `PhoneSchema` (E.164 `+91[6-9]XXXXXXXXX`), `PincodeSchema`, `PaiseSchema` (non-negative int), `AddressSchema`, `RoleEnum`, `EnvelopeSchema<T>`.
  > Evidence: `packages/shared/src/schemas/*`; `tests/schemas.test.ts` (6 tests).
- [x] Money helpers: `formatINR(paise)`, no floats in arithmetic (D-26).
  > Evidence: `packages/shared/src/money.ts`; `tests/money.test.ts` (5 tests incl. D-41 floor split).

---

## 🚫 Out of Scope
- Auth endpoints & guards → **Phase 2**.
- Products/batches tables (`0002`) → **Phase 3**.
- Any real BullMQ job → **Phase 5+**.
- Production hosting/deploy → **Phase 10** (sirf CI is phase me).

---

## 🔍 Verification Checklist
- [x] `docker compose up` + `pnpm dev` se teeno apps (backend + worker, storefront, admin) start hote hain (fresh clone par README steps follow karke).
  > Evidence: storefront :3000 200, admin :5173 200, API `/readyz` 200, worker `worker started` (2026-10-11 local).
- [x] Invalid/missing env var par backend boot fail hota hai with readable error (unit test `env.test.ts`).
  > Evidence: `tests/unit/env.test.ts` 4/4.
- [x] `db.transaction` rollback test: simulated error ke baad koi row persist nahi; failing ROLLBACK par client destroy hota hai (integration test `db.transaction.test.ts`).
  > Evidence: `db.transaction.test.ts › rolls back every write…`, `› destroys a client whose ROLLBACK fails…`.
- [x] Pool connection leak test: 100 sequential transactions (with thrown errors) ke baad `pool.totalCount <= DB_POOL_MAX` aur `waitingCount = 0`.
  > Evidence: `db.transaction.test.ts › does not leak connections over 100 failing transactions`.
- [ ] Migration `0001` up → down → up CI me green.
  > ⏳ Local round-trip green; CI job pending first push.
- [x] `settings` seed rows exist; `users_staff_login` CHECK staff ko bina password reject karta hai (integration test).
  > Evidence: `migration-0001.test.ts › seeds the default settings`, `› rejects staff users without email + password`.
- [x] `GET /readyz` DB/Redis down hone par `503` deta hai.
  > Evidence: `app.test.ts › GET /readyz → 503 when the database is down`, `› … when Redis is down`.
- [x] Unknown thrown error → client ko `INTERNAL_ERROR` envelope, Sentry event, log me `requestId` (integration test).
  > Evidence: `app.test.ts › unknown error → INTERNAL_ERROR envelope, Sentry event, requestId in log, no stack leak`.
- [x] Hardcoded color lint rule ek sample violation par CI fail karta hai.
  > Evidence: probe `bg-yellow-500` → `check-hardcoded-colors.mjs` exit 1; CI step `pnpm check:colors`.
- [x] Ek CSS variable change karne par token preview page ke saare components light & dark dono me update (screenshot evidence).
  > Evidence: `--primary` temporarily swapped → `Phases/evidence/phase-01/tokens-swap-primary.png` (light swatch + CTA changed), then reverted.
- [x] `tsc --noEmit` + lint saare workspaces me clean.
  > Evidence: `pnpm typecheck` 5/5, `pnpm lint` 5/5, `pnpm format:check` clean, `pnpm build` 3/3.

---

## ✅ Definition of Done
Fresh machine par 1 command se local stack chalta hai, CI har PR par typecheck/lint/tests/migration round-trip chalata hai, DB client + migration `0001` production-ready hai, aur design tokens single source se poore UI ko control karte hain.
