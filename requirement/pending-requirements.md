# 📌 Pending Requirements — Phase 1 se 6 tak jo bacha hai

> **Kyun yeh file:** abhi focus poora system end-to-end complete karne par hai. Jo kaam kisi bahar ki cheez (account, keys, CA/lawyer, business decision, deploy) par atka hai, ya jise jaan-boojh kar baad ke liye chhoda gaya, woh sab yahan ek jagah hai — taaki baad me yeh "sub-flows" jod sakein.
> **Source:** `Phases/phase-0X-*.md` ke unticked checklist items, `architecture/08-decisions-log.md` (Q-01…Q-07, PROPOSED decisions, D-52/D-53 notes).
> **Last updated:** 2026-10-12 (Phase 9 admin console + settlements).
> **Rule:** kuch bhi pura karo toh yahan `[x]` + evidence likho **aur** asli phase file me bhi tick karo (AGENTS.md §4).

**Legend:** 🔑 = account/keys chahiye · 🧾 = CA/lawyer/business decision · 🚀 = deploy/public URL chahiye · 🧑‍🍳 = kitchen/physical kaam · 🛠️ = code baaki · ⏭️ = aage ke phase me plan

---

## 1. 🧾 GST, Invoice & Legal Entity

| # | Kya bacha hai | Blocked on | Code me kahan plug hoga | Phase |
| :-- | :-- | :-- | :-- | :-- |
| G-1 | **Q-02 Legal entity** (Partnership/LLP) — manufacturer vs seller kaun | 🧾 Dono partners + CA | — (sab kuch iske baad) | P0 |
| G-2 | **GST registration** + GSTIN | 🧾 CA | `settings.seller_details.gstin` | P0 |
| G-3 | **Q-01 HSN 2001 ka current GST rate** → har product ka `gst_rate_bp` | 🧾 CA | Admin product edit (publish ke liye required, D-49) | P0/P3 |
| G-4 | **`settings.seller_details` set karna** `{ legalName, gstin, addressLine, city, state, stateCode, pincode }` — tab tak invoice par **DRAFT watermark**, production invoice issue hi nahi karega | G-1, G-2 | `UPDATE settings` (admin settings UI Phase 9) — `apps/backend/src/modules/orders/invoice.service.ts` | P5 (D-52 h) |
| G-5 | Invoice format + numbering `PK/2026-27/000123` CA se approve | 🧾 CA | `packages/shared/src/order/tax.ts` | P0/P5 |
| G-6 | Footer / legal pages par FSSAI no., GSTIN, grievance officer ke **asli values** (abhi "Pending") | G-1, G-2, FSSAI | `apps/storefront/src/modules/content/legal/*` | P4 |
| G-7 | Legal pages ka copy draft hai → business + lawyer review (Razorpay KYC isi par depend) | 🧾 lawyer | same | P4 |

## 2. 🚚 Shiprocket / Logistics

