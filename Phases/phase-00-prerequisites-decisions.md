# 📜 Phase 0: Business Prerequisites, Compliance & Decisions

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **Depends on:** —  ·  **Migration:** —
> **Yeh non-code track hai aur Day 1 se Phase 1–9 ke parallel chalega.** Inme se kai approvals me hafte lag sakte hain — code ready ho jaye aur license na ho, toh launch ruk jayega.

---

## 🎯 Objective
Launch ke liye zaroori saare legal, compliance, payment, logistics aur messaging approvals time par shuru karna, physical product (shelf-life + packaging) ko validate karna, aur `architecture/08-decisions-log.md` ke saare **OPEN / PROPOSED** decisions ko close karna — taaki dev phases ke beech business blockers na aayein.

---

## 📋 Granular Tasks & Checklist

> Lead times **indicative** hain — state, consultant aur document readiness ke hisaab se badalte hain. Apply karte waqt current timeline portal/consultant se confirm karo.

### 0.1 Legal Entity & Banking
| Task | Owner | Typical Lead Time | Blocks |
| :--- | :--- | :--- | :--- |
| - [ ] Legal entity decide + register (Partnership deed / LLP) — kaun manufacturer, kaun seller (**Q-02**) | Dono partners + CA | Partnership deed jaldi ho jata hai; LLP me kuch hafte lag sakte hain | GST, FSSAI, Razorpay, bank |
| - [ ] Current bank account entity ke naam par | Admin | Entity docs ke baad, aam taur par kuch din | Razorpay settlement, Shiprocket wallet |
| - [ ] Brand name **trademark search** (+ filing, class 29/30) — "Pahadi Khatki" | Admin + TM agent | Search turant; registration me lamba time lagta hai (filing se ™ use kar sakte hain) | Branding, domain, packaging print |
| - [ ] Domain `pahadikhatki.in` + business email | Admin | Same day | Razorpay KYC, staff logins |

### 0.2 Food Safety Compliance (FSSAI)
| Task | Owner | Typical Lead Time | Blocks |
| :--- | :--- | :--- | :--- |
| - [ ] Himachal kitchen ke liye **FSSAI manufacturing license/registration** (turnover + scope ke hisaab se State license ya Basic registration) | Kitchen Partner + consultant | Kai hafte lag sakte hain (inspection possible) | Go-live (P10), labels |
| - [ ] Seller / e-commerce FBO ke liye FSSAI registration (agar seller entity alag hai) | Admin | Kuch hafte | Go-live |
| - [ ] Meat sourcing: licensed slaughterhouse / licensed trout farm se supply + bills record | Kitchen Partner | Ongoing | Lab test, FSSAI |
| - [ ] **NABL lab shelf-life study** + microbial, pH, water activity per product (**Q-07**) → actual `products.shelf_life_days` | Kitchen Partner | Accelerated / real-time study ke hisaab se hafton se mahino tak | P3 product data, labels, D-24 |
| - [ ] FSSAI ke e-commerce **minimum remaining shelf-life at delivery** clause consultant se confirm (D-24 defaults 45 + 7 days) | Admin + consultant | Ek consultation | P3 sellable rule |
| - [ ] Label artwork compliance review: Non-veg brown mark, FSSAI no., ingredients, nutrition, allergens, net qty, MRP (Legal Metrology), batch, mfg/expiry, manufacturer address, customer care | Admin + consultant | 1–2 review rounds | Label print, P4 product page |

### 0.3 Tax (GST)
| Task | Owner | Typical Lead Time | Blocks |
| :--- | :--- | :--- | :--- |
| - [ ] **GST registration** (interstate goods supply ke liye threshold exemption generally apply nahi hota — CA confirm kare) | Admin + CA | Aam taur par kuch din se 2–3 hafte | Razorpay KYC, invoices (P5) |
| - [ ] HSN 2001 ka **current GST rate** confirm (Sept 2025 rationalisation ke baad) (**Q-01**) → `products.gst_rate_bp` | CA | Ek consultation | P3 product data, P5 invoices |
| - [ ] Invoice format + numbering approve (`PK/2026-27/000123`, D-32) | CA | Ek consultation | P5 |

### 0.4 Payments (Razorpay)
| Task | Owner | Typical Lead Time | Blocks |
| :--- | :--- | :--- | :--- |
| - [ ] Razorpay account + test keys (turant dev ke liye) | Admin | Same day | P5 dev |
| - [ ] **Live KYC activation** — website par **Privacy, Terms, Refund & Cancellation, Shipping Policy, Contact** pages + product pricing live hone chahiye (P4 deliverable) | Admin | Docs + website review ke baad kuch din se 2 hafte | P10 live keys |
| - [ ] Webhook secret generate (alag from key secret — architecture/07 §4.3) | Admin | Same day | P5 |

