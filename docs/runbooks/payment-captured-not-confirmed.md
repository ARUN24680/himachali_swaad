# Payment captured but order not confirmed

**Symptoms:** customer says "money deducted, no confirmation"; alert `PAYMENTS_STUCK`; order shows
`PENDING_PAYMENT` (or `EXPIRED`/`CANCELLED`) while Razorpay shows the payment **captured**.

## How the system heals itself first
1. Browser `verify` call confirms the order (fastest path).
2. Razorpay `payment.captured` webhook confirms it (same `confirmPayment`, idempotent).
3. `EXPIRE_RESERVATIONS` (every minute) asks Razorpay for the order's payments **before** expiring a
   hold — a captured payment confirms instead of expiring (`source: RECONCILE`).
4. If the hold had already expired and the stock is gone → `LATE_PAYMENT_STOCKOUT`: order
   `CANCELLED` + automatic refund (D-22). The customer gets the refund message.

So most cases fix themselves within ~1 minute. Act only when the order is still wrong after 10 min.

## Check
1. Admin → Orders → search the order code / phone. Note `status`, `payment status`, `ops_issue`.
2. Razorpay dashboard → Payments → search by the `razorpay_order_id` shown on the order. Confirm
   **captured** and the amount.
3. Ops → Webhooks: is there a failed `payment.captured` for this order? (→ webhooks-failing.md)
4. Worker alive? `GET https://api.<domain>/healthz/worker` must be 200. (→ worker-queue-5xx.md)

## Fix
| What you see | Do this |
| :--- | :--- |
| Webhook in Ops → Webhooks with an error | Fix the cause, then **Replay** it (idempotent — safe to replay). |
| No webhook at all, worker down | Restart the worker. The next `EXPIRE_RESERVATIONS` run reconciles it. |
| `ops_issue = AMOUNT_MISMATCH` | Paid amount ≠ order total. The system already created a refund intent; never confirm such an order. Tell the customer to reorder; check refund-failed.md if the refund doesn't process. |
| Order `CANCELLED` with `LATE_PAYMENT_STOCKOUT` | Expected behaviour. Check the refund row is `PROCESSED` (else refund-failed.md). Apologise to the customer. |
| Captured twice for one order | The second capture is refunded automatically (duplicate payment). Verify a refund row exists. |

## Verify
Order `CONFIRMED`, payment `CAPTURED`, AWB appears within ~5 min (`RECONCILE_CONFIRMED` re-queues
booking), customer received "order confirmed".

## Afterwards
If it took manual action, record the order code + cause in the weekly retro.
