# 🚀 Phase 10: Hardening, End-to-End Simulation & Go-Live

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 0–9 (all)  ·  **Migration:** `0007_performance_indexes.sql` (D-57 e)

---

## 🎯 Objective
Launch se pehle system ko production-grade banana. Isme ye sab aata hai:
- security hardening, performance, observability aur runbooks
- har critical failure scenario ka end-to-end simulation
- physical packaging trial
- friends & family soft-launch

Ye sab hone ke baad hi `pahadikhatki.in` public hoga aur pilot batch launch hoga.

---

## 📋 Granular Tasks & Checklist

### 10.1 Security Hardening
- [x] OWASP Top 10 (ASVS L1) checklist walk-through, findings tracked to closure. — *Evidence:* `docs/security/owasp-asvs-l1.md` (8 findings: 6 fixed, 2 accepted low)
- [x] Fastify `@fastify/helmet`: CSP (Razorpay checkout domains allowlisted), HSTS (preload-ready), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` (admin). — *Evidence:* `security-hardening.test.ts` › API headers + bull-board CSP; storefront `next.config.ts`, admin `public/_headers`; `docs/security/headers.md`
- [x] CORS strict allowlist (storefront, admin domains only); credentials true sirf unke liye. — *Evidence:* `security-hardening.test.ts` › CORS
- [x] Rate limits reviewed: OTP, track, check-pincode, login, checkout, webhooks (provider IP/signature-based). — *Evidence:* table in `docs/security/owasp-asvs-l1.md`; `otp.test.ts`, `track.test.ts`, `security-hardening.test.ts`
- [x] **ADMIN TOTP 2FA mandatory** (D-19); staff password policy + login lockout. — *Evidence:* D-57 a/b; `security-hardening.test.ts` (TOTP enforcement + lockout); admin e2e `admin-phase10.spec.ts`; `Phases/evidence/phase-10/admin-2fa-required-*.png`
- [ ] Secrets host ke secret manager me; `.env` sirf local; key rotation runbook (Razorpay, Shiprocket, WhatsApp, JWT signing).
- [x] `pnpm audit` / Dependabot / Renovate; lockfile committed; no high/critical open. — *Evidence:* CI step `pnpm audit --prod --audit-level=high` passes; `.github/dependabot.yml`; dev-only `braces` accepted (D-57 d)
- [ ] Private R2 buckets public access disabled verify; signed URL TTLs check.
- [x] Logs me PII masking verify (phone, address, email). — *Evidence:* `tests/unit/log-redaction.test.ts`
- [ ] **Backups:** managed PG PITR enabled + **restore drill** (staging me restore karke row counts verify), Redis persistence settings documented.

### 10.2 Performance
- [ ] Lighthouse mobile (storefront home, product, checkout): Performance > 90, CLS < 0.05, accessibility > 90.
- [x] API p95 < 200ms for read endpoints (products, track, admin orders list) under expected load. — *Evidence:* `Phases/evidence/phase-10/k6-summary.json` read p95 12 ms
- [x] **k6 load test:** checkout create-order + verify concurrent spike on a small-stock product → zero oversell, ledger invariant holds, no deadlocks in PG logs. — *Evidence:* `k6-summary.json` + `k6-checkout-spike-db-checks.txt` (0 oversell, ledger 0, deadlocks 0)
- [x] PG: `pg_stat_statements` top queries reviewed, missing indexes added (new migration). — *Evidence:* `pg-stat-statements-top15.txt`; migration 0007 (`migration-0007-roundtrip.log`)
- [ ] Pool sizing vs `max_connections` verified for API + worker replicas.

### 10.3 Observability & Alerts
- [ ] Sentry (storefront, admin, API, worker) with release tagging + source maps.
- [ ] Uptime monitors: storefront, `/health` (API: DB + Redis check), worker heartbeat.
- [x] Alerts: 5xx rate spike, queue backlog / failed jobs, `ops_issue` count > 0 for > 1h, webhook failures, Shiprocket wallet low, stock ledger mismatch, payment stuck (`PENDING_PAYMENT` past expiry + 10 min). — *Evidence:* `ops-alerts.test.ts` (7 tests); wallet → `CHECK_WALLET_BALANCE`; `docs/ops/monitoring.md`
- [x] Ops dashboard (orders/hour, conversion, refund count, NDR/RTO rate). — *Evidence:* `GET /admin/ops/metrics` (`ops-alerts.test.ts`), `Phases/evidence/phase-10/dashboard-ops-*.png`; conversion via GA4 (D-57 g)

### 10.4 Runbooks (`docs/runbooks/*.md`)
- [x] Payment captured but order not confirmed. — *Evidence:* `docs/runbooks/payment-captured-not-confirmed.md`
- [x] Razorpay / Shiprocket / WhatsApp webhook failing. — *Evidence:* `docs/runbooks/webhooks-failing.md`
- [x] Shiprocket down / wallet empty → manual booking fallback. — *Evidence:* `docs/runbooks/shiprocket-down-wallet-empty.md`
- [x] Refund failed. — *Evidence:* `docs/runbooks/refund-failed.md`
- [x] Stock ledger mismatch. — *Evidence:* `docs/runbooks/stock-ledger-mismatch.md`
- [x] Data restore from backup. — *Evidence:* `docs/runbooks/restore-from-backup.md`
- [x] Customer data deletion request (DPDP). — *Evidence:* `docs/runbooks/dpdp-data-deletion.md` (+ `key-rotation.md`, `worker-queue-5xx.md`)

### 10.5 End-to-End Simulations (staging, test keys)
- [x] **Happy path:** storefront order → UPI test payment → `CONFIRMED` → AWB + label → partner push → print → Mark Packed → pickup → (simulated webhooks) → `DELIVERED` → all WhatsApp messages received. — *Evidence:* local mocks — `launch-simulations.test.ts` › happy path
- [x] **Payment drop:** customer bank screen par browser close → 15 min baad stock released, order `EXPIRED` (D-22). — *Evidence:* local mocks — `launch-simulations.test.ts` › payment drop
- [x] **Late payment stockout:** reservation expire → stock dusre customer ko bik gaya → late `payment.captured` → `CANCELLED` + auto-refund. — *Evidence:* local mocks — `launch-simulations.test.ts` › late payment stockout
- [x] **Duplicate webhooks:** same Razorpay + Shiprocket events 3× replay → single state change, single notification. — *Evidence:* local mocks — `launch-simulations.test.ts` › duplicate webhooks
- [x] **Shiprocket outage:** API mock 503 → retries → recovery; permanent fail → `ops_issue` + admin retry works. — *Evidence:* local sandbox — `launch-simulations.test.ts` › Shiprocket outage
- [x] **NDR → RTO:** simulated `UNDELIVERED` → `DELIVERY_FAILED` alerts → `RTO_DELIVERED`, no restock (D-31). — *Evidence:* local sandbox — `launch-simulations.test.ts` › NDR → RTO
- [x] **Cancel + refund:** customer cancel at `AWAITING_PACKING` → AWB cancelled, stock released, refund processed, partner notified. — *Evidence:* local mocks — `launch-simulations.test.ts` › cancel + refund
- [x] **Concurrency:** 10 concurrent checkouts for 1 remaining jar → exactly 1 reservation succeeds. — *Evidence:* `launch-simulations.test.ts` › concurrency + k6 spike
- [ ] Har simulation ka result + screenshots `docs/launch/e2e-results.md` me.

### 10.6 Physical Packaging Trial
- [ ] Partner 2–3 dummy jars (oil-filled) SOP ke hisaab se pack karke Himachal → Chennai real courier se bheje.
- [ ] Arrival inspection: 0% leak, seal intact, box condition, transit days.
- [ ] **Actual packed weight + courier charged weight vs 500g slab** (D-34) record → `products.packed_weight_g` update.

### 10.7 Soft Launch (Friends & Family)
- [ ] Production environment par **live keys** ke saath 5–10 real orders (small amounts), real delivery.
- [ ] Feedback: checkout friction, tracking clarity, packaging, taste.
- [ ] Settlement cycle dry-run on these orders.

### 10.8 Go-Live Checklist
- [ ] DNS on Cloudflare: `pahadikhatki.in` (storefront), `admin.` , `api.` — SSL Full (strict).
- [ ] Storefront on Vercel; API + worker containers on chosen host (D-10), health checks + autoscaling minimums.
- [ ] Razorpay **live** keys + live webhook URL + webhook secret registered; KYC active.
- [ ] Shiprocket live wallet funded, pickup location verified, live webhook registered.
- [ ] WhatsApp templates approved (all from Phase 8), business number verified.
- [ ] Legal pages live: Privacy, Terms, Refund/Cancellation, Shipping, Contact, Grievance Officer (E-Commerce Rules).
- [ ] **FSSAI license no.** site footer + product pages + jar labels par; non-veg symbol, batch, mfg/expiry, MRP on labels.
- [ ] Analytics: GA4 + Meta Pixel / Conversions API consent-aware.
- [ ] Instagram bio link → `pahadikhatki.in`; pilot batch launch 🎉

### 10.9 Post-Launch (first 2 weeks)
- [ ] Daily review: errors, ops_issues, NDR/RTO, refunds, delivery times, customer messages.
- [ ] Weekly retro → v2 backlog prioritise (COD, coupons, reviews, abandoned cart, NDR automation).

---

## 🚫 Out of Scope
- New features — sirf fixes aur hardening. Feature requests v2 backlog me.

---

## 🔍 Verification Checklist
- [ ] securityheaders.com / SSL Labs: A grade (HSTS, CSP present).
- [x] OWASP checklist zero open high-severity items. — *Evidence:* `docs/security/owasp-asvs-l1.md` findings table
- [ ] PITR restore drill successful, documented with timestamp.
- [ ] Lighthouse + k6 thresholds met (reports attached).
- [x] Saare 10.5 simulations pass, results documented. — *Evidence:* `docs/launch/e2e-results.md`, `Phases/evidence/phase-10/launch-simulations.log` (8/8, local mocks; staging run = pending H-10)
- [ ] Packaging trial: 0 leaks, measured weights recorded.
- [ ] Soft-launch orders delivered end-to-end on live keys.
- [ ] Every alert in 10.3 test-fired once and received.
- [ ] Go-live checklist 10.8 100% ticked by both partners.

---

## ✅ Definition of Done
Production live, monitored aur alerting; runbooks ready; pehle real customers bina technical friction ke order, track aur receive kar sakte hain.
