# 09 · End-to-End Test Checklist — "ek order shuru se aakhir tak" (local)

> Yeh practical script hai jo owner apne laptop par follow kar sakta hai. Har step ke saath **kahan click karna hai** aur **kya dikhna chahiye** likha hai. Saare labels code se liye gaye hain. Tick (`[x]`) sirf tab karo jab screen par sach me dikh jaye.
>
> Background: [README.md](README.md) · Setup details: [01](01-setup-admin-partner-kitchen.md) · Product: [02](02-product-listing-catalog.md) · Stock: [03](03-inventory-batches-stock.md) · Customer: [04](04-customer-journey-storefront.md) · Fulfilment: [05](05-order-fulfilment-admin-partner.md) · Exceptions: [06](06-exceptions-refunds-ndr-rto.md) · Paisa: [07](07-money-settlements-reports.md) · Messages: [08](08-notifications-alerts-monitoring.md)

**Teen browser windows rakho:**

| Window                         | URL                          | Kaun                                                   |
| :----------------------------- | :--------------------------- | :----------------------------------------------------- |
| A — Admin                      | http://localhost:5173        | Admin login                                            |
| B — Partner (incognito / dusra browser) | http://localhost:5173/desk | Kitchen partner login (phone size ke liye DevTools mobile view) |
| C — Customer (incognito)       | http://localhost:3000        | Customer                                               |

Aur ek terminal jisme `pnpm dev` chal raha ho (API console me `[DEV OTP]` yahin dikhega).

---

## Part 0 — Setup (ek baar)

- [ ] `pnpm install`
- [ ] `cp .env.example .env` · `cp apps/storefront/.env.example apps/storefront/.env.local` · `cp apps/admin/.env.example apps/admin/.env.local`
- [ ] (Optional, storefront turant update ho) backend `.env` me `STOREFRONT_REVALIDATE_URL=http://localhost:3000/api/revalidate` + `REVALIDATE_SECRET=<koi lamba secret>`, aur wahi `REVALIDATE_SECRET` `apps/storefront/.env.local` me. Bina iske storefront max ~5 minute me khud refresh hota hai.
- [ ] `docker compose up -d --wait` → postgres + redis healthy
- [ ] `pnpm db:up` → migrations applied
- [ ] `pnpm db:seed:staff` → admin + partner details do (partner mobile `+91…` zaroor do) → terminal me `✔ ADMIN …`, `✔ KITCHEN_PARTNER …`, `✔ Pickup location HP-KULLU-01 … mapped to the partner`
- [ ] Kitchen pickup nickname — admin login ke baad **Kitchens** → HP-KULLU-01 → **Edit** → **Shiprocket pickup name** = `Kullu Kitchen` → Save (badge "Shiprocket not linked" hatna chahiye). Ya SQL se:
  ```bash
  docker compose exec postgres psql -U pk -d pahadi_khatki \
    -c "UPDATE pickup_locations SET shiprocket_pickup_name = 'Kullu Kitchen' WHERE code = 'HP-KULLU-01';"
  ```
  → `UPDATE 1`
- [ ] (Optional) Admin alerts outbox me dekhne ho toh `.env` me `ADMIN_ALERT_PHONES=+919xxxxxxxxx` (khaali ho toh admin alerts kahin nahi jaate)
- [ ] `pnpm dev` → storefront :3000, admin :5173, API :4000, worker sab start
- [ ] http://localhost:4000/healthz aur http://localhost:4000/readyz OK; http://localhost:4000/healthz/worker OK (worker heartbeat)

> **Shortcut:** Part 1 + 2 khud karne ki jagah `pnpm db:seed:catalog -- --demo --publish` chala sakte ho (6 demo products + batches + placeholder photos, published). Lekin poora flow samajhne ke liye ek product haath se banao.

---

## Part 1 — Admin login + Settings (Window A)

