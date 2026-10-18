# `@pk/payment` — Direct UPI payment service (D-59)

Zero-fee UPI payments straight into the **business current account**. Idea inspired by
YouPI-PG, **code written from scratch** (YouPI-PG is "Commercial"-licensed and its admin API is
unauthenticated — see the 2026-10-17 review in `architecture/08-decisions-log.md` D-59).

```
Storefront "Pay" ──► backend create-order ──► POST /v1/orders (this service, Basic auth)
      │                                         └─ unique payable amount (total − 0..99 paise)
      └─► redirect https://pay.<domain>/pay/<orderId>  (QR + "Open UPI app")
Customer pays any UPI app ──► money lands in the current account
Bank credit alert:
   e-mail → Gmail forward → SES inbound → SNS ──► POST /v1/inbound/ses   (SNS sig + bank DKIM)
   SMS    → Android observer app            ──► POST /v1/observer/alerts (device HMAC + nonce)
Matcher: exactly one open order, exact amount, new UTR ──► payment.captured
Outbox ──► store POST /api/v1/webhooks/razorpay (HMAC, Razorpay event format) ──► confirmPayment()
Customer page polls ──► "Payment received" ──► back to /order/<code>
```

The service speaks the **Razorpay REST + webhook format**, so the store backend uses its normal
Razorpay client with a different base URL (`PAYMENT_GATEWAY=direct_upi`). The store's
`confirmPayment()`, reservation sweeper (polls `GET /orders/:id/payments`), refunds and
settlements work unchanged.

## Security model

| Threat | Defence |
| :-- | :-- |
| Fake "payment received" e-mail | Must arrive via **our** SNS topic (signature v2, AWS cert host only), to our recipient, with a **DKIM pass from an allowlisted bank domain aligned with From**. Altered body → DKIM fails → `REJECTED`. |
| Fake / replayed SMS request | Per-device secret (AES-256-GCM at rest), HMAC over `timestamp.nonce.body`, ±5 min clock, single-use nonce, revocable device, bank sender allowlist. |
| Same transfer counted twice (e-mail + SMS) | Advisory lock per UTR + `UNIQUE(utr)` → `DUPLICATE`. |
| Wrong amount / two orders, one payment | Each open order has a **different** payable amount (partial unique index). Anything not exact → admin review, never guessed. An under-payment linked by an admin reaches the store as `AMOUNT_MISMATCH` (refund). |
| Store ↔ service spoofing | `/v1` Basic auth (constant-time); webhooks HMAC-signed; secrets distinct; https enforced in production. |
| Open redirect / enumeration | Return URL is built from config + order code; order ids are 95-bit random; pay API rate-limited; no PII in responses. |
| XSS / clickjacking on the pay page | Strict CSP (`script-src 'self'`, no inline, `frame-ancestors 'none'`), QR rendered as `<img>`. |
| Admin abuse | No admin HTTP API at all. Manual actions only via the CLI inside the task, each requires `--by` and is audited (`upi_admin_audit`). |
| Dev shortcuts in prod | `PAYMENT_DEV_TOOLS`, test keys, http URLs, DB without TLS, no alert channel → service refuses to boot. |

## Run locally

```sh
pnpm --filter @pk/payment exec dbmate --url "$PAYMENT_DATABASE_URL" --migrations-dir ./migrations create
pnpm --filter @pk/payment db:up
pnpm --filter @pk/payment dev        # API + pay page on :4100 (build the page once: pnpm --filter @pk/payment build)
pnpm --filter @pk/payment dev:web    # pay page with hot reload on :5175/pay/<orderId>
# backend .env: PAYMENT_GATEWAY=direct_upi + DIRECT_UPI_* (see .env.example)
# simulate the bank (PAYMENT_DEV_TOOLS=true only):
curl -X POST localhost:4100/dev/alerts -H 'content-type: application/json' -d '{"amountPaise":44892}'
```

Tests: `pnpm --filter @pk/payment test` (unit) · `pnpm --filter @pk/payment test:integration` (PostgreSQL in Docker).

## Daily operations (admin CLI)

```sh
# in the ECS task: node dist/admin.js <command> --by "Arun"     ·  locally: pnpm --filter @pk/payment admin <command>
alerts:list                         # unmatched alerts (wrong amount, late, no UTR)
orders:find PK-7KQ2M9               # → orderId
alerts:link <alertId> <orderId>     # book it (store gets payment.captured)
alerts:add --amount 448.92 --utr 629012345678   # from the bank statement when no alert came
refunds:list                        # store-requested refunds — pay these back by UPI
refunds:complete <refundId> <utr>   # → store marks REFUNDED
devices:enroll "Shop phone" | devices:list | devices:revoke <id>
```

## Remove it / switch to Razorpay

1. Backend env: `PAYMENT_GATEWAY=razorpay` + `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`. Redeploy. (Nothing else in the store changes.)
2. Wait until `refunds:list` is empty and no order is still `PENDING_PAYMENT` on Direct UPI.
3. Delete `apps/payment/`, `docker/Dockerfile.payment`, the `payment*` services in `docker-compose.prod.yml`, the "Direct UPI service" block in `.env.example`, and the payment block in `eslint.config.js`.
4. AWS: delete the ECS service, ALB rule for `pay.<domain>`, SES receipt rule + SNS topic, secrets; drop database `pk_payment` (after exporting it for your records).
5. Optional tidy-up in the store: `DIRECT_UPI_*` env vars and the `direct_upi` branch in `config/storage.ts` / `razorpay.ts` (harmless if left).
