# Pahadi Khatki

Himachali non-veg pickle e-commerce + operations platform (customer storefront, admin portal, Kitchen Partner packing desk PWA).

## Monorepo

| Workspace | Path | Stack |
| :--- | :--- | :--- |
| `@pk/backend` | `apps/backend` | Fastify 5 API (`server.ts`) + BullMQ worker (`worker.ts`), Pure Raw SQL (`pg`) |
| `@pk/storefront` | `apps/storefront` | Next.js 16 App Router, React 19 |
| `@pk/admin` | `apps/admin` | Vite + React 19 SPA, Admin + Partner PWA |
| `@pk/shared` | `packages/shared` | Zod contracts, types, order transitions, error codes |
| `@pk/database` | `packages/database` | dbmate migrations + seeds |
| `@pk/ui` | `packages/ui` | Tailwind v4 tokens, shadcn/ui primitives |
| `@pk/tsconfig` | `packages/tsconfig` | Shared TypeScript presets |

Structure aur code organisation rules: [`architecture/09-codebase-structure.md`](architecture/09-codebase-structure.md).
Agents/devs ke liye reading order: [`AGENTS.md`](AGENTS.md).

## Local setup (fresh clone)

Prerequisites: Node.js 24 (`nvm use`), pnpm 12 (`corepack enable`), Docker.

```bash
pnpm install                       # exact pinned versions, 7-day release-age guard
cp .env.example .env               # backend + dbmate (local values match docker-compose)
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/admin/.env.example apps/admin/.env.local
docker compose up -d --wait        # PostgreSQL 17 (:5433) + Redis 7 (:6380)
pnpm db:up                         # apply migrations
pnpm dev                           # storefront :3000 · admin :5173 · API :4000 · worker
```

| URL | What |
| :--- | :--- |
| http://localhost:3000 | Storefront |
| http://localhost:5173 | Admin / partner portal · `/dev/tokens` = design token preview |
| http://localhost:4000/healthz · `/readyz` | API liveness / readiness |

## Everyday commands

| Command | Does |
| :--- | :--- |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Types, ESLint (incl. import boundaries), Prettier |
| `pnpm check:colors` | Fails on hardcoded colours (Rules §1.4) |
| `pnpm test` | Unit tests |
| `pnpm test:integration` | Real PostgreSQL 17 + Redis via Testcontainers (Docker required) |
| `pnpm test:e2e` | Playwright at 375 / 768 / 1440 (`pnpm exec playwright install chromium` once) |
| `pnpm db:new <name>` · `db:up` · `db:down` · `db:status` | dbmate migrations (`packages/database/migrations`) |
| `pnpm build` | Production builds (backend → esbuild bundle in `apps/backend/dist`) |

> Status: **Phase 1 (foundation) complete** — evidence in `Phases/phase-01-monorepo-core-db.md`. Next: Phase 2 (auth, RBAC, sessions).
