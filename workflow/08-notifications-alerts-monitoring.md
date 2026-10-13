# 08 — Notifications, Alerts aur Monitoring

> Is file me bataya gaya hai ki **kaun sa message kisko, kab, kis channel se** jata hai (customer / kitchen partner / admin),
> admin alerts aane par kya karna hai, aur system healthy hai ya nahi yeh kaise dekhte hain.
> Sab names code se verify kiye gaye hain — source: [`packages/shared/src/notifications/templates.ts`](../packages/shared/src/notifications/templates.ts),
> [`messages.service.ts`](../apps/backend/src/modules/notifications/messages.service.ts),
> [`notifications.service.ts`](../apps/backend/src/modules/notifications/notifications.service.ts),
> [`ops-alerts.service.ts`](../apps/backend/src/modules/admin/ops-alerts.service.ts). Decisions: D-16, D-54 (e), D-55, D-56 (g, l), D-57 (f) in [`architecture/08-decisions-log.md`](../architecture/08-decisions-log.md).

Related: [README](./README.md) · [05 — Fulfilment](./05-order-fulfilment-admin-partner.md) · [06 — Exceptions](./06-exceptions-refunds-ndr-rto.md) · [07 — Settlements](./07-money-settlements-reports.md) · [09 — Test checklist](./09-end-to-end-test-checklist.md)

---

## 1. Channels — kaun sa rasta kab

| Channel                       | Kisko                     | Kab use hota hai                                                                                                                                                          | Local (dev) me                                                                           | Production me                                                                 |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **WhatsApp**                  | Customer, Partner, Admin  | Customer ko **sirf tab** jab checkout par "Also send them on WhatsApp" tick kiya ho (`orders.whatsapp_opt_in`). Partner/Admin ko hamesha (staff number, consent gate nahi). | `WHATSAPP_PROVIDER=mock` → kuch nahi bhejta, Redis outbox me save (`GET /api/v1/dev/messages`) | `WHATSAPP_PROVIDER=cloud` (Meta WhatsApp Cloud API). Mock production me refuse |
| **SMS**                       | Customer (aur fallback)   | Sirf **critical** templates ke liye — jab WhatsApp opt-in nahi hai, ya WhatsApp fail hua                                                                                  | `SMS_PROVIDER=mock` → same outbox                                                        | `SMS_PROVIDER=msg91` (MSG91 Flow, TRAI DLT templates)                         |
| **Web Push**                  | Kitchen partner           | Naya order, cancel ("pack mat karein"), daily digest — Packing Desk PWA par                                                                                               | VAPID keys khaali → push "disabled" → seedha WhatsApp fallback                           | `VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT` set hon tab            |
| **E-mail**                    | Sirf Admin (alert fallback) | Jab koi admin WhatsApp number tak alert nahi pahuncha                                                                                                                   | Log-only driver (console me `admin email (log driver)`)                                  | **Abhi system me nahi hai (pending M-4)** — provider (Resend/SES/SMTP) choose karna baaki |
| **OTP SMS**                   | Customer (login)          | My Orders login / OTP                                                                                                                                                     | `OTP_PROVIDER=mock` → API console me `[DEV OTP] <last 4 digits> → <code>`                | `OTP_PROVIDER=msg91`                                                          |

> Customer ko **koi e-mail nahi jata** (na order, na invoice). Detail niche §8 me.

### 1.1 Delivery rules (system khud kya karta hai)

1. **WhatsApp pehle** (agar allowed). Fail → agar template **critical** hai to **SMS fallback**.
2. **Critical** templates (SMS fallback wale): `order_confirmed`, `out_for_delivery`, `delivery_attempt_failed`, `order_cancelled`, `refund_processed`.
3. Customer ne WhatsApp opt-in **nahi** kiya → critical = SMS, baaki (non-critical) **bheja hi nahi jata** (DPDP rule, D-55 f). Matlab bina opt-in ke `order_shipped` aur `delivered_storage_tip` customer ko nahi milte.
4. **Quiet hours 21:00–08:00 IST** — sirf `packing_digest` aur `settlement_ready` par. Raat ko aaye to subah 08:00 baje jata hai.
5. **Dedup:** same order + same template + same phone par ek baar SENT/DELIVERED/READ ho gaya to 30 din tak dobara nahi jayega. (Admin ka **Resend message** button is rule ko jaan-boojh kar bypass karta hai.)
6. Retry: har notify job 3 baar retry (BullMQ, 30 s backoff). WhatsApp ka retryable error aakhri attempt tak retry hota hai, phir SMS fallback.
7. Har attempt `notifications_log` table me likha jata hai (status `QUEUED → SENT → DELIVERED → READ` ya `FAILED`). WhatsApp ki delivery receipts `POST /api/v1/webhooks/whatsapp` se aati hain (Meta signature `X-Hub-Signature-256` check hota hai).
8. Message language: customer = `CUSTOMER_MESSAGE_LANGUAGE` (default `en`); partner = hamesha Hindi (`hi`); admin = English. Checkout par customer se language **abhi nahi poochi jati** (D-55 i).