- [ ] `/login` → **Work email**, **Password** → **Sign in** → **Dashboard** khula
- [ ] (Recommended) Header menu → **Account & security** → **Set up two-factor** → QR scan → 6-digit code → **Turn on two-factor** → _"Two-factor authentication is on."_ (Sign out karke dobara login → **Two-factor check** → **Verify and sign in**)
- [ ] Sidebar **Settings** → check: **Checkout stock hold** = 15 minutes, **Courier pickup cut-off** = 11:00 IST, **Free shipping above** / **Flat shipping fee** = Not set (₹0 shipping), **Kitchen partner profit share** = 50 %
- [ ] (Optional, invoice bina DRAFT ke) **Seller details (invoices)** bharo — warna invoice par "DRAFT - NOT A TAX INVOICE"
- [ ] **Staff** page par dono user dikhe; partner ke **Kitchens** column me `HP-KULLU-01`

---

## Part 2 — Product + batch (Window A, phir B)

**Product banana** (details [02](02-product-listing-catalog.md)):

- [ ] Sidebar **Products** → **Add product** → page "New product"
- [ ] Bharo: Product name, SKU, Meat, Product group, Net weight, URL slug, Description, Price (MRP incl. GST, ₹ me — paise me save hoga), HSN code (2001), Box size (15×10×10)
- [ ] **Save draft** → toast "Draft saved"
- [ ] Edit page par **Add photos** (JPG/PNG/WebP, ≤ 5 MB) → photo dikhe
- [ ] Bharo: GST rate, Shelf life, Ingredients list, Nutrition per 100 g (6 values), Packed weight → **Save changes**
- [ ] **Storefront status** card ke **Publish checklist** ke saare 6 items green
- [ ] **Publish to storefront** → toast "&lt;title&gt; is live"

**Stock (batch) daalna** — partner se (Window B):

- [ ] Partner login → seedha `/desk` (Hindi default; header me HI/EN)
- [ ] Bottom nav **Batches** → **New batch** tab → **Which pickle?** = naya product, **Jars made** = 20, **Total cost of this batch** = ₹4,000 → **Save batch**
- [ ] Success: "Batch saved" + batch code `PK-<YYMM>-<SKU>-01` — _"Stamp this batch code on every jar"_
- [ ] Window A → **Inventory** (`/batches`) me batch dikhe, shelf status **FRESH**, available 20

**Website par check** (Window C):

- [ ] Home / `/products` par product card dikhe
- [ ] Product page par price, **In stock** badge (20 jars = threshold 20 → "In stock"; 20 se kam hote hi "Only N jars left"), "Ships from batch", **Check delivery to your pincode** → koi PIN (e.g. 600001) → "We deliver to 600001"

---

## Part 3 — Customer order + mock payment (Window C)

- [ ] Cookie banner → **Accept all** (ya **Reject all**)
- [ ] Product page → **Add to cart** (thodi der "Added") → **View cart & checkout** → cart drawer **"Your cart"**: Subtotal, Shipping **Free** (₹0), Total → **Checkout**
- [ ] Checkout:
  - **1 Contact**: Full name, Mobile number (10 digit), Email (optional)
  - **2 Delivery address**: Pincode, House no., building, street, Area / locality, Landmark, City, State
  - **3 Updates & payment**: ✅ "Send me updates about this order by SMS and email" (zaroori) + ✅ **"Also send them on WhatsApp"** (isse WhatsApp messages outbox me aayenge)
- [ ] **Pay ₹X securely** → "Reserving your jars…" → timer **"Jars reserved for MM:SS"** → mock dialog **"Test payment (no real money)"** (badge Test mode)
- [ ] Window A → Inventory: is product ka available stock 1 kam (RESERVED)
- [ ] Dialog me **Pay successfully** → order page `/order/PK-XXXXXX` → **"Your order is confirmed!"**
- [ ] Order code note karo: `PK-______`

---

## Part 4 — System khud (1–2 minute ruko)

