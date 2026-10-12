# 🏔️ Pahadi Khatki — Project Architecture & Execution Master Index

Yeh directory **Pahadi Khatki** (Himachali Non-Veg Pickle E-Commerce & Operations Ecosystem) ka complete, modular planning directory hai. Har ek module ko separate, actionable files me toda gaya hai taaki hum step-by-step bina kisi rush ke build kar sakein.

---

## 📖 Reading Order (naye developer / AI agent ke liye)
1. [`../Rules/00-project-rules.md`](../Rules/00-project-rules.md) — Constitution
2. [`08-decisions-log.md`](./08-decisions-log.md) — Final decisions (conflict me yahi jeetega)
3. [`07-order-state-machine.md`](./07-order-state-machine.md) — Order lifecycle + reservation
4. [`01-database-schema-models.md`](./01-database-schema-models.md) — Schema v2
5. [`09-codebase-structure.md`](./09-codebase-structure.md) — Folder structure + code organisation (koi bhi file banane se pehle)
6. [`../Phases/00-phases-master.md`](../Phases/00-phases-master.md) — Build roadmap, phir specific phase file

---

## 🗂️ Documentation Structure & Modules

| File | Module / Area | Focus & Responsibility |
| :--- | :--- | :--- |
| **[Rules/00-project-rules.md](../Rules/00-project-rules.md)** | **🔥 Project Rules & Quality Mandates** | **MANDATORY CONSTITUTION**: Responsiveness, Tailwind v4 + shadcn/Radix only, semantic tokens, Pure Raw SQL (`pg`), security, compliance, verification protocol. |
| **[00-master-architecture.md](./00-master-architecture.md)** | **System Overview & Tech Stack** | Next.js 16, React 19, Fastify 5, PostgreSQL 17 (`pg`), BullMQ + Redis, deployment topology. |
| **[01-database-schema-models.md](./01-database-schema-models.md)** | **Database Schema v2** | `dbmate` migrations, tables, constraints, `db.ts` client, migration → phase mapping. |
| **[02-backend-api-spec.md](./02-backend-api-spec.md)** | **Backend API Contracts** | Envelope, error codes, endpoints by role, webhooks, background jobs, rate limits. |
| **[03-storefront-ux-customer.md](./03-storefront-ux-customer.md)** | **Customer Storefront (Next.js 16)** | Page map, cart + quote, checkout, tracking, legal pages, compliance badges. |
| **[04-admin-operations-portal.md](./04-admin-operations-portal.md)** | **Admin & Partner Portal (React 19 + Vite)** | Admin pages, Kitchen Partner Packing Desk PWA, settlement formula. |
| **[05-logistics-packaging-sop.md](./05-logistics-packaging-sop.md)** | **Physical Operations & Packaging SOP** | Zero-leakage protocol, QC, FSSAI label contents, procurement. |
| **[06-step-by-step-build-roadmap.md](./06-step-by-step-build-roadmap.md)** | **Roadmap Summary** | Phase 0–10 one-line summary (details in `Phases/`). |
| **[07-order-state-machine.md](./07-order-state-machine.md)** | **Order State Machine** | Statuses, allowed transitions, stock reservation, payment confirmation, Shiprocket mapping, notifications. |
| **[08-decisions-log.md](./08-decisions-log.md)** | **Architecture Decisions Log** | D-01 … D-53 decisions + open business questions (Q-01 … Q-07). |
| **[09-codebase-structure.md](./09-codebase-structure.md)** | **Codebase Structure** | Monorepo folders, backend Nexus module pattern (routes → controller → service → repository), hybrid frontend (ui → common → modules), naming conventions. |
| **[Phases/00-phases-master.md](../Phases/00-phases-master.md)** | **Execution Phases** | Phase 0–10 detailed checklists — **roadmap ka single source of truth**. |

---

## 🧭 Core Principles

1. **Rule-First Execution:** Har ek phase shuru hone se pehle `Rules/00-project-rules.md` aur `08-decisions-log.md` ko benchmark refer kiya jayega.
2. **Modular Build:** Har phase independent hoga. Jab tak pichla phase evidence ke saath verify nahi hoga, agla start nahi hoga.
3. **Latest & Future-Proof:** React 19, Next.js 16 App Router, strict TypeScript, Zod 4 validations.
4. **Role Decoupled:** Kitchen Partner ko complex tech nahi sikhna padega — unke liye mobile-first PWA packing desk hoga.
5. **Reliability First:** Payments aur inventory ke liye zero race conditions, DB-based reservations, aur guaranteed webhook idempotency.