---

## 2. Customer messages

| Message (admin UI label)    | Kisko    | Kab (trigger)                                                                                                    | Channel                         | Template name             |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------- |
| Order confirmed             | Customer | Payment confirm hote hi (order `CONFIRMED`) — job `ORDER_CONFIRMED`                                              | WhatsApp → SMS (critical)       | `order_confirmed`         |
| Order shipped               | Customer | Courier ka pehla scan → order `IN_TRANSIT` — job `ORDER_STATUS_NOTIFY`                                            | Sirf WhatsApp (opt-in ho to)    | `order_shipped`           |
| Out for delivery            | Customer | Order `OUT_FOR_DELIVERY`                                                                                         | WhatsApp → SMS (critical)       | `out_for_delivery`        |
| Delivered + storage tip     | Customer | Order `DELIVERED`                                                                                                | Sirf WhatsApp (opt-in ho to)    | `delivered_storage_tip`   |
| Delivery attempt failed     | Customer | Order `DELIVERY_FAILED` (NDR)                                                                                    | WhatsApp → SMS (critical)       | `delivery_attempt_failed` |
| Order cancelled             | Customer | Order `CANCELLED` — customer cancel, admin cancel, ya late payment par stock khatam (job `ORDER_CANCELLED`)        | WhatsApp → SMS (critical)       | `order_cancelled`         |
| Refund processed            | Customer | Razorpay refund `PROCESSED` ho gaya (job `REFUND_PROCESSED`). `DUPLICATE_PAYMENT` refund par **nahi** jata         | WhatsApp → SMS (critical)       | `refund_processed`        |

Message ka text (English version, `{{...}}` = variable):

- `order_confirmed`: "Hi {{customer_name}}, your order {{order_code}} is confirmed: {{items}}. Track: {{track_url}} — Pahadi Khatki"
- `order_shipped`: "Your order {{order_code}} is on its way with {{courier}} (AWB {{awb}}), expected by {{etd}}. Track: {{track_url}}"
- `out_for_delivery`: "Your Pahadi Khatki order {{order_code}} is out for delivery today. Track: {{track_url}}"
- `delivered_storage_tip`: "Order {{order_code}} delivered! Keep the jar in a cool, dry place and always use a dry spoon 🏔️"
- `delivery_attempt_failed`: "The courier could not deliver order {{order_code}}. Reply or chat with us to reattempt: {{help_url}}"
- `order_cancelled`: "Your order {{order_code}} has been cancelled. {{refund_note}}" — paid order par refund_note = "Your refund of ₹… is on its way (5–7 working days)."
- `refund_processed`: "Refund of {{amount}} for order {{order_code}} is processed. It reaches your account in 5–7 working days."

`track_url` = `STOREFRONT_PUBLIC_URL` + `/track?code=<ORDER_CODE>` (local: `http://localhost:3000/track?code=PK-…`). `help_url` bhi abhi wahi track link hai.

**`PACKED` aur `PICKUP_SCHEDULED` par customer ko koi message nahi jata** (doc 07 §6 me bhi nahi hai — yeh design hai).

### Customer side (website par kya dikhega)

- Checkout par consent section:
  - "Send me updates about this order by SMS and email" — **required** checkbox.
  - "Also send them on WhatsApp" — optional, **default OFF**. Hint: "Optional. Without it we use SMS only. No marketing messages either way."
- Message ka link `/track` page kholta hai (order code pre-filled), wahan phone daal kar status timeline dikhti hai — detail [04 — Customer journey](./04-customer-journey-storefront.md).

### Admin side

