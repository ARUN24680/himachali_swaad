# Docker startup, local development, and data recovery

The full stack lives in `docker-compose.prod.yml`. Its defaults support local testing with mock providers. The filename does **not** mean the default configuration is ready for a public production launch. D-57 and the Phase 10 go-live checklist still apply: real providers, secure cookies, real credentials, HTTPS, and verified backups. No production checks were disabled during this repair.

## Choose the application mode

Run from the repository root with Docker Desktop running:

```sh
# Local Node development; automatically starts the selected PG/Redis services and runs dbmate.
npm run dev

# Or build and run all applications inside Docker.
docker compose -f docker-compose.prod.yml up -d --build --wait
```

| Component | Local Node apps | Full Docker apps |
| :--- | :--- | :--- |
| Storefront | `http://localhost:3000` | `http://localhost:3001` |
| Admin/partner | `http://localhost:5173` | `http://localhost:5174` |
| API readiness | `http://localhost:4000/readyz` | `http://localhost:4001/readyz` |
| Worker heartbeat | `http://localhost:4000/healthz/worker` | `http://localhost:4001/healthz/worker` |
| Nginx storefront proxy | — | `http://localhost:8080` |

Admin is served at the root of its own port, not under `/admin/` on the storefront proxy. The supplied Nginx config serves HTTP only; publishing port 8443 does not configure TLS.

`npm run dev` uses `scripts/dev-infra.mjs`: local database/Redis ports `5433/6380` select the original infra Compose file; `5435/6381` select the full Docker infra. It preserves volumes, waits for health checks, and applies migrations before starting Turbo. Custom database endpoints are left alone. Never run `down -v` to fix a connection error.

The original and full Compose project names create **different data volumes**. Schema migrations create tables and defaults; they do not transfer users, inventory, orders, uploaded files, or Redis job state. Keep local development and Docker pointed at the same database when you expect the same records.

## Browser URLs, LAN, and container URLs

- Empty `NEXT_PUBLIC_API_URL` / `VITE_API_URL` means same-origin browser requests. Next/Vite/admin Nginx proxy `/api/v1` to the backend. Next's own `/api/revalidate` remains a Next route.
- `INTERNAL_API_URL` is `http://127.0.0.1:4000` for local frontend servers and `http://backend-api:4000` inside Docker.
- Backend `API_PUBLIC_URL` is a browser-reachable address for images, uploads, and signed document links. `API_INTERNAL_URL` is used by container workers calling the shipping sandbox.
- Docker build arguments come from `.env`: `DOCKER_API_PUBLIC_URL`, `DOCKER_STOREFRONT_URL`, and optional `DOCKER_BROWSER_API_URL`. Public Next/Vite variables are compiled into the bundle; changing a container runtime variable alone does not update browser JavaScript. Rebuild the frontend images after changing public URLs.
- For LAN access, use the machine's LAN IP in public URLs and add the exact frontend origins to `APP_ORIGINS` (CORS and CSRF). Set app port bindings to `0.0.0.0:3001`, `0.0.0.0:5174`, `0.0.0.0:4001` as needed. PostgreSQL and Redis stay on loopback.
- Local HTTP builds do not send HTTPS-upgrade/HSTS policies. HTTPS site builds keep them. The image optimizer only permits the configured product asset host/path; local images cannot redirect to other private endpoints.
- Local public/private uploads are bind-mounted from `apps/backend/.uploads` and `.uploads-private` into both Docker API and worker. Keep these directories with the database backups. Real production uses R2 per D-11.

## Diagnosis and migrations

```sh
docker compose -f docker-compose.prod.yml ps -a
curl http://localhost:4000/readyz
curl http://localhost:4001/readyz
pnpm db:status
pnpm db:up
docker compose -f docker-compose.prod.yml logs --tail=100 backend-api backend-worker
```

