# Refund failed / stuck

**Symptoms:** order refund shows `FAILED` or stays `PENDING` > 24 h; customer says refund not
received; `ops_issue` mentions refund.

Refunds are created as a `refunds` row (`PENDING`) inside the transaction that decided them, then
`INITIATE_REFUND` calls Razorpay (idempotency key `refund:<orderId>:<reason>`), and
`RECONCILE_REFUNDS` (every 30 min) re-asks Razorpay for anything not final.

## Check
1. Admin → order → Payments & refunds: refund status, `gateway_refund_id`, notes.
2. Razorpay dashboard → Refunds → search `gateway_refund_id` / payment id:
   - **processed** at Razorpay but `PENDING` here → wait for `RECONCILE_REFUNDS` (≤ 30 min) or the
     `refund.processed` webhook; check webhooks-failing.md.
   - **failed** at Razorpay → usual causes: payment older than 6 months, insufficient Razorpay
     balance, bank rejected (closed account / UPI handle).
   - No refund at Razorpay at all → `INITIATE_REFUND` job failed: Ops → Job queues → failed jobs.
3. Razorpay account balance (refunds are paid from settlement balance).

## Fix
- Job failed for a transient reason → **retry the job** in Ops → Job queues (same idempotency
  key — Razorpay returns the existing refund, never pays twice).
- Razorpay balance low → top up / wait for settlement, then retry the job.
- Bank rejected / payment too old → pay the customer manually (UPI / bank transfer), keep proof,
  add an admin note on the order with the UTR. Do not create a second refund in the admin console.
- Partial refund still possible? Admin → order → **Refund** (amount ≤ refundable shown).

## Verify
Refund `PROCESSED`, customer got the `refund_processed` message (Resend if not), `ops_issue` resolved.