- [ ] Window A → **Orders** → tab **Awaiting packing** me order (pehle `CONFIRMED`, AWB + label aane ke baad `AWAITING_PACKING`)
- [ ] Order kholo → drawer: tab **Shipping** me courier + AWB; buttons **Label**, **Invoice** dikhen; **Invoice** PDF khule (DRAFT watermark agar seller details nahi)
- [ ] Tab **Notes · messages** → **Messages sent** me `order_confirmed`
- [ ] Outbox:
  ```bash
  curl -s http://localhost:4000/api/v1/dev/messages | jq '.data.messages[] | {at, channel, to, template}'
  ```
  → customer ko `order_confirmed` (WHATSAPP), partner ko `new_order_alert` (WHATSAPP, kyunki local par push keys nahi)
- [ ] Customer order page (Window C) par status confirmed / packing ki taraf; **Download invoice** button

> Agar order `CONFIRMED` par atka rahe: tab **Needs attention** dekho (booking fail — sabse common wajah pickup nickname missing ya product ka packed weight missing). Fix karke drawer me **Retry booking**.

---

## Part 5 — Partner packing (Window B)

- [ ] **Pehle (agar shaam ko test kar rahe ho):** Window A → Settings → **Courier pickup cut-off** ko abhi ke ghante se zyada karo (e.g. 20) — taaki pickup date **aaj** ki bane. Sunday ko pickup Monday ka hi banega.
- [ ] `/desk` → **🏔️ Aaj ke orders**, tab **Pack karna hai** me order card (batch code + jar count "Ye jar uthayein")
- [ ] **Ye order pack karein** → pack screen
- [ ] **🖨️ Label Print karein** → label PDF khule (sandbox label)
- [ ] Checklist ke 6 tick: Sahi batch ka jar · Jar ka wazan kiya · Dhakkan tight + seal check · Shrink band seal kiya · Bubble wrap + hila ke dekha · Label + FRAGILE sticker
- [ ] **✅ Pack ho gaya** → toast "PK-XXXXXX pack ho gaya" + "Courier pickup &lt;aaj ki date&gt;"
- [ ] Tab **Pack ho gaye** me order; Window A Orders → tab **In transit** me status `PACKED`

---

## Part 6 — Pickup + courier simulate (Window A + terminal)

**Pickup (`PACKED → PICKUP_SCHEDULED`)** — courier scan sirf `PICKUP_SCHEDULED` ke baad status badalta hai. Worker ka `PICKUP_BATCH` har 15 minute chalta hai aur sirf cut-off nikalne ke baad book karta hai:

- [ ] Window A → Settings → **Courier pickup cut-off** ko abhi ke ghante ya usse kam karo (min 6)
- [ ] Max 15 minute ruko → order `PICKUP_SCHEDULED`; Desk → tab **Pickup** me order + **Pickup manifest**
- [ ] Test ke baad cut-off wapas **11** kar do

> Dhyan: API restart (code change par auto-reload bhi) hone par sandbox Shiprocket ke shipments memory se mit jaate hain — tab naya order bana kar dobara karo.

**Courier scans** (`PK-XXXXXX` ko apne order code se badlo):

```bash
# 1) Pickup ho gaya → IN_TRANSIT (customer: order_shipped)
curl -s -X POST http://localhost:4000/api/v1/dev/shipping/simulate -H 'content-type: application/json' \
  -d '{"orderCode":"PK-XXXXXX","status":"PICKED UP","location":"Kullu"}'

# 2) Last mile → OUT_FOR_DELIVERY (customer: out_for_delivery)
curl -s -X POST http://localhost:4000/api/v1/dev/shipping/simulate -H 'content-type: application/json' \
  -d '{"orderCode":"PK-XXXXXX","status":"OUT FOR DELIVERY","location":"Chennai"}'

# 3) Delivered → DELIVERED (customer: delivered_storage_tip)
curl -s -X POST http://localhost:4000/api/v1/dev/shipping/simulate -H 'content-type: application/json' \
  -d '{"orderCode":"PK-XXXXXX","status":"DELIVERED","location":"Chennai"}'
```

