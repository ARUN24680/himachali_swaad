# Worker down / queue backlog / failed jobs / 5xx spike

**Alerts:** uptime monitor on `GET /healthz/worker` (503 = no heartbeat for > 90 s);
`QUEUE_BACKLOG` (> 200 waiting or oldest > 10 min); `JOBS_FAILED`; `SERVER_ERRORS_SPIKE`
(> 20 API 5xx in 10 min).

## Worker down / backlog
1. `GET https://api.<domain>/healthz/worker` → `{alive, lastBeatAt, ageSec}`.
2. Host console: is the worker container running? Restart loops? Last logs (`pk-worker`).
   Common causes: bad env after a deploy (the worker exits on invalid env — the log says which
   variable), Redis unreachable, DB connections exhausted (see docs/ops/capacity.md).
3. Restart / roll back the worker. Jobs are durable in Redis and resume; the cron jobs
   (`EXPIRE_RESERVATIONS`, `RECONCILE_*`) catch up whatever was missed.
4. Ops → Job queues (bull-board): backlog draining? If one job type is stuck failing, read its
   error, fix, then **Retry** the failed jobs (all job handlers are idempotent per job id).

## 5xx spike
1. Sentry → Issues → sort by events in the last hour; the release tag says which deploy.
2. `GET /readyz` — DB/Redis down? (provider status page).
3. Just deployed? **Roll back** first, debug after.
4. Watch the alert clear in the next `OPS_ALERTS` run (10 min).
