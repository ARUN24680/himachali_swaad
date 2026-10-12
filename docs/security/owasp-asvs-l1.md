# OWASP ASVS 4.0.3 Level 1 walk-through (Phase 10 §10.1)

Date: 2026-10-12 · Scope: API (`apps/backend`), storefront (`apps/storefront`), admin/partner PWA
(`apps/admin`) · Method: code review + automated tests. Status: **0 open high-severity items.**
Items that need the real production infrastructure are marked **(deploy)** and tracked in
`requirement/pending-requirements.md` (Phase 10 section).

| ASVS area | Control | How it is met | Evidence |
| :--- | :--- | :--- | :--- |
| V1 Architecture | Trust boundaries, no ORM injection surface | Nexus layers; SQL only in repositories, parameterized `pg` queries; ESLint forbids cross-module repository imports | `eslint.config.js`, doc 09 |
| V2.1 Password security | ≥ 12 chars, max 200, no composition rules, bcrypt cost 12 | `NewPasswordSchema`, `BCRYPT_COST = 12` | `staff-auth.test.ts` |
| V2.2 Anti-automation | Login: 5 per 15 min per IP (route limit) **and** 5 failures per e-mail → 15 min lock; OTP send 3 per phone + 10 / 10 min per IP; OTP verify 20 / 10 min | `auth.routes.ts`, `auth.service.ts` (`LOGIN_MAX_FAILURES`, `OTP_SEND_LIMIT`) | `security-hardening.test.ts` (lockout), `otp.test.ts` |
| V2.2 / V2.8 MFA | **ADMIN TOTP mandatory** (D-19, D-57 a); TOTP secret AES-256-GCM encrypted | `requireRole` + `mfa` claim | `security-hardening.test.ts` |
| V2.5 Credential recovery | No self-service reset for staff (admin resets); customers log in by OTP only | design | — |
| V3 Session management | httpOnly, `SameSite=Lax`, `Secure` in prod cookies; 15 min access JWT; rotating refresh tokens with reuse detection; logout-all | `auth.cookies.ts`, `auth.tokens.ts` | `refresh-rotation.test.ts`, `cookies-csrf.test.ts` |
| V4 Access control | Deny by default: `requireAuth` + `requireRole` per route prefix; partner scoped to its pickup locations (IDOR checks) | middleware/auth.ts, partner repository filters | `rbac.test.ts`, `packing-desk.test.ts` |
| V4.2 CSRF | Cookie sessions + Origin allowlist check on every state-changing request | security plugin | `cookies-csrf.test.ts` |
| V5 Validation | Zod schemas on every body/query/params (fastify-type-provider-zod); 1 MB body limit; uploads direct to R2 with signed PUT + type/size checks | `@pk/shared` contracts | route tests |
| V5.3 Output encoding / injection | React escapes output; parameterized SQL only; CSV export escapes formula prefixes (`=+-@`) | exports.service | `admin-orders.test.ts` (CSV) |
| V6 Cryptography | Webhook HMAC (Razorpay SHA-256, WhatsApp `X-Hub-Signature-256`) with constant-time compare; OTP HMAC with pepper; TOTP AES-GCM | integrations | `payments.test.ts`, `notifications.test.ts` |
| V7 Errors & logging | Generic 500 body with request id; pino redaction of phone, email, address, password, otp, tokens, secrets, cookie and authorization headers; Sentry without PII (`dataCollection` off) | `logger.ts`, `error-handler.ts` | `log-redaction.test.ts` |
| V8 Data protection | Private bucket for invoices/labels/statements/receipts; **signed GET URLs 300 s**; no card/UPI data stored | `SIGNED_URL_TTL_SEC`, `UPLOAD_URL_TTL_SEC` | settlements / logistics tests; R2 public access off **(deploy)** |
| V9 Communications | HTTPS only; HSTS 2 y + preload in production; DB `ssl` in production | `security.ts`, `next.config.ts`, `public/_headers` | `security-hardening.test.ts`; SSL Labs A **(deploy)** |
| V10 Malicious code | `pnpm audit --prod --audit-level=high` in CI; Dependabot weekly; lockfile committed | `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI run |
| V11 Business logic | Stock under `SELECT … FOR UPDATE` (sorted lock order), ledger invariant check, payment amount check, idempotent webhooks, status only via `transitionOrder()` | doc 07 | `reservation-concurrency.test.ts`, k6 spike (`Phases/evidence/phase-10/`) |
| V12 Files | Upload type/size enforced at presign + verify; files never served from the API origin in prod | storage integration | catalog tests |
| V13 API | CORS strict allowlist with credentials only for the storefront + admin origins; rate limits global 300/min/IP + per-route; webhooks signature-checked (no IP limit, D-57) | `security.ts` | `security-hardening.test.ts` (CORS) |
| V14 Config | Env validated at boot; production refuses mock providers, local storage, `ADMIN_TOTP_REQUIRED=false`, test-only overrides; security headers (CSP, nosniff, Referrer-Policy, frame-ancestors) | `env.ts`, D-57 c | `security-hardening.test.ts` (headers); securityheaders.com A **(deploy)** |

## Rate limits reviewed (§10.1)
| Endpoint | Limit |
| :--- | :--- |
| Global (per IP) | 300 / min |
| `POST /auth/otp/send` | 10 / 10 min per IP + 3 sends per phone |
| `POST /auth/otp/verify` | 20 / 10 min per IP |
| `POST /auth/staff/login` | 5 / 15 min per IP + per-e-mail lockout (5 failures → 15 min) |
| `POST /checkout/orders` | 10 / 10 min per IP (`CHECKOUT_IP_LIMIT`, prod fixed at 10) |
| `POST /payments/verify` | 30 / 10 min per IP |
| `POST /track` | 10 / 10 min per IP (D-39) |
| `POST /shipping/check-pincode`, `GET /shipping/pincodes/:pincode` | 30 / min per IP |
| Webhooks (Razorpay, courier, WhatsApp) | no IP limit — authenticated by signature / token; duplicates deduped by event id |

## Findings
| # | Finding | Severity | Status |
| :--- | :--- | :--- | :--- |
| F-1 | ADMIN could use the console without TOTP (enrolment optional) | High | **Fixed** — D-57 (a), test `security-hardening.test.ts` |
| F-2 | No per-account lockout (only per-IP limit) → distributed password guessing | Medium | **Fixed** — D-57 (b) |
| F-3 | API had helmet defaults only; no CSP / HSTS policy decision; bull-board framed by any origin | Medium | **Fixed** — D-57 (c) |
| F-4 | Storefront and admin had no CSP / security headers | Medium | **Fixed** — `next.config.ts headers()`, `apps/admin/public/_headers` |
| F-5 | Storefront CSP needs `script-src 'unsafe-inline'` (Next.js inline bootstrap without nonces) | Low | **Accepted** — D-57 (c); no user HTML is rendered unescaped, other CSP directives still apply |
| F-6 | `braces` high advisory in a dev-only lint dependency, no patched version | Low (not shipped) | **Accepted risk** — D-57 (d); CI audits production deps; Dependabot watches |
| F-7 | No automated alert on stock ledger mismatch (Sentry only) | Medium | **Fixed** — `LEDGER_MISMATCH` admin alert |
| F-8 | DPDP deletion is a manual SQL procedure | Low | **Accepted** for launch — `docs/runbooks/dpdp-data-deletion.md`; admin action in v2 backlog |
