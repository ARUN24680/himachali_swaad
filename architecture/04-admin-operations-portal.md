# 🖥️ 04. Admin & Kitchen Partner Operations Portal (React 19 + Vite)

---

## 🎯 Architecture Standards
Following the **Project Nexus frontend layout standard**:
* **3-Tier Structure:** Page Header (Title + Actions) → 4-Column KPI Stats Cards → Unified Table Card with Controls Bar & DataTable.
* **Role Scoping (D-17, D-40):**
  * `ADMIN`: Full access — orders, products, inventory, customers, financials, settlements, expenses, settings, audit log, queues.
  * `KITCHEN_PARTNER`: Packing Desk (PWA), batch entry, own-location batch list, **read-only settlement statements + acknowledge**. Live revenue dashboard, customer list, settings, ad controls **nahi**.
* Route guards client side + **API side enforcement** (client guard sirf UX hai).

---

## 🧭 Portal Page Hierarchy (`apps/admin-portal/src/pages/`)

```text
apps/admin-portal/src/pages/
├── auth/Login.tsx                  # Email + password (+ TOTP for ADMIN, D-19)
├── Dashboard.tsx                   # ADMIN: KPIs (to pack, in transit, revenue, ops issues, low stock)
├── Orders/
│   ├── OrdersList.tsx              # ADMIN: master table, status tabs, search (code/phone/AWB)
│   └── OrderDetail.tsx             # ADMIN: items + batch allocations, payments, refunds, shipment,
│                                   #        tracking, notifications, status log, actions
├── OpsIssues.tsx                   # ADMIN: orders with ops_issue (booking failed, amount mismatch, NDR, RTO)
├── PackingDesk/                    # KITCHEN_PARTNER (+ ADMIN) — installable PWA, Hindi/English (D-16)
│   ├── PackingQueue.tsx
│   └── MobileBatchLogger.tsx
├── Inventory/
│   ├── BatchesList.tsx             # Batches, sellable/aging/expired badges, jars left
│   ├── CreateBatchModal.tsx        # Product + quantity + total cost (D-42)
│   └── StockLedger.tsx             # ADMIN: inventory_movements + adjustments (wastage/breakage)
├── Products/
│   ├── ProductsList.tsx            # ADMIN
│   └── ProductEditor.tsx           # ADMIN: pricing (paise), GST, shelf life, dims, images, publish
├── Customers/
│   ├── CustomersList.tsx           # ADMIN
│   └── CustomerDetail.tsx
├── Settlements/
│   ├── SettlementsList.tsx         # ADMIN: generate/finalize/mark paid · PARTNER: read-only
│   └── SettlementDetail.tsx        # Line items, expenses, PDF, partner acknowledge
├── Expenses/ExpensesList.tsx       # ADMIN: ads, packaging, software, compliance
├── Settings/Settings.tsx           # ADMIN: settings table (shipping threshold, TTL, shelf-life buffer…)
├── Staff/StaffList.tsx             # ADMIN: create partner/admin, assign pickup locations
├── AuditLog.tsx                    # ADMIN
└── Queues.tsx                      # ADMIN: bull-board embed
```

---

## 📱 The Kitchen Partner Mobile Experience (`PackingQueue.tsx`)

Partner computer par nahi, phone par kaam karega. Isliye Packing Queue ultra-simple hai:

```
┌────────────────────────────────────────────────────────┐
│  🏔️ Pahadi Khatki - Packing Desk (Himachal)           │
├────────────────────────────────────────────────────────┤
│  ⚡ 4 Jars Waiting to be Packed Today                  │
│                                                        │
│  [ Order #PK-7KQ2M9 ] - 250g Chicken Pickle (Qty: 1)   │
│  Batch: PK-2610-CHK250-01 · Customer: Arun (Chennai)   │
│                                                        │
│  [ ] Jar seal checked   [ ] Shrink band applied        │
│  [ ] Bubble wrap x3     [ ] Weight OK (≤ 500 g)        │
│  [ 🖨️ Print Label (4x6) ]  [ 📲 Share ]  [ A4 x4 ]     │
│                                                        │
│  [ ✅ MARK PACKED & READY FOR PICKUP ]                 │
└────────────────────────────────────────────────────────┘
```

### Features:
1. **Label Print (D-37):** `GET /partner/orders/:orderCode/label` → 5-min signed private URL se 4×6 PDF → browser print / share-sheet / printer companion app. Cyber-cafe ke liye `GET /partner/labels/a4?orders=…` (4 labels per A4). Web Bluetooth direct printing scope me nahi.
2. **Instant Status Transition:** `POST /partner/orders/:orderCode/mark-packed` (Idempotency-Key) → `AWAITING_PACKING → PACKED`, pickup scheduling job enqueue (daily cut-off, D-36).
3. **Push Alerts:** Naya order aate hi PWA push + WhatsApp; subah 9 baje daily digest.
4. **No Tech Complexity:** Partner ko Shiprocket portal me login nahi karna padta. Partner ko sirf first name + city dikhta hai (address label par already printed hai).

---

## 💰 Finance & Settlement Module (D-41)

### Formula (per order, GST-exclusive)
```text
Net = Revenue_ex_GST
      − Raw_Cost          (Σ allocation qty × batch.cost_per_unit_paise)
      − Packaging_Cost    (jars × settings.packaging_cost_per_jar_paise)
      − Actual_Freight    (shipments.freight_paise, billed by Shiprocket)
      − Gateway_Fee       (payments.fee_paise + fee_tax_paise — actual from Razorpay)
      − Refunds
      − RTO_Freight
Cycle Net Profit = Σ order Net − Shared_Expenses (ads, software, compliance… in period)
Partner Share    = floor(Cycle Net × partner_split_bp / 10000)     -- integer paise
Admin Share      = Cycle Net − Partner Share                        -- remainder, no paisa lost
Partner Payout   = Raw Cost Reimbursement + Partner Share
```

### Worked Example — ⚠️ ILLUSTRATIVE ONLY (1 jar, GST rate assumed 5%, pending Q-01)

| Line | Amount |
| :--- | ---: |
| Selling price (MRP incl. GST) | ₹399.00 |
| Revenue ex-GST (399 ÷ 1.05) | ₹380.00 |
| (−) Raw cost reimbursed to partner | ₹120.00 |
| (−) Packaging (jar, cap, shrink, label, box, bubble) | ₹32.00 |
| (−) Actual freight | ₹85.00 |
| (−) Gateway fee 2% + 18% GST = 2.36% of ₹399 | ₹9.42 |
| **(=) Net profit pool** | **₹133.58** |
| Partner share (50%, `floor`) | ₹66.79 |
| Admin share (remainder) | ₹66.79 |
| **Partner payout** (₹120.00 + ₹66.79) | **₹186.79** |

> Purane docs ka ₹184 / ₹186 profit (₹92–₹93 per partner) **overstated** tha — usme GST, packaging, gateway fee ka GST nahi gina gaya tha. Aur shared expenses (Instagram/Meta ads etc.) cycle level par pool ko **aur kam** karenge — e.g. 100 jars ke cycle me ₹5,000 ads = ₹50/jar kam.

### Settlement Workflow
1. ADMIN period choose karta hai → DRAFT generate (sirf `DELIVERED` / `RTO_DELIVERED` / refunded-closed orders jo pehle settle nahi hue).
2. Review → **Finalize** (numbers lock, PDF generate) → partner ko notification.
3. Partner app me statement dekhta hai → **Acknowledge**.
4. Bank transfer ke baad ADMIN **Mark Paid** (bank reference).
* Transparent, read-only statement dono partners ke liye — trust aur clarity.
