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

> Status: folder skeleton only. Dependencies install, version pinning aur entry files **Phase 1** (`Phases/phase-01-monorepo-core-db.md`) me.
