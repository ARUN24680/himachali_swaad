# Data restore from backup (managed PostgreSQL PITR)

Production DB = managed PostgreSQL 17 with **point-in-time recovery** (doc 00). Redis holds only
queues, rate-limit counters, OTPs and the mock outboxes — it is **not** a system of record; losing
it loses at most in-flight jobs, which the reconcile jobs re-create.

## When
Accidental delete/update, corrupted data after a bad migration, provider incident.

## Steps
1. **Stop writes** if data is being damaged: scale API + worker to 0 (or put the storefront in
   maintenance), note the exact time **T** of the mistake (Admin → **Audit log** / logs).
2. In the provider console create a **new** instance restored to **T − 1 min** (never restore over
   the live DB).
3. Verify the restored instance (read-only):
   ```sql
   SELECT (SELECT count(*) FROM orders) orders, (SELECT count(*) FROM payments) payments,
          (SELECT count(*) FROM refunds) refunds, (SELECT count(*) FROM inventory_movements) movements,
          (SELECT max(created_at) FROM orders) last_order;
   ```
   plus the ledger query from stock-ledger-mismatch.md (must return 0 rows) and
   `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1` (= current migration).
4. Choose:
   - **Small damage** (a few rows): copy the rows from the restored instance into live with
     reviewed `INSERT … SELECT` / `pg_dump --data-only -t <table> --where`, keep the live DB.
   - **Large damage:** point `DATABASE_URL` of API + worker at the restored instance, redeploy.
     Orders placed between T and now must be re-entered from Razorpay (payments) — list them from
     the Razorpay dashboard for that window.
5. Start worker then API; run `GET /readyz`, `GET /healthz/worker`; watch Sentry 30 min.

## Restore drill (Phase 10 verification — staging)
Restore staging to "now − 15 min", run step 3, record: start time, end time, row counts, RPO/RTO,
who did it — in `docs/launch/restore-drill.md`. Repeat every quarter.

Redis persistence: managed Redis with AOF (`appendfsync everysec`) or RDB snapshots every 5 min is
enough; BullMQ jobs lost in a Redis loss are recreated by `RECONCILE_CONFIRMED` /
`RECONCILE_REFUNDS` / `EXPIRE_RESERVATIONS`.