### 0.5 Logistics (Shiprocket) & Physical Packaging
| Task | Owner | Typical Lead Time | Blocks |
| :--- | :--- | :--- | :--- |
| - [ ] Shiprocket account + KYC + **pickup address verification** (Himachal kitchen) | Admin + Kitchen Partner | Kuch din | P6 |
| - [ ] Wallet recharge strategy + low-balance alert threshold decide | Admin | — | P6 |
| - [ ] Courier ke saath confirm: glass jar + oil-based non-veg pickle category allowed, packaging guidelines | Admin | Support ticket | P6 |
| - [ ] Packaging procurement (jars, caps with liner, shrink bands, labels, boxes, bubble wrap, dater) — `architecture/05` | Kitchen Partner | 1–2 hafte (vendors par depend) | Physical trial |
| - [ ] **Early physical leak trial**: 2–3 dummy jars (oil + water) Himachal → Chennai normal courier se, 0% leak verify, packed weight measure (target ≤ 500g for 250g SKU, D-34) | Kitchen Partner + Admin | ~1 hafta transit + inspection | P6 package dims/weights, P10 final trial |
| - [ ] Handheld induction cap sealer + weighing scale ka decision | Kitchen Partner | — | SOP |

### 0.6 Messaging (WhatsApp + SMS)
| Task | Owner | Typical Lead Time | Blocks |
| :--- | :--- | :--- | :--- |
| - [ ] **Q-06 decide**: direct WhatsApp Cloud API vs BSP (Gupshup / Interakt) | Admin | — | P8 |
| - [ ] Meta Business verification + WhatsApp number + display name approval | Admin | Kuch din se kuch hafte | P7 partner alerts, P8 |
| - [ ] Template submissions (`order_confirmed`, `order_shipped`, `out_for_delivery`, `delivered_storage_tip`, `delivery_attempt_failed`, `order_cancelled`, `refund_processed`, `new_order_alert`, OTP template) | Admin | Har template ka approval alag; rejection par resubmit | P8 |
| - [ ] **TRAI DLT registration** (entity + sender header + OTP SMS template) via SMS provider (MSG91 etc.) | Admin | Kuch din se 1–2 hafte | P2 live OTP (dev me mock provider) |

### 0.7 Close Open Decisions (`architecture/08-decisions-log.md`)
- [ ] **Q-01** GST rate → recorded.
- [ ] **Q-02** Legal entity → recorded.
- [ ] **Q-03** Free-shipping threshold + flat shipping fee → `settings` seed values.
- [ ] **Q-04** RTO refund policy + transit damage policy (unboxing video?) → legal pages (P4) me likha jayega.
- [ ] **Q-05** Settlement cycle weekly / monthly → P9.
- [ ] **Q-06** WhatsApp provider → P8.
- [ ] **Q-07** Shelf-life days per product → P3 seed data.
- [ ] Saare **PROPOSED** decisions (D-07, D-10, D-14, D-18, D-24, D-25, D-34, D-36, D-41) review karke `ACCEPTED` ya change.
- [ ] Hosting vendors finalize (D-10): storefront host, API/worker host, managed PostgreSQL (PITR), managed Redis.

---

## 🚫 Out of Scope
- Koi bhi code — yeh sirf business/compliance track hai.
- Final physical shipping trial with real label from the system → **Phase 10**.
- Live key switch → **Phase 10**.

---

## 🔍 Verification Checklist
- [ ] Har row ka status + document/approval proof ek shared folder me (license PDFs, GST certificate, KYC approval emails).
- [ ] `architecture/08-decisions-log.md` me koi `OPEN` item nahi bacha; har `PROPOSED` ya toh `ACCEPTED` hai ya explicitly "post-launch" marked.
- [ ] Lab report se har active product ka `shelf_life_days` aur nutrition values available.
- [ ] Leak trial report: photos, 0% leak, measured packed weight per SKU.
- [ ] Razorpay live activation, Shiprocket pickup verified, WhatsApp templates approved (ya SMS DLT approved fallback) — **P10 go-live se pehle**.

---

## ✅ Definition of Done
Go-live (Phase 10) ke saare business blockers clear hain, saare decisions closed hain, aur product data (shelf life, GST rate, packed weight, label content) real evidence par based hai — guess par nahi.