A `migrate` container showing **Exited (0)** is successful: it is a one-shot dbmate job. API startup waits for its successful completion. `readyz` checks PostgreSQL and Redis; `healthz` alone only proves the API process is alive.

HTTP Redis commands have a three-second deadline. Worker connections keep BullMQ's indefinite recovery behavior. Disconnected API dependencies return an error instead of leaving a session/catalog request pending. Browser requests have a 15-second deadline and storefront server fetches a 10-second deadline. This follows [BullMQ's guidance for HTTP producers versus workers](https://docs.bullmq.io/guide/connections).

## Storefront build killed with exit code 137

`Killed` followed by exit code **137** means the build received SIGKILL. Host or container out-of-memory killing is a common cause, but the exit code alone does not prove it. Check the Ubuntu build host immediately after the failure:

```sh
free -h
swapon --show
docker info --format 'Docker memory: {{.MemTotal}} bytes; CPUs: {{.NCPU}}'
docker stats --no-stream
sudo journalctl -k --since '30 minutes ago' | grep -Ei 'out of memory|oom-kill|killed process|memory cgroup'
docker buildx ls
```

The `Mem:` line in `free -h` reports RAM; `df -h` reports disk space. Even a host with 20 GB RAM can have little available memory, a smaller Docker VM allocation, or a separate BuildKit cgroup limit. For a `docker-container` builder, inspect the corresponding BuildKit container's memory limit and OOM state. For a remote builder, check its host instead. Runtime service `mem_limit` settings do not configure BuildKit's build containers. If kernel logs show no OOM kill, check CI timeouts and other processes sending SIGKILL.

The storefront Dockerfile now runs `next build --webpack` with `NEXT_BUILD_LOW_MEMORY=true`: one page-generation worker and Next's [Webpack memory optimizations](https://nextjs.org/docs/app/guides/memory-usage). The default Webpack build worker remains enabled. Type checking still runs. Normal local/CI builds retain Next's default bundler and worker settings. These options reduce build memory demand; they cannot guarantee success under every host or builder limit.

`NODE_OPTIONS=--max-old-space-size=1536` limits **each Node process's V8 old-space heap**, not total build memory. Native allocations, other heap spaces, child processes, Docker, and running services need additional RAM. Do not increase it solely because the process exited 137. If the build instead reports `JavaScript heap out of memory` and the builder has enough headroom, override it explicitly, for example `docker compose -f docker-compose.prod.yml build --build-arg NODE_OPTIONS=--max-old-space-size=3072 storefront`.

After copying the updated Dockerfile and Next config to the server, rebuild sequentially, then start the stack only if both builds succeed:

```sh
docker compose -f docker-compose.prod.yml build admin &&
docker compose -f docker-compose.prod.yml build storefront &&
docker compose -f docker-compose.prod.yml up -d --no-build --wait
```

This assumes the other service images have already been built. For a full rebuild on a shared host, use `docker compose -f docker-compose.prod.yml --parallel 1 build` before `up -d --no-build --wait`. Do not remove database/Redis volumes or disable the OOM killer to repair a build. If memory remains constrained, increase the builder's allocation or build the image on a separate machine/CI runner matching the deployment architecture. Docker's [memory guidance](https://docs.docker.com/engine/containers/resource_constraints/) explains host OOM killing and the trade-off of using swap.

Verification on 2026-10-16 (local Linux/arm64 Docker engine, 8,319,504,384 bytes of total engine memory):

- `docker compose -f docker-compose.prod.yml build storefront` passed with the default 1536 MiB heap cap. Next 16.3.8 reported Webpack, `cpus: 1`, and `webpackMemoryOptimizations`; compilation, TypeScript, and all 20 static pages completed. The Next build step took 51.3 seconds on this machine.
- A temporary `--network none --memory=512m` runtime container served `/faq`, `/track`, `/robots.txt`, and all 26 JavaScript/CSS assets referenced by `/faq` with HTTP 200. The 512 MiB limit was for this runtime smoke check, **not the image build**. The standalone manifest retained the build settings and type checking; builder-only environment variables were absent from the runner.
- Storefront lint, Prettier checks, `git diff --check`, and direct config assertions for normal versus low-memory mode passed.

These checks verify the Docker build and standalone output locally. The reported Ubuntu server's OOM cause and its available RAM/BuildKit limit remain unverified until its diagnostics and rebuild are checked.

## Recovery performed on 2026-10-15 UTC / 2026-10-16 IST

Observed failures:

1. Docker engine was initially unavailable. After it recovered, the original PostgreSQL and Redis containers remained stopped. Local `.env` still targeted their ports `5433/6380`; `/readyz` returned 503 with both dependencies down.
2. The API used worker-style infinite Redis retries for HTTP requests. A catalog request timed out without a response while Redis was down, matching the stuck skeleton/session screens.
3. Browser API URLs were `localhost:4000`, and only localhost frontend origins were allowed. A browser on another LAN device would call itself.
4. The full Docker database contained six seeded products but no users, batches, or orders. The original database held three users, seven products, eleven batches, and sixty-two orders.
5. Docker frontend public URLs were not consistently supplied at build time. Local uploads were not persisted/shared between containers. The Docker ignore file also failed to exclude nested build caches.

Recovery preserved the old databases and volumes and created:

- Database `pahadi_khatki_migrated_20261015` inside the full stack's existing PostgreSQL volume.
- Separate Redis volume `pahadi-khatki-prod_redis_migrated_20261015`, restored from the original RDB and converted to AOF before enabling application workers.
- Private, gitignored backups under `packages/database/backups/20261015T182407Z/`: original and previous Docker PostgreSQL dumps, both Redis snapshots, and pre-change local environment files. These contain private data and must not be committed or uploaded casually.

Local `.env` now targets PostgreSQL `localhost:5435` and Redis `localhost:6381`, so local and Docker applications share the migrated data. Original containers were stopped after verification; their original volumes remain intact. Existing login credentials were retained.

Evidence recorded during recovery:

- All **26 PostgreSQL tables** matched source row counts and MD5 hashes of sorted full-row JSON before application workers restarted.
- Restored Redis loaded **1,233 keys**, with AOF enabled and the last rewrite/write status `ok`.
- `pnpm db:status`: **7 applied, 0 pending**.
- Backend unit tests: **42 passed**.
- Focused integration tests (`app`, `redis-outage`, `cookies-csrf`, `jobs`): **24 passed**, using isolated real PostgreSQL and Redis containers.
- Frontend typecheck/lint passed; admin Playwright refresh and timeout/cancellation regressions: **2 passed**.
- LAN browser checks passed for local `3000/5173` and Docker `3001/5174` at **375, 768, and 1440 px**, light and dark. Storefront home/catalog and images rendered; admin reached `/login`; no page exceptions, broken images, or horizontal overflow. Nginx `8080` also passed. Screenshots: `test-results/recovery/` (gitignored).
- Docker images built successfully; both API `/readyz` endpoints and worker heartbeat endpoints returned 200. Docker migration job exited 0. All workspaces passed typecheck/lint; final inventory ledger mismatch count was **0**.

## Backups and updates

The optional cloud backup service is behind the `backup` profile. Configure and verify the destination before enabling it. A successful local dump does not prove S3 retention, encryption, or a ten-year backup policy.

```sh
# Optional, after configuring the intended backup destination:
docker compose -f docker-compose.prod.yml --profile backup up -d backup-service

# Apply code and migration changes together; single-instance recreation can cause brief downtime.
docker compose -f docker-compose.prod.yml up -d --build --wait
```

For recovery, restore a verified dump into a **new database**, verify table counts and the inventory ledger, and switch the application's database name. Keep the previous database and backups until the restored app is verified. Restore Redis state and local upload directories as part of local/mock environment recovery. Do not import a full dump over a database with unrelated live records.