- [ ] Har curl ke reply me `webhook.data.status` = `processed`
- [ ] Step 1 ke baad Orders → **In transit** me `IN_TRANSIT`; drawer **Shipping** → **Courier scans** me scan
- [ ] Step 3 ke baad tab **Delivered** me order

---

## Part 7 — Customer side check (Window C)

- [ ] `/track` → **Order code** + **Mobile number used at checkout** → **Track order** → timeline me Delivered
- [ ] Header **Sign in** → **Sign in with your mobile number** → **Send code** → API console me `[DEV OTP] <last4> → <code>` → **6-digit verification code** → **Verify and sign in**
- [ ] Account menu → **My orders** (`/account/orders`) → yeh order list me (guest order bhi same phone se dikhta hai)
- [ ] Order page par **Download invoice** kaam kare
- [ ] Outbox me sequence (newest first): `delivered_storage_tip`, `out_for_delivery`, `order_shipped`, `new_order_alert`, `order_confirmed`

---

## Part 8 — Paisa: dashboard, expense, settlement (Window A, phir B)

- [ ] **Dashboard** → "Today at a glance" me **Revenue today** (toggle **Incl. GST / Ex-GST**) me yeh order dikhe
- [ ] **Expenses** → **Add expense** → Category **Packaging**, Amount ₹250, Date aaj, Paid by **Business account**, Description → **Add expense** → toast "Expense added" (Paid by = kitchen partner ho toh settlement me partner ko reimburse hota hai)
- [ ] **Settlements** → **Generate settlement** → **From** = aaj, **To** = aaj (presets "Last month" / fortnight me aaj ka order nahi aayega) → **Generate draft** → toast "Draft settlement ready"
- [ ] Detail page: tab **Orders** me order ki line (Revenue ex-GST, Raw cost, Packaging, Freight, Gateway, Net); tab **Warnings** khaali ho (warna **Delete draft** → baad me regenerate)
- [ ] **Finalize** → "Finalize this settlement?" → **Finalize** → toast "Settlement finalized"; **Statement PDF** khule
- [ ] Outbox me partner ko `settlement_ready` (21:00–08:00 IST ke beech ho toh 08:00 tak hold)
- [ ] Partner (Window B) → **Hisaab** → statement kholo → **"Is this hisaab correct?"** → **Haan, maine check kiya — Acknowledge** → "You acknowledged this statement on …"
- [ ] Admin → **Mark paid** → **Bank / UPI reference**, **Paid on** → **Mark paid** → toast "Settlement marked paid"
- [ ] **Exports** se `orders.csv` download; **Audit log** me `SETTLEMENT_FINALIZE`, `SETTLEMENT_PAID` entries

🎉 Yahan tak sab tick = happy path end-to-end chal raha hai.

---

## Part 9 — Exception scenarios (har ek naye order par)

