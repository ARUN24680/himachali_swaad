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
npm run dev                        # starts selected Docker infrastructure, applies migrations, then all apps
```

| URL | What |
| :--- | :--- |
| http://localhost:3000 | Storefront |
| http://localhost:5173 | Admin / partner portal · `/dev/tokens` = design token preview |
| http://localhost:4000/healthz · `/readyz` | API liveness / readiness |

`npm run dev` starts PostgreSQL/Redis selected by `.env`: ports `5433/6380` use
`docker-compose.yml`; ports `5435/6381` use `docker-compose.prod.yml`. Both setups keep
their named volumes. The application servers use ports `3000/5173/4000` in either case.
Use pnpm for dependency installation; npm here only invokes the workspace's dev script.

For LAN access, keep the frontend public API variables blank (same-origin proxies), add
the exact LAN frontend URLs to `APP_ORIGINS`, and set `API_PUBLIC_URL` plus
`NEXT_PUBLIC_ASSETS_BASE_URL` to the reachable API host for uploaded files. Restart dev
after changing environment files.

Full Docker apps use ports `3001/5174/4001`. See [Docker startup and recovery](docs/ops/docker-production.md)
for build-time URLs, shared data, backups, and the October 2026 recovery verification.

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

Phase status and outstanding launch requirements: [`Phases/00-phases-master.md`](Phases/00-phases-master.md).

## Ten demo pickle products

The optional demo set adds **10 new 250 g products** (3 chicken, 3 mutton, 2 fish, 2 prawn),
each with its own photo, complete sample product details and **32 sellable jars**. Both admin
and storefront read these records from the same database. Existing products, photos, staff,
customers, settings and orders are not replaced. This does not adopt the older six launch seeds.

Run from the repository root, with the database running and `.env` pointing to the desired
local database. The commands require `NODE_ENV=development` (or `test`), `STORAGE_DRIVER=local`,
an existing active admin and an active pickup location.

```bash
pnpm db:up                         # includes 0008_demo_catalog.sql; schema only, no demo products
pnpm db:demo:status                # lists this demo set and available kitchen codes
# If more than one kitchen exists, set DEMO_KITCHEN_CODE in .env, or prefix the command:
DEMO_KITCHEN_CODE=HP-KULLU-01 pnpm db:demo:seed

pnpm db:demo:seed                  # insert missing / restore cleared demos; existing demos unchanged
pnpm db:demo:clear                 # hide these demos from shop/admin lists and zero remaining stock
pnpm db:demo:reset                 # restore fixture details + photos + 32 fresh jars per demo product
pnpm db:demo:status
```

`npm run db:demo:seed`, `npm run db:demo:clear` and `npm run db:demo:reset` also work.
The current recovered local/Docker setup shares its database and uploads, so run a command
**once from the host** to update both. Rebuild the Docker backend after pulling the migration
and repository changes: `docker compose -f docker-compose.prod.yml up -d --build backend-api backend-worker`.
The script invalidates the storefront cache using `STOREFRONT_REVALIDATE_URL` and
`DOCKER_STOREFRONT_URL` when configured; refresh open browser pages afterwards.

Seed is idempotent: rerunning it does not add stock or overwrite admin edits. Reset intentionally
restores this demo set's original values. Clear/reset refuse unfinished demo orders; finish or
cancel them through the normal app first. Clear is **archival**, not destructive deletion:
product IDs, completed orders, images, batches, append-only stock movements and audit history
remain for traceability. Reinsert creates fresh dated batches and balanced ledger entries.
The ownership table prevents matching SKUs from accidentally modifying a real product.

Products are visibly named `(Demo)` and sample compliance fields are labelled as such.
They are development fixtures, not verified nutrition, tax or shelf-life information.
The generated photo assets and exact prompts are checked into
[`packages/database/seeds/demo-catalog`](packages/database/seeds/demo-catalog).
They were created with the built-in `image_gen` tool; rerunning the seed uses the saved files
and requires no image API or external photo URLs.

Implementation: [`apps/backend/scripts/demo-catalog.ts`](apps/backend/scripts/demo-catalog.ts).
Regression coverage: [`demo-catalog.test.ts`](apps/backend/tests/integration/demo-catalog.test.ts)
checks concurrent seeding, storefront/admin/cart visibility, clear/reinsert/reset, preservation
of existing products, ledger balance, SKU collisions and live-order protection.