> Abhi `SHIPPING_PROVIDER=sandbox` (nakli Shiprocket, D-53 b). Asli account aate hi: `.env` me `SHIPPING_PROVIDER=shiprocket`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` (API user, panel login nahi), `SHIPROCKET_WEBHOOK_TOKEN` (≥ 24 chars).

| # | Kya bacha hai | Blocked on | Kya karna hai | Phase |
| :-- | :-- | :-- | :-- | :-- |
| S-1 | Shiprocket account + KYC | 🔑 Admin | — | P0 |
| S-2 | **Pickup location register + verify** (Himachal kitchen) aur `pickup_locations.shiprocket_pickup_name` = wahi nickname | 🔑 S-1 | Admin → **Kitchens** → Edit → **Shiprocket pickup name** (ya SQL) — iske bina booking job `PermanentJobError` deta hai | P6 §6.2 |
| S-3 | **Webhook register** panel me (staging + prod alag): URL `https://<api-host>/api/v1/webhooks/courier-tracking`, token = `SHIPROCKET_WEBHOOK_TOKEN`. URL me "shiprocket"/"sr"/"kr" nahi hona chahiye (D-53 a) | 🔑 S-1, 🚀 | Panel → Settings → API → Webhooks | P6 §6.9 |
| S-4 | Label format **4×6 thermal** panel me set karna | 🔑 S-1 | Panel label settings | P6 §6.6 |
| S-5 | **Label barcode** courier scanner / phone app se readable — manual check (sandbox label me barcode nahi hai) | 🔑 S-1 | Ek real test order | P6 verification |
| S-6 | **Status ids re-check** — `shipment_status_id` map public docs se liya; account panel ki list se match karna | 🔑 S-1 | `packages/shared/src/logistics/shiprocket-status-map.ts` | P6 §6.9 (D-53 h) |
| S-7 | **Fixtures re-record** real staging account se (abhi doc samples) | 🔑 S-1 | `apps/backend/tests/fixtures/shiprocket/*.json` | P6 §6.13 |
| S-8 | **Charged weight ka asli source** — abhi tracking API ka `weight`; Shiprocket billing / weight-dispute data wire karna | 🔑 S-1 | `logistics.service.ts › pollTracking` | P6 §6.12 (D-53 l) |
| S-9 | Courier se confirm: glass jar + oil-based non-veg pickle allowed? | 🔑 Admin support ticket | — | P0 |
| S-10 | Wallet recharge strategy + `shiprocket_wallet_min_paise` (default ₹2,000) final | 🧾 Admin | `settings` | P0/P6 |
| S-11 | Courier filter defaults final: `min_courier_rating` 4.0, `max_courier_etd_days` 7 | 🧾 Admin | `settings` | P6 |
| S-12 | **Multi-jar box sizes PROVISIONAL** (2 jar 20×15×10 +60 g, 3–4 jar 25×20×12 +120 g) → procurement ke baad real values | 🧑‍🍳 packaging procurement | `packages/shared/src/logistics/box-rules.ts` | P6 §6.4 (D-53 g) |
| S-13 | **Leak trial + packed weight per SKU** (target 250 g SKU ≤ 500 g, D-34) → `products.packed_weight_g` | 🧑‍🍳 | Admin product edit | P0 |
| S-14 | > 4 jars = abhi ek shipment + `OVERSIZE_PARCEL` alert; **multi-box split** | ⏭️ v2 | — | v2 |
| S-15 | Public holidays pickup calendar me nahi (sirf Sunday off) | 🛠️ optional | `packages/shared/src/logistics/pickup-date.ts` | P6 (D-53 e) |
| S-16 | **Duplicate Shiprocket order ka chhota risk**: Shiprocket create ke baad, DB save se pehle worker crash ho toh retry naya order bana sakta hai — Shiprocket "order by channel id" lookup jodna | 🛠️ + 🔑 (API shape verify) | `logistics.service.ts › bookShipment` | P6 (D-53) |

## 3. ↩️ RTO, NDR, Refunds

| # | Kya bacha hai | Blocked on | Kya karna hai | Phase |
| :-- | :-- | :-- | :-- | :-- |
| R-1 | **Q-04 RTO refund policy** (full refund vs freight kaat ke) + transit damage policy (unboxing video?) | 🧾 Admin | Legal refund page + admin refund action (Phase 9). Abhi RTO_DELIVERED par sirf `ops_issue` "decide refund (Q-04)" lagta hai | P0/P6 |
| R-2 | **`rto_freight_paise` capture** (settlement D-41 me minus hota hai) | 🔑 S-1 (billing data) | `shipments.rto_freight_paise` | P6 §6.11 |
| R-3 | **NDR actions** (reattempt / address update) abhi manual Shiprocket panel se; automation + `ndr_actions` table | ⏭️ v2 | — | v2 |
| R-4 | ✅ Done (Phase 9): orders tab `ndr` | — | — | P9 |
| R-5 | **Undeliverable pincode refund**: checkout copy kehta hai "deliver nahi kar paaye toh full refund", par booking fail hone par refund **automatic nahi** — dead letter + admin alert hota hai, admin cancel + refund karega. Ya toh auto-cancel+refund jodo, ya copy badlo | 🧾 decision | `logistics.service.ts › jobGaveUp` / `AddressSection.tsx` copy | P6 |
| R-6 | ✅ Done (Phase 9): retry uses a fresh job id (D-56 g) | — | — | P9 |
| R-7 | ✅ Done (Phase 9): partial / full admin refunds | — | — | P9 |

## 4. 💳 Razorpay / Payments (abhi `PAYMENT_GATEWAY=mock`)

