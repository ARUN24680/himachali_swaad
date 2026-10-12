# Monitoring, alerts & Sentry (Phase 10 §10.3, D-57 f–g)

## Uptime monitors (UptimeRobot / Better Stack, 1-min interval, alert → WhatsApp/e-mail of both partners)
| Monitor | URL | Healthy |
| :--- | :--- | :--- |
| Storefront | `https://pahadikhatki.in/` | 200 |
| API liveness | `https://api.pahadikhatki.in/healthz` | 200 |
| API readiness (DB + Redis) | `https://api.pahadikhatki.in/readyz` | 200 (503 names the failing dependency) |
| Worker heartbeat | `https://api.pahadikhatki.in/healthz/worker` | 200; 503 when the worker hasn't written `pk:worker:heartbeat` for > 90 s |
| Admin | `https://admin.pahadikhatki.in/` | 200 |

Health routes are excluded from rate limiting.

## In-app alerts (`ADMIN_ALERT` → WhatsApp/e-mail to admins, batched per kind — Phase 8 §8.6)
| Alert | Source | Threshold |
| :--- | :--- | :--- |
| `SERVER_ERRORS_SPIKE` | `OPS_ALERTS` (every 10 min) — Redis `pk:5xx:<minute>` | > 20 API 5xx in 10 min |
| `JOBS_FAILED` | `OPS_ALERTS` — BullMQ failed count | any new failed job since last run |
| `QUEUE_BACKLOG` | `OPS_ALERTS` — BullMQ waiting | > 200 waiting or oldest > 10 min |
| `OPS_ISSUES_OPEN` | `OPS_ALERTS` — `orders.ops_issue` | open > 1 h |
| `WEBHOOK_FAILURES` | `OPS_ALERTS` — `webhook_events.last_error` | any unprocessed failure in the last hour |
| `PAYMENTS_STUCK` | `OPS_ALERTS` — `PENDING_PAYMENT` | > 10 min past `reservation_expires_at` |
| `WALLET_LOW` | `CHECK_WALLET_BALANCE` (hourly) | below `shiprocket_wallet_min_paise` setting |
| `LEDGER_MISMATCH` | `LEDGER_CHECK` (daily 03:30 IST) | any batch drift |
| `BOOKING_FAILED`, `PICKUP_*`, `AWB_CANCEL_FAILED`, `WEIGHT_DISCREPANCY`, `UNKNOWN_AWB`, NDR | logistics / webhooks (Phase 6–8) | per event |

Each alert kind fires at most once per 10-minute window. Runbook per kind: `docs/runbooks/README.md`.

**Test the path:** Admin → Dashboard → Operations → **Send test alert**
(`POST /api/v1/admin/ops/test-alert`, audited as `ALERT_TEST`). Do this once after go-live and
after any messaging-provider change; confirm the message arrives on both partners' phones.

## Ops dashboard
Admin → Dashboard → Operations (`GET /api/v1/admin/ops/metrics`): confirmed orders per IST hour (last
24 h), refunds (30 d count + processed amount), NDR rate and RTO rate (30 d, % of shipped orders).
**Conversion rate** comes from GA4 (Reports → Monetisation → Checkout journey), not the API (D-57 g).

## Sentry
Four projects (or one project with four `environment`/`service` tags): API, worker, storefront, admin.

| App | DSN env | Release env | Source maps |
| :--- | :--- | :--- | :--- |
| API / worker | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | `RELEASE` | esbuild bundle (`scripts/build.mjs`) emits `dist/*.js.map`: start with `node --enable-source-maps dist/server.js` (readable stack traces in logs) and upload `apps/backend/dist` to Sentry |
| Storefront | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `NEXT_PUBLIC_RELEASE` | upload `.next/static` maps in CI (below) |
| Admin | `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` | `VITE_RELEASE` | Vite builds with `sourcemap: true` — upload `dist/` then delete `*.map` before publishing |

Set every `*RELEASE` to the **git SHA** of the deploy (`$GITHUB_SHA`, Vercel `VERCEL_GIT_COMMIT_SHA`).
Upload maps in the deploy job (needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` secrets):

```bash
npx @sentry/cli releases new "$GITHUB_SHA"
npx @sentry/cli sourcemaps upload --release "$GITHUB_SHA" apps/backend/dist
npx @sentry/cli sourcemaps upload --release "$GITHUB_SHA" apps/admin/dist
npx @sentry/cli sourcemaps upload --release "$GITHUB_SHA" apps/storefront/.next/static --url-prefix '~/_next/static'
npx @sentry/cli releases finalize "$GITHUB_SHA"
find apps/admin/dist -name '*.map' -delete   # never publish maps
```

PII: all four SDKs run with `dataCollection` off (no user info, cookies, bodies, query strings);
the API logger redacts phone/email/address/password/otp/tokens (`log-redaction.test.ts`).