- **Orders → order kholo → tab "Notes · messages" → block "Messages sent"**: har message ka label (upar wali table ka pehla column), channel, recipient, time, status badge (Sent / Delivered / Read = green, Failed = red) aur error text.
- Header par **"Resend message"** button → dialog **"Resend a message"** → "Message" dropdown ("Choose a message") se upar ke 7 me se koi bhi chuno → toast **"Message queued"**. Yeh audit log me `NOTIFICATION_RESEND` likhta hai aur dedup bypass karta hai (D-56 g).
- Customer card me "WhatsApp updates on/off" dikhta hai + **WhatsApp** button (click-to-chat `wa.me` link) — admin khud manually baat kar sakta hai.

---

## 3. Kitchen partner messages

| Message                    | Kisko                                 | Kab                                                                                              | Channel                                         | Template name             |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------- |
| 🆕 Naya order               | Order ki kitchen ke saare active partners | Order `CONFIRMED` hote hi (job `PARTNER_NEW_ORDER_ALERT`)                                         | Web Push → (push nahi pahuncha to) WhatsApp     | `new_order_alert`         |
| ⛔ Order cancel — pack mat karein | Kitchen partners                  | Order cancel hua **aur** woh `AWAITING_PACKING` / `PACKED` / `PICKUP_SCHEDULED` se cancel hua tha | Web Push → WhatsApp                             | `order_cancelled_partner` |
| 🏔️ Aaj ke orders (digest)    | Kitchen partners                      | Roz **09:00 IST** (cron `PARTNER_DAILY_DIGEST`), sirf jis kitchen me `AWAITING_PACKING` orders > 0 | Web Push → WhatsApp (quiet hours)               | `packing_digest`          |
| Hisaab taiyaar             | Saare active partners                 | Admin settlement **Finalize** kare tab                                                          | WhatsApp (quiet hours)                          | `settlement_ready`        |

Partner texts Hindi me jaate hain, e.g. `new_order_alert`: "Naya order {{order_code}} — {{jars}} jar pack karne hain." · `settlement_ready`: "{{period}} ka hisaab taiyaar hai — aapka payout {{payout}}. Desk app me dekh kar acknowledge karein."

Push notification ka title/body code me: "🆕 Naya order" / "PK-… — N jar" (click → `/desk?order=PK-…`), "⛔ Order cancel" / "PK-… — pack mat karein", "🏔️ Aaj ke orders" / "Aaj N order pack karne hain".

### Partner side (Packing Desk PWA par)

1. Desk → **Settings** (`/desk/settings`) → card **"Naye order ka alert"** (English: "New order alerts").
2. Button **"🔔 Naye order ka alert chalu karein"** dabao → browser permission allow karo → "Is phone par alert chalu hain." Band karne ke liye **"Alert band karein"**.
3. Agar server par VAPID keys nahi hain to card par likha aayega: "Server par phone alert abhi set nahi hain — naye order WhatsApp par aayenge." iPhone par pehle app Home Screen par add karna padta hai.
4. WhatsApp fallback ke liye partner ka phone `users.phone` me hona chahiye (staff seed partner ka phone poochta hai) — warna message `NO_PHONE` skip ho jata hai.

---

## 4. Admin alerts (WhatsApp / e-mail)

**Kaise kaam karta hai (system):** koi bhi problem → job `ADMIN_ALERT { kind, message }` → template `admin_alert` ("[Pahadi Khatki ops] {{kind}}: {{message}}") har number par jo `ADMIN_ALERT_PHONES` me hai (comma-separated `+91…`). Kisi ko WhatsApp na pahunche aur `ADMIN_ALERT_EMAIL` set ho → e-mail fallback (abhi log-only). Same `kind` 10 minute me baar-baar aaye to **pehla turant**, baaki ka ek summary: `N more "<kind>" alert(s) in the last 10 minutes — see the admin dashboard` (job `ADMIN_ALERT_SUMMARY`).

> ⚠️ Admin panel me alerts ka koi **inbox / bell icon nahi hai** — alert sirf WhatsApp/e-mail par aata hai. Admin panel me unka asar **Orders → "Needs attention"** tab aur **Queues & webhooks** page par dikhta hai.
> ⚠️ Local `.env` me `ADMIN_ALERT_PHONES=` khaali hai → alert kahin nahi jata (outbox me bhi nahi). Worker console me `admin alert: …` / `ops alert: …` warning line dikhegi. Local test ke liye `.env` me apna `+91…` number daal do, phir alerts `GET /api/v1/dev/messages` me dikhenge.

