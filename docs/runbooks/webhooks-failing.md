# Razorpay / Shiprocket / WhatsApp webhook failing

**Symptoms:** alert `WEBHOOK_FAILURES`; Admin → **Queues & webhooks** (webhook failures) shows rows with errors; orders stuck in
`PENDING_PAYMENT` (Razorpay) or tracking not moving (Shiprocket); WhatsApp delivery ticks missing.

Every webhook is stored first in `webhook_events` (unique per provider + event id) and then
processed, so **nothing is lost** while processing fails — it can be replayed.

## Check
1. Admin → **Queues & webhooks** (webhook failures) → read `last_error` of the newest failures.
2. Rejected before storage (no row)? Look in the API logs for `401`/`400` on
   `/api/v1/webhooks/razorpay`, `/api/v1/webhooks/courier-tracking`, `/api/v1/webhooks/whatsapp`:
   - **Razorpay 401 `bad signature`** → `RAZORPAY_WEBHOOK_SECRET` differs from the secret in
     Razorpay dashboard → Webhooks. (Recently rotated? → key-rotation.md.)
   - **Shiprocket 401** → `x-api-key` header ≠ `SHIPROCKET_WEBHOOK_TOKEN`.
   - **WhatsApp 401** → `X-Hub-Signature-256` uses `WHATSAPP_APP_SECRET`.
3. Provider side: Razorpay dashboard → Webhooks → delivery log; Shiprocket → Settings → API →
   Webhooks; Meta → WhatsApp → Configuration. Is the URL right (`https://api.<domain>/api/v1/webhooks/...`)
   and the endpoint "active"? Razorpay disables a webhook after repeated failures — re-enable it.
4. API reachable from outside? `curl -I https://api.<domain>/healthz` → 200.

## Fix
- Wrong secret → set the correct one in the host's secret manager, redeploy API.
- Code / data error in `last_error` → fix, deploy, then **Admin → **Queues & webhooks** (webhook failures) → Replay** each failed
  event (idempotent; a duplicate never double-applies).
- Events never arrived (provider disabled the hook) → re-enable at the provider. Razorpay: the
  expiry sweeper reconciles payments anyway (payment-captured-not-confirmed.md). Shiprocket:
  `POLL_TRACKING` (every 3 h) pulls statuses, so tracking catches up on its own.

## Verify
Admin → **Queues & webhooks** (webhook failures) empty of new failures for 30 min; affected orders moved on.
