# 💸 Phase 5A: Direct UPI (Zero-Fee) — separate service `apps/payment`

> [!IMPORTANT]
> **Decisions:** D-59 (Direct UPI service), D-60 (all-AWS hosting). **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md`.
> **Depends on:** Phase 5 (checkout, `confirmPayment()`, refunds), Phase 10 (hardening).
> **Design + removal guide:** `apps/payment/README.md` · **AWS setup:** `docs/ops/direct-upi.md`.
> YouPI-PG (github.com/gxurav1710/YouPI-PG) inspired the idea; **no code was copied** (licence + security review 2026-10-17, D-59).

---

## 🎯 Objective
Customer pays the exact amount by UPI straight into the business current account (0 % gateway fee). The payment service matches the bank's credit alert to the order and tells the store through the same Razorpay-format webhook the store already handles. The whole feature lives in `apps/payment` (own database `pk_payment`). Deleting the folder and setting `PAYMENT_GATEWAY=razorpay` switches the store back to Razorpay.

## 🏗️ How it plugs in
| Store piece | Change |
| :-- | :-- |
| `config/env.ts` | `PAYMENT_GATEWAY=direct_upi` + `DIRECT_UPI_API_URL / _PUBLIC_URL / _KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET` (https + live key in production, distinct secrets) |
| `integrations/razorpay/razorpay.ts` | same client, configurable base URL, `kind: 'direct_upi'`, `checkoutUrl()` |
| `checkout.service.ts` / `orders.service.ts` | `checkoutUrl` in create-order + `retryPayment`; `notes.reservation_expires_at` sent to the gateway |
| `@pk/shared` contracts | `PAYMENT_GATEWAYS` + `'direct_upi'`, `checkoutUrl: url \| null` |
| Storefront `usePayment` | `direct_upi` → `window.location.assign(checkoutUrl)` (pay page returns to `/order/<code>`, which polls) |
| Webhooks, `confirmPayment()`, sweepers, refunds job, settlements | **unchanged** |

---

## 📋 Tasks
### 5A.1 Service + database
- [x] `apps/payment` Fastify service, own DB, migration `0001_init.sql` (orders with partial-unique open payable amount, credit alerts, payments `UNIQUE(utr)`, refunds, observer devices + nonces, webhook outbox, admin audit). — ✅ `apps/payment/migrations/0001_init.sql`; up → down → up in `tests/helpers/global-setup.ts` (every integration run)
- [x] Razorpay-compatible `/v1` API with Basic auth. — ✅ `tests/integration/gateway.test.ts › requires the store key`, `› creates an order shaped like Razorpay`
- [x] Unique payable amount, concurrency safe. — ✅ `gateway.test.ts › 100 concurrent orders … 101st is refused`

### 5A.2 Matching + money safety
- [x] Auto-capture only on an exact amount, a new UTR and exactly one open order in its window. — ✅ `tests/integration/matcher.test.ts` (8 tests: exact match, duplicate UTR, 8-way race → 1 payment, wrong amount / no UTR / stale / future, before-order / after-hold, late grace, sweeper, redelivery)
- [x] Admin link; under-payment reaches the store as `AMOUNT_MISMATCH`. — ✅ `matcher.test.ts › admin link` (2 tests)
- [x] Manual refunds: pending → `refunds:complete` → `refund.processed`. — ✅ `matcher.test.ts › refunds` (2 tests)
- [x] Transactional outbox, HMAC-signed, retry with backoff. — ✅ `matcher.test.ts › outbox dispatcher`

### 5A.3 Alert channels
- [x] SES → SNS: SNS signature v2 from AWS hosts only, topic + recipient check, bank DKIM aligned with From. — ✅ `tests/unit/sns.test.ts` (5), `tests/integration/channels.test.ts › e-mail channel` (valid → MATCHED; forged-domain DKIM → REJECTED; altered body → REJECTED; wrong topic / recipient / signature → 400)
- [x] Android observer API: device HMAC, ±5 min, single-use nonce, revocation, sender allowlist, encrypted secrets, heartbeat. — ✅ `channels.test.ts › Android observer channel` (5 tests)
- [x] Bank alert parser (HDFC / ICICI / SBI / Axis style, debits refused, balance skipped). — ✅ `tests/unit/parse.test.ts` (generic formats; **real bank fixture still needed**, see open items)
- [ ] Android observer **app** (Kotlin) — not built; API contract in `docs/ops/direct-upi.md` §4.

### 5A.4 Pay page (ui-developer)
- [x] `apps/payment/web` (Vite + React 19 + Tailwind v4 + `@pk/ui`), states created / time-up / paid / expired / not-found / rate-limited / error / loading; strict CSP, nothing inline. — ✅ `Phases/evidence/phase-05a/pay-*-{375,768,1440}-{light,dark}.png` + `README.md` (design note: no Stitch screen exists)

### 5A.5 Store integration
- [x] Env validation. — ✅ `apps/backend/tests/unit/payments-config.test.ts › Direct UPI gateway` (3 tests)
- [x] Existing payment / order / reservation / launch tests still green. — ✅ `payments.test.ts`, `orders-lifecycle.test.ts`, `reservation-concurrency.test.ts`, `launch-simulations.test.ts` 43/43 (2026-10-18, after updating the `retryPayment` shape assertion)
- [x] End-to-end, real processes (backend API + worker + payment service, throwaway PostgreSQL/Redis containers, demo catalog): create-order → `checkoutUrl` → pay view → wrong-amount alert `UNMATCHED` → exact alert `MATCHED` → store `CONFIRMED/PAID` via webhook → admin cancel → store refund job → `refunds:list` → `refunds:complete --by` → store `REFUNDED`. — ✅ manual run 2026-10-18 (session log; order `PK-K99AQ8`, payable 448.92 of 449.00)

### 5A.6 Ops
- [x] `docker/Dockerfile.payment` (non-root, healthcheck) + compose profile `direct-upi`. — ✅ image built + boot refusals verified 2026-10-18 (prod refuses dev tools, http URLs, no DB TLS, no channel)
- [x] AWS guide + alarms. — ✅ `docs/ops/direct-upi.md`

---

## ❓ Open before go-live (owner)
1. **Bank name** + one real credit alert (e-mail and SMS) → parser fixture + DKIM-after-forward spike (`docs/ops/direct-upi.md` §3.7).
2. **Android observer app** (backup channel) — build, or launch with e-mail only.
3. **CA:** invoice shows the full total, the customer pays up to 99 paise less (booked as gateway fee).
4. **Legal pages** (privacy, terms) still say "Razorpay" — update the text for direct bank payments before switching.
5. Refund SLA: refunds are manual — decide who runs `refunds:list` daily.

## 🔍 Verification Checklist
- [x] Service unit + integration tests: 52/52 (`pnpm --filter @pk/payment test` + `test:integration`, 2026-10-18).
- [x] Typecheck + lint (`@pk/payment`, `@pk/backend`, `@pk/storefront`, `@pk/shared`), colour check.
- [x] E2E money path incl. refund (5A.5).
- [ ] Real-bank ₹1 test on staging (needs bank + SES set up).
- [ ] Real Android device: GPay / PhonePe intent opens with the exact amount (video).

## ✅ Definition of Done
A customer can pay by UPI with no gateway fee; only a verified bank alert (DKIM or device HMAC) auto-confirms; anything doubtful goes to admin review; refunds are manual but tracked, audited and reflected in the store; the store switches back to Razorpay with one env var and the folder can be deleted.