### 4.1 Order / logistics alerts

| Kind                                   | Kab aata hai                                                                                     | Admin ko kya karna hai                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `DELIVERY_FAILED`                      | Courier ne NDR diya (delivery fail)                                                              | Customer se baat karo (WhatsApp button), Shiprocket me reattempt/address update. Detail [06](./06-exceptions-refunds-ndr-rto.md) |
| `RTO_IN_TRANSIT`                       | Parcel wapas aa raha hai                                                                         | Customer ko inform karo; jars restock **nahi** honge (D-31)                                                               |
| `RTO_DELIVERED`                        | Parcel kitchen wapas pahuncha                                                                    | Order par ops issue banta hai "decide refund (Q-04)" → refund ka faisla karo, **Resolve issue**                           |
| `LOST`                                 | Courier ne parcel lost bataya                                                                    | Shiprocket claim + customer ko refund (reason `LOST`)                                                                     |
| `PICKUP_EXCEPTION`, `PICKUP_ERROR`, `COURIER_CANCELLED`, `PARTIAL_DELIVERED`, `DISPOSED_OFF`, `UNTRACEABLE` | Courier ka aisa status jo kisi order status par map nahi hota ([`shiprocket-status-map.ts`](../packages/shared/src/logistics/shiprocket-status-map.ts)) | Shiprocket panel me shipment dekho, courier se baat karo                                                                  |
| `BOOKING_FAILED`                       | Shiprocket booking / label / pickup job 5 retry ke baad bhi fail (dead letter)                   | Order detail → **Retry booking**; agar pincode undeliverable hai to cancel + refund (pending R-5)                         |
| `AWB_CANCEL_FAILED`                    | Cancel ke baad Shiprocket AWB cancel nahi hua                                                    | Shiprocket panel me manually AWB cancel karo                                                                              |
| `PICKUP_BATCH_FAILED`                  | Cut-off ke baad kitchen ka pickup request fail                                                   | Agla run (15 min) khud retry karta hai; baar-baar aaye to Shiprocket check karo                                           |
| `PICKUP_MISSED`                        | Pickup book hue 48 ghante ho gaye, courier scan nahi                                             | Shiprocket / courier se pickup follow-up                                                                                  |
| `WEIGHT_DISCREPANCY`                   | Courier ne declared weight se kaafi zyada charge kiya                                            | Shiprocket me weight dispute raise karo; order par ops issue bhi banta hai                                                |
| `WALLET_LOW`                           | Shiprocket wallet `shiprocket_wallet_min_paise` setting se kam (hourly check)                    | Wallet recharge karo — warna AWB fail honge. Runbook: [shiprocket-down-wallet-empty](../docs/runbooks/shiprocket-down-wallet-empty.md) |
| `UNKNOWN_AWB`                          | Courier webhook aaya kisi AWB ka jo hamare shipments me nahi                                     | Usually ignore; bar-bar aaye to Shiprocket webhook config check karo                                                       |
| `LEDGER_MISMATCH`                      | Roz 03:30 IST stock ledger check me gadbad                                                       | Stock **adjust mat karo** — runbook follow: [stock-ledger-mismatch](../docs/runbooks/stock-ledger-mismatch.md)            |

### 4.2 Ops alerts (D-57 f — cron `OPS_ALERTS`, har 10 minute)

