# Capacity & connection pool sizing (Phase 10 §10.2)

## PostgreSQL connections
Each process opens one `pg` pool of `DB_POOL_MAX` connections (default **10**, env-validated 1–100).

```
total = DB_POOL_MAX_api × api_replicas + DB_POOL_MAX_worker × worker_replicas + headroom
```

| Setup | API | Worker | Total app connections | Needs `max_connections` ≥ |
| :--- | :--- | :--- | :--- | :--- |
| Launch (1 API + 1 worker) | 10 × 1 | 10 × 1 | 20 | 20 + 10 (admin/psql/migrations/monitoring) = **30** |
| Busy (2 API + 1 worker, autoscale max) | 10 × 2 | 10 × 1 | 30 | **40** |
| Scale-out (4 API + 2 worker) | 10 × 4 | 10 × 2 | 60 | **70** → consider PgBouncer (transaction mode) |

Smallest managed PG plans allow 25–100 connections; keep the **autoscaling maximum** of the API
within the table row that fits the plan. The provider reserves a few connections for itself
(superuser), so leave ≥ 10 free.

Worker: `WORKER_CONCURRENCY` (default 5) jobs per queue run at once; each job holds at most one
connection at a time (one transaction), so 10 connections cover it with headroom.

Rule of thumb when changing anything: `Σ pools + 10 ≤ max_connections`. Check live usage:
```sql
SELECT application_name, count(*) FROM pg_stat_activity GROUP BY 1 ORDER BY 2 DESC;
```
(`application_name` = `pk-api` / `pk-worker`, set from `PROCESS_NAME`.)

## Measured (local k6 run, 2026-10-12 — `Phases/evidence/phase-10/`)
- 50 concurrent create-order on a 20-jar product with **one API process, DB_POOL_MAX=10**:
  create-order p95 198 ms, 20 sold / 30 sold-out, 0 oversell, 0 deadlocks, ledger 0 mismatches.
- Reads (products, track, admin orders) at 20 rps: p95 12 ms.
- Top query by total time = FIFO batch `SELECT … FOR UPDATE` (lock waits by design under a spike).

The expected launch load (pilot batch, Instagram traffic) is far below this; one API replica +
one worker is enough. Scale API replicas before raising `DB_POOL_MAX`.

## Redis
One connection per BullMQ worker/queue plus the API client (~10–15 total). Managed Redis free/small
plans (30+ connections) are enough. Persistence: see `docs/runbooks/restore-from-backup.md`.
