# Runbooks (Phase 10 §10.4)

One page per incident. Each page: **symptoms → check → fix → verify → afterwards**. Rules that
apply to every runbook:

- **Never change `orders.status` or `payments.status` by hand in SQL.** Status changes go through
  `transitionOrder()` (the API / admin actions / jobs). If no action covers the case, stop and fix
  the code — a hand edit breaks the status log and the stock ledger.
- **Never change `inventory_batches.available_stock` by hand.** Stock moves only with an
  `inventory_movements` row (admin → Inventory → Adjust).
- Read-only SQL is fine on a replica / the primary with `SET default_transaction_read_only = on`.
- Every admin action you take is in **Ops → Audit log** — note the order code in the incident note.

| Incident | Runbook |
| :--- | :--- |
| Customer paid, order not confirmed | [payment-captured-not-confirmed.md](./payment-captured-not-confirmed.md) |
| Razorpay / Shiprocket / WhatsApp webhooks failing | [webhooks-failing.md](./webhooks-failing.md) |
| Shiprocket down / wallet empty | [shiprocket-down-wallet-empty.md](./shiprocket-down-wallet-empty.md) |
| Refund failed / stuck | [refund-failed.md](./refund-failed.md) |
| Stock ledger mismatch alert | [stock-ledger-mismatch.md](./stock-ledger-mismatch.md) |
| Restore data from backup | [restore-from-backup.md](./restore-from-backup.md) |
| Customer asks for their data to be deleted (DPDP) | [dpdp-data-deletion.md](./dpdp-data-deletion.md) |
| Rotate a key (Razorpay, Shiprocket, WhatsApp, JWT, …) | [key-rotation.md](./key-rotation.md) |
| Worker down / queue backlog / 5xx spike | [worker-queue-5xx.md](./worker-queue-5xx.md) |

Alert kinds (`ADMIN_ALERT.kind`) → runbook: `PAYMENTS_STUCK` → payment-captured-not-confirmed ·
`WEBHOOK_FAILURES` → webhooks-failing · `WALLET_LOW`, `BOOKING_FAILED`, `PICKUP_BATCH_FAILED`, `PICKUP_MISSED`, `AWB_CANCEL_FAILED` →
shiprocket-down-wallet-empty ·
`LEDGER_MISMATCH` → stock-ledger-mismatch · `SERVER_ERRORS_SPIKE`, `JOBS_FAILED`, `QUEUE_BACKLOG` →
worker-queue-5xx · `OPS_ISSUES_OPEN` → open the order, the `ops_issue` text names the problem.