| Kind                 | Kab aata hai                                                                 | Admin ko kya karna hai                                                                                         |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SERVER_ERRORS_SPIKE` | Pichhle 10 min me 20 se zyada server errors (5xx)                            | Sentry check karo. Runbook: [worker-queue-5xx](../docs/runbooks/worker-queue-5xx.md)                           |
| `JOBS_FAILED`        | Koi background job hamesha ke liye fail ho gaya                              | **Queues & webhooks** → "Job queues" tab (bull-board) me failed job dekho                                       |
| `QUEUE_BACKLOG`      | 200 se zyada jobs waiting, ya sabse purana 10 min se zyada wait kar raha     | Worker chal raha hai? `GET /healthz/worker` check karo                                                         |
| `OPS_ISSUES_OPEN`    | Koi order 1 ghante se zyada "Needs attention" me pada hai                    | **Orders → Needs attention** tab, order kholo, fix karke **Resolve issue**                                     |
| `WEBHOOK_FAILURES`   | Pichhle 1 ghante me koi Razorpay/courier webhook fail                        | **Queues & webhooks** → "Webhook failures" → **Replay**. Runbook: [webhooks-failing](../docs/runbooks/webhooks-failing.md) |
| `PAYMENTS_STUCK`     | Order expiry ke 10 min baad bhi `PENDING_PAYMENT`                            | Expiry sweeper (worker) chal raha hai? Runbook: [payment-captured-not-confirmed](../docs/runbooks/payment-captured-not-confirmed.md) |
| `TEST_ALERT`         | Admin ne **Send test alert** dabaya                                          | Kuch nahi — bas check karo ki message aaya                                                                     |

> Refund fail (`REFUND_FAILED`) par **turant alert nahi** jata — order par ops issue banta hai, aur 1 ghante baad `OPS_ISSUES_OPEN` alert aata hai. Runbook: [refund-failed](../docs/runbooks/refund-failed.md).

### 4.3 Test alert bhejna

Admin → **Dashboard** → section **"Operations"** → button **"Send test alert"** → confirm dialog "Send a test alert?" → toast **"Test alert sent"**. API: `POST /api/v1/admin/ops/test-alert` (audit log me `ALERT_TEST`). Production go-live se pehle real WhatsApp par receive karna zaroori hai (pending H-9).

---

## 5. Monitoring — system healthy hai ya nahi

### 5.1 Health URLs (API root par, `/api/v1` ke bahar)

| URL                 | Kya batata hai                                                   | Fail par                                       |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| `GET /healthz`      | API process zinda hai (koi dependency check nahi)                | —                                              |
| `GET /readyz`       | Database + Redis reachable                                       | `503 UPSTREAM_UNAVAILABLE`                     |
| `GET /healthz/worker` | Worker ka heartbeat (har 30 s likhta hai) 90 s se purana to nahi | `503` "Worker heartbeat missing" — worker band |

Local: `curl http://localhost:4000/healthz`, `curl http://localhost:4000/readyz`, `curl http://localhost:4000/healthz/worker`.
Production me in par uptime monitor lagana hai — **abhi set nahi (pending H-8)**, detail [`docs/ops/monitoring.md`](../docs/ops/monitoring.md).

### 5.2 Admin panel me

| Jagah                                                     | Kya dikhta hai                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard → "Operations"**                              | Orders per hour (last 24 h), "Refunds · 30 days", "NDR rate", "RTO rate" (% of shipped) + "Send test alert". Conversion rate yahan nahi — GA4 se (D-57 g) |
| **Orders → "Needs attention"** (`/orders?tab=attention`)  | Ops issues + failed deliveries wale orders. `/ops-issues` bhi yahin redirect hota hai                                                             |
| **Queues & webhooks** (`/ops`, sidebar group "System")    | Tab "Webhook failures" (Failed webhooks, With errors, Providers, Oldest failure + **Replay** button) aur tab "Job queues" (bull-board, `/api/v1/admin/queues`) |
| **Audit log** (`/audit-log`)                              | `NOTIFICATION_RESEND`, `ALERT_TEST` jaisi admin actions                                                                                           |

### 5.3 Errors

- **Sentry**: `SENTRY_DSN` set ho to backend/storefront/admin errors Sentry me jaate hain. Local `.env` me khaali hai — **real DSN verify pending (I-2)**.
- Logs: API aur worker console (pino). Phone numbers log me masked hote hain.

---

## 6. Local par messages kaise dekhein (mock outbox)

`WHATSAPP_PROVIDER=mock` **aur** `SMS_PROVIDER=mock` dono hon tabhi yeh dev route register hota hai (production me nahi):

```bash
# Saare WhatsApp + SMS jo "bheje" gaye (newest first, max 100) — koi login/token nahi chahiye
curl -s http://localhost:4000/api/v1/dev/messages | jq '.data.messages[] | {at, channel, to, template, text}'
```

Har entry: `id` (`wamid.MOCK…` / `sms.MOCK…`), `channel`, `to`, `template`, `language`, `variables`, `text` (rendered), `at`. Koi query param/filter nahi hai.

