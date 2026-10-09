# 🚀 06. Build Roadmap — Summary

> **Single source of truth: [`../Phases/00-phases-master.md`](../Phases/00-phases-master.md).** Yeh file sirf quick overview hai — scope, tasks aur verification checklists phase files me hain.

---

## 🎯 Ground Rule
Hum ek sath saare code ko dump nahi karenge. Har phase ka clear milestone aur verification checklist hai; checklist **evidence ke saath** pass hone par hi agla phase shuru hoga.

---

## 📅 Phases at a Glance

| Phase | Name | One-line Summary |
| :--- | :--- | :--- |
| **0** | Prerequisites & Decisions | FSSAI, GST, Razorpay/Shiprocket KYC, WhatsApp/DLT approvals, shelf-life lab test, open questions (Q-01…Q-07) close — code se pehle, parallel me. |
| **1** | Monorepo, DB & Design Tokens | pnpm + Turborepo, Docker (PG 17 + Redis), dbmate `0001`, `db.ts`, env/logging/CI/test harness, Tailwind v4 tokens. |
| **2** | Auth, RBAC & Sessions | Phone OTP, staff email+password (+TOTP), rotating refresh cookies, `CUSTOMER`/`ADMIN`/`KITCHEN_PARTNER` guards. |
| **3** | Catalog, Batches & Inventory | `0002`, products + batches + stock ledger, sellable shelf-life rule, minimal admin product/batch UI. |
| **4** | Storefront & Cart | Next.js 16 storefront, product pages, Zustand cart + `/cart/quote`, pincode check, legal pages, SEO. |
| **5** | Checkout, Payments & Webhooks | `0003`, DB reservations, Razorpay, `confirmPayment`, idempotent webhooks, sweepers, refunds, invoices. |
| **6** | Logistics & Shiprocket | `0004`, AWB + label pipeline, private R2 labels, pickups, tracking webhook + polling, NDR/RTO basics. |
| **7** | Kitchen Partner Packing Desk | `0005`, mobile PWA, packing queue, label print, mark packed, batch logger, push alerts. |
| **8** | Tracking & Notifications | `/track` timeline, WhatsApp/SMS templates for every transition, notification log. |
| **9** | Admin Operations & Settlements | `0006`, dashboard, orders/ops issues, products/customers/settings, expenses, settlements (D-41). |
| **10** | Hardening & Launch | E2E + concurrency + chaos tests, physical packaging trial, security review, production go-live. |
