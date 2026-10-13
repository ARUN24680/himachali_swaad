# Shiprocket down / wallet empty → manual booking fallback

**Symptoms:** alert `WALLET_LOW` (hourly `CHECK_WALLET_BALANCE`) or `BOOKING_FAILED` / `PICKUP_BATCH_FAILED`; orders
`CONFIRMED` without AWB, `ops_issue` set on them; partner desk shows no label.

## Check
1. Shiprocket dashboard → Wallet balance. Low wallet = bookings fail with "insufficient balance".
2. https://status.shiprocket.in / try login. 5xx / timeouts = Shiprocket outage.
3. Admin → Orders → "Needs attention": which orders have no AWB, what does `ops_issue` say?

## Fix
**Wallet empty:** recharge the wallet → Admin → Orders → each affected order → **Retry booking**
(`POST /admin/orders/:code/retry-shipment`, fresh job id). `RECONCILE_CONFIRMED` (every 5 min)
re-queues the booking job for `CONFIRMED` orders, **but with the same job id** — a booking that
already failed for good (dead-lettered, `ops_issue` set) is not re-run by it; use **Retry booking**.

**Short outage (< 2 h):** `SHIPROCKET_CREATE_ORDER` retries with back-off on its own. Orders whose
retries ran out show in Orders → **Needs attention** — press **Retry booking** once Shiprocket is
back. Tell the partner labels are delayed.

**Long outage (> 2 h, orders ageing) — manual booking:**
1. Book the parcel directly with a courier (Delhivery / India Post / local) from the kitchen.
2. Record it on the order: Admin → order → **Add note** (Notes · messages) with courier + AWB + cost.
3. Keep the order in the system flow when Shiprocket is back: press **Retry booking** only if the
   parcel has **not** been handed over yet. If it already left with a manual AWB, do **not** create
   a Shiprocket order — resolve the `ops_issue` with a note, add the freight as an expense
   (Admin → **Expenses**) so the settlement is right, and update the customer manually via
   **Resend message** / WhatsApp.
4. Status of manually shipped orders cannot be auto-tracked — check the courier site daily.

## Verify
Wallet ≥ threshold; no `CONFIRMED` order older than 1 h without AWB; partner desk shows labels.