Commands (psql se `gateway_order_id` nikalna, payment simulate, courier scans) aur har case ki poori detail: [06 §17](06-exceptions-refunds-ndr-rto.md#17-local-par-exception-cases-kaise-try-karein).

| ✓ | Scenario | Local par kaise karein | Kya hona chahiye |
| :-- | :-- | :-- | :-- |
| [ ] | Payment fail | Mock dialog → **Fail payment** | "Payment not completed" + timer + **Retry payment**; order `PENDING_PAYMENT` |
| [ ] | Browser band (webhook se confirm) | Mock dialog → **Pay, then close browser** | ~2 s me webhook confirm; "Confirming your payment…" → "Your order is confirmed!" |
| [ ] | Stock hold expire | Settings → **Checkout stock hold** = 5; order banao, pay mat karo; 5–6 min ruko | `EXPIRED`, stock wapas, "Payment window ended — jars released" (baad me setting 15 wapas) |
| [ ] | Late payment, stock bacha | Expired order ka `gateway_order_id` psql se → `POST /api/v1/dev/payments/simulate` `{"razorpayOrderId":"…","outcome":"success"}` | `EXPIRED → CONFIRMED`, booking aage chalti hai |
| [ ] | Late payment, stock khatam | Expire hone do → stock 0 karo (Inventory → **Adjust**) → simulate success | `CANCELLED` (`LATE_PAYMENT_STOCKOUT`), refund PENDING, outbox me `order_cancelled` |
| [ ] | Duplicate payment | Already-paid order ke `gateway_order_id` par simulate success dobara | Order wahi; `DUPLICATE_PAYMENT` refund; **Needs attention** me |
| [ ] | Customer cancel | OTP login (`[DEV OTP]`) → **My orders** → `CONFIRMED`/`AWAITING_PACKING` order → **Cancel order** → Reason → **Cancel order** | `CANCELLED`, stock wapas, refund PENDING, `order_cancelled` |
| [ ] | Admin cancel | Orders → order (max `PICKUP_SCHEDULED` tak) → **Cancel order**, **Refund ₹X to the customer** ticked | `CANCELLED`, refund shuru; kitchen tak pahuncha tha toh partner ko `order_cancelled_partner` |
| [ ] | Admin partial refund | `DELIVERED` order → **Refund** → ₹100, reason "Damaged in transit" | Payment `REFUND_PENDING`, order `DELIVERED` hi; "Still refundable" kam |
| [ ] | Shiprocket booking fail | `shiprocket_pickup_name` ko NULL karo, order pay karo | `CONFIRMED` par atka; **Needs attention** me "…has no Shiprocket pickup name"; nickname wapas set → **Retry booking** → `AWAITING_PACKING` |
| [ ] | NDR | `OUT_FOR_DELIVERY` ke baad simulate `"status":"UNDELIVERED"` | `DELIVERY_FAILED`; **NDR** + **Needs attention** tabs; `delivery_attempt_failed`; /track par warning |
| [ ] | NDR reattempt | Simulate `"OUT FOR DELIVERY"` phir `"DELIVERED"` | `DELIVERED`, NDR tab se bahar |
| [ ] | RTO | NDR ke baad simulate `"RTO INITIATED"` phir `"RTO DELIVERED"` | `RTO_IN_TRANSIT → RTO_DELIVERED`; ops issue "decide refund (Q-04)"; **stock wapas nahi** (D-31) |
| [ ] | Lost | `IN_TRANSIT` order par simulate `"LOST"` | `LOST`, ops issue, **RTO** tab |

Local limits: mock Razorpay refund ko kabhi "processed" nahi karta (refund `PENDING` hi dikhega); amount mismatch HTTP se trigger nahi hota; sandbox ke wallet-empty / unserviceable-pincode faults sirf automated tests se.

---

## Jo local par test **nahi** ho sakta (asli keys / device chahiye)

| Cheez                                                   | Kyun                                         | Pending ref                     |
| :------------------------------------------------------ | :------------------------------------------- | :------------------------------ |
| Asli Razorpay modal, UPI intent, browser-close webhook  | Razorpay test keys + public webhook URL      | P-1 … P-4                       |
| Asli Shiprocket booking, 4×6 label barcode, courier webhook | Shiprocket account + KYC                  | S-1 … S-8                       |
| Asli WhatsApp / SMS delivery                            | Meta Business + TRAI DLT                     | M-1 … M-3                       |
| Partner phone par push notification + offline sync      | VAPID production keys + HTTPS deploy + phone | D-1, D-2, D-7                   |
| Admin alert real WhatsApp / e-mail par                  | `ADMIN_ALERT_PHONES` + real provider; e-mail sender abhi log-only | M-4, H-9      |
| Production invoice (bina DRAFT)                         | GSTIN + legal entity                         | G-1 … G-4                       |

Saari list: [`requirement/pending-requirements.md`](../requirement/pending-requirements.md).
