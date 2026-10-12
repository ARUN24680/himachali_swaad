# Load tests (Phase 10 §10.2)

`k6/checkout-spike.js` — two scenarios against a running API:

| Scenario | What | Pass criteria |
| :--- | :--- | :--- |
| `spike` | 50 VUs at once, each creates one order for **1 jar** of a product (`PRODUCT_ID`) with only 20 jars left, then pays + verifies via the mock gateway | `unexpected_status == 0` (only 201 or `OUT_OF_STOCK`); afterwards SQL checks: stock 0, sold = STOCK, ledger mismatches 0, no deadlocks |
| `reads` | 20 req/s for 30 s: `GET /products`, `POST /track`, `GET /admin/orders` | `http_req_duration{kind:read}` p95 < 200 ms |

## Run locally
```bash
# 1. throw-away Postgres with pg_stat_statements + Redis
docker run -d --name pk-load-pg -p 5440:5432 -e POSTGRES_PASSWORD=pk postgres:17-alpine \
  -c shared_preload_libraries=pg_stat_statements
docker run -d --name pk-load-redis -p 6390:6379 redis:7-alpine
# 2. point .env (DATABASE_URL / REDIS_URL) at them, migrate + seed (admin via SEED_* env, demo catalog)
pnpm db:up
pnpm db:seed:staff && pnpm db:seed:catalog -- --demo --publish
#    then bring one SKU (e.g. CHK250) to exactly 20 sellable jars with Admin → Inventory → Adjust
# 3. API with test-only overrides (never in production — env validation refuses them)
PORT=4200 TRUST_PROXY=true CHECKOUT_IP_LIMIT=100 pnpm --filter @pk/backend dev
# 4. load
k6 run -e API=http://localhost:4200 -e PRODUCT_ID=<uuid of that product> \
  -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… --summary-export k6-summary.json load/k6/checkout-spike.js
```
VUs send a random `x-forwarded-for` so the per-IP checkout limit doesn't turn the spike into 429s
(that is why `TRUST_PROXY=true` is needed for the run).

After the run, check the DB (queries in `Phases/evidence/phase-10/k6-checkout-spike-db-checks.txt`)
and `SELECT … FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15`.

## Last result (2026-10-12)
`Phases/evidence/phase-10/k6-summary.json`: 20 reserved + confirmed, 30 sold-out, 0 unexpected,
read p95 12 ms, create-order p95 198 ms; stock 0, ledger mismatches 0, deadlocks 0. Re-run on
staging before go-live (pending, `requirement/pending-requirements.md`).