| # | Kya bacha hai | Blocked on | Kya karna hai | Phase |
| :-- | :-- | :-- | :-- | :-- |
| P-1 | Razorpay account + **test keys** | 🔑 Admin | `.env`: `PAYMENT_GATEWAY=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (alag) | P0/P5 |
| P-2 | **Checkout options verify** real modal me: prefill, theme color from CSS token, `timeout` = bache seconds, UPI intent first on mobile | 🔑 P-1 | `apps/storefront/src/modules/checkout` | P5 §5.6 |
| P-3 | Browser close after payment → webhook se confirm < 1 min (test mode, manual evidence) | 🔑 P-1, 🚀 webhook URL | — | P5 verification |
| P-4 | UPI intent real Android par GPay/PhonePe kholta hai (video/screenshot) | 🔑 P-1, 📱 device | — | P5 verification |
| P-5 | **Meta CAPI `Purchase` + GA4 purchase** — code hai, automated test/real event verify nahi | 🔑 Meta pixel + token, GA4 id | `analytics` relay | P5 §5.7 |
| P-6 | **Live KYC activation** (legal pages + pricing live chahiye) | G-6, G-7, 🚀 | — | P0/P10 |

## 5. 🏭 Business / Compliance (Phase 0 prerequisites)

| # | Kya bacha hai | Owner |
| :-- | :-- | :-- |
| B-1 | FSSAI manufacturing license (Himachal kitchen) + seller FSSAI (agar entity alag) | Kitchen Partner / Admin |
| B-2 | Bank account entity ke naam par | Admin |
| B-3 | Trademark search + filing "Pahadi Khatki"; domain `pahadikhatki.in` + business email | Admin |
| B-4 | Meat sourcing bills (licensed slaughterhouse / trout farm) | Kitchen Partner |
| B-5 | **Q-07 NABL shelf-life study** → har product ka `shelf_life_days` + nutrition | Kitchen Partner |
| B-6 | FSSAI e-commerce minimum remaining shelf-life clause confirm (D-24 default 45 + 7 din) | Admin + consultant |
| B-7 | Label artwork compliance review (non-veg mark, FSSAI no., ingredients, nutrition, **allergens**, MRP, batch, mfg/expiry) | Admin + consultant |
| B-8 | **Allergens publish-required ho ya nahi?** (Phase 3 se user ka jawab pending) | Admin |
| B-9 | **Q-03 Free-shipping threshold + flat shipping fee** — abhi ₹0 shipping (D-50) | Admin |
| B-10 | **Q-05 Settlement cycle** weekly / monthly (P9) | Dono partners |
| B-11 | **Q-06 WhatsApp** Cloud API vs BSP; Meta Business verification + templates; **TRAI DLT** (SMS OTP) | Admin |
| B-12 | Saare **PROPOSED** decisions review → ACCEPTED (D-07, D-10, D-14, D-18, D-24, D-25, D-34, D-36, D-41, D-50) | Dono |
| B-13 | Packaging procurement, induction cap sealer + weighing scale decision | Kitchen Partner |

## 6. 🚀 Infra / Deploy / Observability

| # | Kya bacha hai | Blocked on | Phase |
| :-- | :-- | :-- | :-- |
| I-1 | **Hosting vendors** (D-10): storefront host, API + worker host (alag process), managed PostgreSQL (PITR), managed Redis (persistent TCP) | 🧾 cost decision | P0/P10 |
| I-2 | **Sentry** real DSN se event verify (backend, storefront, admin) | 🔑 Sentry project | P1 |
| I-3 | **S3 bucket setup** (D-58): `pnpm s3:setup --apply` (CORS + public-read `products/*`), `pnpm s3:check` all green, `pnpm s3:sync --apply` for local files, `STORAGE_DRIVER=s3` + storefront `NEXT_PUBLIC_ASSETS_BASE_URL` | 🔑 AWS (keys in `.env`) | P3/P10 |
| I-4 | Lighthouse mobile re-run on deployed URL (local 99/99) | 🚀 | P4 |
| I-5 | Product JSON-LD Google Rich Results test (public URL chahiye) | 🚀 | P4 |
| I-6 | Partner ka manual 50-jar batch entry < 30 sec timed run | 🧑‍🍳 partner | P3 |

## 7. 📱 Phase 7 — Packing Desk PWA

| # | Kya bacha hai | Blocked on | Kya karna hai |
| :-- | :-- | :-- | :-- |
| D-1 | **VAPID keys** — local `.env` me dev keys ban gayi; **production keys** host secrets me (alag generate karo) (`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`) — tab tak push off, alerts WhatsApp fallback job par | 🔑 (`npx web-push generate-vapid-keys`) | `.env` / host secrets |
| D-2 | 📱 **Real phone checks (10–15 min, aap karoge):** (1) Android Chrome me admin URL kholo → menu → *Install app*; iPhone Safari → Share → *Add to Home Screen*. (2) Desk → Settings → "Naye order ka alert" ON. (3) Ek test order pay karo → phone par push 10 s me aaye. (4) Airplane mode → app kholo → order pack karo → airplane off → sync ho jaye. (5) Sasta Android + 4G par queue < 3 s, label < 2 s. Screenshot/video `Phases/evidence/phase-07/` me | 📱 device + D-1 + deploy (HTTPS) | Emulated sab pass ho chuka (`pwa-checks.json`, `pwa-perf.json`) |
| D-4 | ✅ Done: offline cold start (cached identity + queue, 401 → login) | — | — |
| D-5 | **S3 CORS GET** for the admin origin (label "Share") — part of `pnpm s3:setup --apply` (D-58) | 🔑 AWS | `docs/ops/s3-storage.md` |
| D-6 | WhatsApp `new_order_alert` / digest fallback ka asli **sender** | ⏭️ Phase 8 (B-11) | `WHATSAPP_SEND` consumer |
| D-7 | Partner ka real-phone walkthrough (bina training ke install → push → pack → Mark Packed) — phase DoD | 📱 + partner | Manual evidence |

## 7b. 🔔 Phase 8 — Tracking & Notifications

| # | Kya bacha hai | Blocked on | Kya karna hai |
| :-- | :-- | :-- | :-- |
| M-1 | **WhatsApp Cloud API** (ya BSP — Q-06): number + display name approval, templates approve (`packages/shared/src/notifications/templates.ts` ke naam + variables same rakhna) | 🔑 Meta Business (B-11) | `.env`: `WHATSAPP_PROVIDER=cloud`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`; Meta webhook URL `https://<api>/api/v1/webhooks/whatsapp` |
| M-2 | **MSG91 SMS** DLT templates (critical 5: order_confirmed, out_for_delivery, delivery_attempt_failed, order_cancelled, refund_processed) | 🔑 TRAI DLT (B-11) | `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATES` JSON |
| M-3 | Staging par real number par "status change → WhatsApp < 10 s" check | M-1, 🚀 | Manual evidence (Phase 8 checklist ka last item) |
| M-4 | **Admin alert numbers + e-mail**: `ADMIN_ALERT_PHONES`, `ADMIN_ALERT_EMAIL`; e-mail provider abhi log-only — provider choose karna (Resend / SES / SMTP) | 🧾 decision | `integrations/messaging` me EmailSender implement |
| M-5 | **Support WhatsApp number** `NEXT_PUBLIC_SELLER_WHATSAPP` (storefront) — tab tak /track ka help button /contact par jata hai | 🧾 Admin | storefront env |
| M-6 | Customer message language — abhi `CUSTOMER_MESSAGE_LANGUAGE=en`; checkout par language choice chahiye ho toh decide | 🧾 decision | — |
| M-7 | Partner phone numbers `users.phone` me hon (WhatsApp fallback ke liye) | 🧾 Admin (staff setup) | Phase 9 staff screen |

## 7c. 📊 Phase 9 — Admin & Settlements

| # | Kya bacha hai | Blocked on | Kya karna hai |
| :-- | :-- | :-- | :-- |
| A-1 | **Real settlement cycle on staging** (generate → finalize → pay → partner acknowledge) — phase DoD | 🚀 staging + real orders | Manual run + screenshot |
| A-2 | **Q-05 settlement cycle** weekly / monthly (UI kisi bhi period ke liye kaam karta hai) | 🧾 Dono partners | — |
| A-3 | **D-41 formula sign-off** (PROPOSED) + `partner_split_bp` default 50 % confirm | 🧾 Dono partners + CA | `settings.partner_split_bp` |
| A-4 | Real `packaging_cost_per_jar_paise` (abhi ₹32 estimate) | 🧑‍🍳 procurement | Settings page |
| A-5 | ✅ Done (Phase 10): bull-board ka apna CSP, `frame-ancestors` = app origins (D-57 c) | — | `plugins/queue-dashboard.ts` |
| A-6 | Large exports streaming (abhi in-memory CSV — launch volume ke liye theek) | ⏭️ jab orders badhein | `exports.service.ts` |

## 7d. 🛡️ Phase 10 — Hardening & Go-Live

Code side Phase 10 me ho gaya (D-57): ADMIN 2FA mandatory, login lockout, security headers (API / storefront / admin), CI dependency audit + Dependabot, perf indexes (0007), k6 spike + read latency, ops alerts + worker heartbeat + ops metrics, runbooks, ASVS L1 walk-through, launch simulations (local mocks). Yeh sab **real infra / log / business** maangte hain:

| # | Kya bacha hai | Blocked on | Kya karna hai |
| :-- | :-- | :-- | :-- |
| H-1 | **securityheaders.com + SSL Labs A grade** (api., admin., storefront) + hstspreload.org submit | 🚀 deploy (I-1) | `docs/security/headers.md` ke steps |
| H-2 | **Secrets host ke secret manager me** + key rotation register | 🚀 I-1 | `docs/runbooks/key-rotation.md` |
| H-3 | **S3 `private/*` not public** verify — `pnpm s3:check` ("private files are NOT publicly readable"); signed URL TTL 300 s | 🔑 I-3 | `docs/ops/s3-storage.md` |
| H-4 | **PITR enable + restore drill on staging** (timestamp + row counts) | 🚀 I-1 | `docs/runbooks/restore-from-backup.md` → `docs/launch/restore-drill.md` |
| H-5 | Redis persistence (AOF everysec / RDB) provider par set | 🚀 I-1 | `docs/runbooks/restore-from-backup.md` |
| H-6 | **k6 spike + Lighthouse re-run on staging** (local pass: 0 oversell, read p95 12 ms) | 🚀 staging | `load/README.md` |
| H-7 | Pool sizing vs provider `max_connections` confirm | 🚀 I-1 | `docs/ops/capacity.md` table |
| H-8 | **Uptime monitors** (storefront, `/readyz`, `/healthz/worker`, admin) + Sentry release/source-map upload in deploy job | 🚀 I-1 + I-2 | `docs/ops/monitoring.md` |
| H-9 | **Har alert ek baar test-fire + real WhatsApp/e-mail par receive** (test-alert button ready) | 🔑 M-1/M-2 (WhatsApp/SMS keys) | Dashboard → Operations → Send test alert |
| H-10 | **Launch simulations staging par test keys ke saath** (local mocks par sab pass) + storefront screenshots | 🔑 Razorpay test + Shiprocket + WhatsApp | `docs/launch/e2e-results.md` |
| H-11 | **Packaging trial** (2–3 oil-filled jars Himachal → Chennai, leak/seal/weight vs 500 g slab, D-34) | 🧑‍🍳 partner | `products.packed_weight_g` update |
| H-12 | **Soft launch** 5–10 real orders on live keys + settlement dry-run | 🔑 live keys | §10.7 |
| H-13 | **Go-live checklist §10.8** (DNS, Vercel, live Razorpay/Shiprocket/WhatsApp, legal pages, FSSAI, analytics) — dono partners tick karein | 🧾 business + 🚀 | phase file §10.8 |
| H-14 | Conversion rate ops dashboard me nahi — GA4 funnel se (D-57 g, phase file se conflict) | 📊 GA4 | GA4 report |
| H-15 | DPDP deletion abhi manual SQL runbook — admin action v2 backlog | ⏭️ v2 | `docs/runbooks/dpdp-data-deletion.md` |

## 8. ⏭️ Aage ke phases me already planned (sirf yaad ke liye)

| # | Kya | Kab |
| :-- | :-- | :-- |
| N-1 | ✅ Done (Phase 7): `mark-packed` → `SHIPROCKET_SCHEDULE_PICKUP` | — |
| N-2 | ✅ Done (Phase 7): manifests + A4 4-up label sheet on the desk | — |
| N-3 | ✅ Done (Phase 8): notification consumers send (mock until M-1/M-2) | — |
| N-4 | ✅ Done (Phase 8): `/me/orders` includes guest orders with the verified phone | — |
| N-5 | ✅ Done (Phase 9): admin console (orders actions, settings, staff, expenses, settlements, exports, webhooks, audit) | — |
| N-6 | Phase 2 checklist ka "expired refresh tokens daily cleanup" — **code Phase 5 me ho gaya** (`CLEANUP_REFRESH_TOKENS` 03:45 IST); Phase 2 file me evidence ke saath tick karna baaki | housekeeping |

---

## ✅ Jab keys / decisions aa jayein — quick order

1. G-1 → G-2 → G-3 → G-4 (invoice DRAFT hatega)
2. P-1 → P-2…P-5 (Razorpay test mode verification)
3. S-1 → S-2 → S-3 → S-4 → S-5…S-8 (Shiprocket real run)
4. R-1 + R-5 decisions → refund flows final
5. I-1 → I-3 → deploy → I-2, I-4, I-5, P-6
