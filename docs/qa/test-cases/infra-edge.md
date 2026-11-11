# Test cases — edge (nginx), deploy gate, storefront host policies

Audit 2026-11-03 (R-3, R-8, R-9, R-11, R-13, R-14, R-21, M-1–M-9). Columns: ID | Area | Precondition | Steps | Expected | Automated test | Manual?

| ID | Area | Precondition | Steps | Expected | Automated test | Manual? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| EDGE-01 | nginx render | any of `STAGING_HTTPS` off/on × `LAUNCH_MODE` coming-soon/live | render template, `nginx -t` | test is successful for all 4 combinations | `docs/ops/staging-https.md` §5 loop (run 2026-11-03: 4/4 successful) | scripted |
| EDGE-02 | Staging HTTPS | `STAGING_HTTPS=on` | `GET http://staging…/products` | `301` → `https://staging…/products` | stub run 2026-11-03 (§6 of audit doc) | scripted |
| EDGE-03 | HSTS | any TLS host | `GET https://…` (page, API, admin, robots, locked redirect) | exactly one `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (upstream copy hidden) | stub run 2026-11-03 | scripted |
| EDGE-04 | Staging noindex | staging host | `GET /`, `/admin/`, `/robots.txt` | `X-Robots-Tag: noindex, nofollow, noarchive`; robots = `Disallow: /` | stub run 2026-11-03 | scripted |
| EDGE-05 | Prod lock | `LAUNCH_MODE=coming-soon` | `GET /`, `/products` | `302 /coming-soon`; `/coming-soon`, `/_next/*`, `/.well-known/security.txt` proxied | stub run 2026-11-03 | scripted |
| EDGE-06 | Raw IP | — | `GET http://<ip>/`, `https://<ip>/` | connection closed (444), no redirect leaking staging | stub run 2026-11-03 | scripted |
| EDGE-07 | Auth ceiling | — | 65 rapid `POST /api/v1/auth/refresh` from one IP | ~21 pass (60/min + burst 20), rest `429` | stub run 2026-11-03: 21×200, 44×429 | scripted |
| EDGE-08 | Server banner | — | any response | `Server: nginx` without version | stub run 2026-11-03 | scripted |
| EDGE-09 | Admin headers (Docker) | admin container | `GET /` | CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy, noindex | `nginx -t` on `docker/nginx-admin.conf` (successful) | after deploy |
| GATE-01 | Readiness | `.env` with blank seller facts, `LAUNCH_MODE=live` | `pnpm check:launch` | exit 1, blockers listed | `scripts/tests/check-launch-readiness.test.mjs` › the audit state … is blocked for a live launch | — |
| GATE-02 | Readiness | complete production `.env` | same | exit 0 | › a fully configured production .env is ready | — |
| GATE-03 | Readiness | coming-soon + blank facts | same | warnings only; http/localhost site URL still blocks | › coming-soon mode downgrades … | — |
| GATE-04 | Readiness | bad FSSAI/GSTIN/WhatsApp, `DEFAULT_OTP`, `TRUST_PROXY=false`, `ADMIN_TOTP_REQUIRED=false` | same | each is a blocker | › malformed identifiers and dangerous switches … | — |
| GATE-05 | Deploy | — | `pnpm deploy:storefront` with a blocked server `.env` | stops before building | `scripts/deploy.sh` `readiness_gate` | yes |
| HOST-01 | CSP | HTTPS build with `NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:4001/dev-assets` | `next build`, inspect header | no `localhost` in `img-src`; build warns | — | after deploy: `curl -sI https://pahadikhatki.in/coming-soon \| grep -i localhost` → nothing |
| HOST-02 | Canonical | image built with `DOCKER_STOREFRONT_URL=https://pahadikhatki.in` | view source | canonical + sitemap use `https://pahadikhatki.in` | — | after deploy |
| HOST-03 | Storefront noindex | production build, Host `staging…` or `localhost` | `GET /robots.txt`, any page | robots = disallow-all, `X-Robots-Tag` set; on `pahadikhatki.in` neither | — | after deploy |
| HOST-04 | security.txt | locked prod | `GET /.well-known/security.txt` | `200`, `Contact:`, `Expires:` within 6 months | — | after deploy |
| HOST-05 | ISR | backend down during `docker build` | after deploy `curl -sI /` twice | `Cache-Control` is `s-maxage=…` (not `private, no-store`); content refreshes ≤ 60 s | — | after deploy (deploy.sh warms `/`, `/products`, `/sitemap.xml`) |
| HOST-06 | Waitlist while locked | locked prod | `POST /api/v1/waitlist` | reaches API (nginx `/api/`; storefront proxy passes `/api/v1/waitlist`) | — | after deploy |