WhatsApp delivery receipt simulate karna (admin "Messages sent" me status badalta dikhega):

```bash
curl -s -X POST http://localhost:4000/api/v1/dev/messages/status \
  -H 'content-type: application/json' \
  -d '{"providerMessageId":"wamid.MOCK<id-from-outbox>","status":"delivered"}'
# status: sent | delivered | read | failed
```

Testing tricks:

- Customer phone ka last 4 digit **`0000`** ho → mock WhatsApp "not on WhatsApp" error deta hai → critical message SMS par fallback hota hai.
- WhatsApp opt-in tick **mat** karo → `order_confirmed`/`out_for_delivery` SMS par aayenge, `order_shipped`/`delivered_storage_tip` aayenge hi nahi.
- OTP: API console me `[DEV OTP] 3210 → 123456` jaisi line.

### 6.1 Ek happy-path order par outbox me kya-kya aayega (sequence)

Maan lo customer ne WhatsApp opt-in kiya, VAPID keys local me khaali hain (to partner ko push nahi, WhatsApp fallback):

| #   | Kab                                        | Channel  | To       | Template                |
| --- | ------------------------------------------ | -------- | -------- | ----------------------- |
| 1   | Mock payment "Pay successfully" ke baad    | WHATSAPP | Customer | `order_confirmed`       |
| 2   | Saath hi                                   | WHATSAPP | Partner  | `new_order_alert`       |
| 3   | Courier simulate → `IN_TRANSIT`            | WHATSAPP | Customer | `order_shipped`         |
| 4   | Courier simulate → `OUT_FOR_DELIVERY`      | WHATSAPP | Customer | `out_for_delivery`      |
| 5   | Courier simulate → `DELIVERED`             | WHATSAPP | Customer | `delivered_storage_tip` |
| 6   | (Baad me) Admin settlement Finalize        | WHATSAPP | Partner  | `settlement_ready` (21:00–08:00 ke beech ho to subah 08:00 par) |

Optional: agle din 09:00 IST par `packing_digest` (agar koi order abhi bhi `AWAITING_PACKING` hai). 1 aur 2 ka order aapas me aage-peeche ho sakta hai (alag jobs). Courier simulate ka curl: [05 — Fulfilment](./05-order-fulfilment-admin-partner.md).

---

## 7. Production me real karne ke liye (env)

| Kaam                    | Env vars                                                                                                    | Pending item |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| WhatsApp Cloud API      | `WHATSAPP_PROVIDER=cloud`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`; Meta webhook `https://<api>/api/v1/webhooks/whatsapp`. Templates Meta me **same naam + variables** se approve hon | M-1, B-11    |
| SMS (MSG91)             | `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATES` (JSON: template → flow id, 5 critical)          | M-2          |
| Admin alerts            | `ADMIN_ALERT_PHONES`, `ADMIN_ALERT_EMAIL`                                                                   | M-4          |
| Partner push            | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`npx web-push generate-vapid-keys`)               | D-1          |
| OTP                     | `OTP_PROVIDER=msg91`, `MSG91_OTP_TEMPLATE_ID`                                                               | B-11         |
| Message links           | `STOREFRONT_PUBLIC_URL` (e.g. `https://pahadikhatki.in`)                                                    | —            |
| Errors                  | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`                                                                          | I-2          |

Production me mock WhatsApp/SMS/OTP par API start hi nahi hoti (env validation refuse karta hai). Saare open items: [`requirement/pending-requirements.md`](../requirement/pending-requirements.md).

---

## 8. Jo abhi system me nahi hai (v2 / pending)

- **Admin e-mail sender** — sirf log driver; real provider choose karna baaki (M-4).
- **Customer ko koi e-mail** — kuch bhi nahi jata, jabki checkout ka required checkbox kehta hai "…by SMS and email".
- **Admin panel me alert inbox / notification bell** — nahi hai; alerts sirf WhatsApp/e-mail par.
- **Customer language choice** checkout par — nahi; sabko `CUSTOMER_MESSAGE_LANGUAGE`.
- **Support WhatsApp number** storefront par (`NEXT_PUBLIC_SELLER_WHATSAPP`, M-5) — tab tak /track ka help button /contact par jata hai.
- **Uptime monitors** (H-8), **real Sentry** (I-2), **real WhatsApp/SMS** (M-1/M-2/M-3), **real-phone push check** (D-2).
