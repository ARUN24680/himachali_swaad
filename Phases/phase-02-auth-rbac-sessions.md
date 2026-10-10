# 🔐 Phase 2: Auth, RBAC & Sessions

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 1  ·  **Migration:** — (uses `users`, `refresh_tokens`, `user_pickup_locations`, `admin_audit_log` from `0001`)

---

## 🎯 Objective
Customers ke liye **optional** phone-OTP login (guest checkout allowed — D-18), staff (`ADMIN`, `KITCHEN_PARTNER`) ke liye email + password login, httpOnly-cookie sessions with **rotating refresh tokens + reuse detection** (D-20), aur role + location-scoped authorization guards. Har staff mutation audit log me.

---

## 📋 Granular Tasks & Checklist

### 2.1 Roles & Access Model (D-17)
- [ ] Roles: `CUSTOMER`, `ADMIN`, `KITCHEN_PARTNER` (`RoleEnum` in `packages/shared`).
- [ ] Access matrix (`packages/shared/src/auth/permissions.ts`) — single place:
  | Capability | CUSTOMER | KITCHEN_PARTNER | ADMIN |
  | :--- | :---: | :---: | :---: |
  | Own orders / addresses | ✅ | — | ✅ (all) |
  | Packing queue, mark packed, labels | — | ✅ (own pickup location) | ✅ |
  | Batch create / stock adjust | — | ✅ (own location) | ✅ |
  | Products CRUD, pricing, settings | — | — | ✅ |
  | Cancel / refund, NDR actions | — | — | ✅ |
  | Settlement statements (read + acknowledge, D-40) | — | ✅ | ✅ |
  | Settlement create/finalize/mark paid, revenue dashboard, customer list | — | — | ✅ |
- [ ] `KITCHEN_PARTNER` ka scope `user_pickup_locations` se — har partner query me `pickup_location_id = ANY($partnerLocations)` filter.

### 2.2 Customer Phone OTP (D-18, D-21)
- [ ] OTP provider interface: `OtpProvider.send(phone, code)` → `MockOtpProvider` (dev/test: logs + test hook), `Msg91Provider` (**live tabhi jab TRAI DLT template approved — Phase 0**), `WhatsAppOtpProvider` (optional).
- [ ] 6-digit OTP via `crypto.randomInt`; Redis me **hash** store (`otp:{phone}` → `{ hash, attempts }`, TTL 5 min).
- [ ] Limits: send **3 / 10 min per phone** + per-IP limit; verify **max 5 attempts per OTP** (phir OTP invalidate); constant-time compare.
- [ ] `POST /api/v1/auth/otp/send` → `{ sent: true, resendAfterSec }` (phone exist kare ya na kare same response — no user enumeration).
- [ ] `POST /api/v1/auth/otp/verify` → user upsert (`INSERT ... ON CONFLICT (phone) DO UPDATE SET last_login_at = NOW()`) role `CUSTOMER`, session issue.
- [ ] **Guest checkout** OTP ke bina allowed hai (phone + address at checkout). Login ke baad, same phone wale guest orders "My Orders" me dikhte hain (`orders.customer_phone` match).

### 2.3 Staff Login (D-19)
- [ ] `POST /api/v1/auth/staff/login` — email + password, **bcrypt cost 12**; generic error message ("Invalid email or password"); per-IP + per-email rate limit; `users.is_active = false` → blocked.
- [ ] **TOTP 2FA** for `ADMIN`: schema ready (`users.totp_secret_enc`), enroll + verify endpoints (`/auth/staff/2fa/setup`, `/auth/staff/2fa/verify`) is phase me banao; **enforcement mandatory Phase 10 se pehle** (feature flag).
- [ ] `POST /api/v1/auth/staff/change-password` (old password required, saare refresh tokens revoke).
- [ ] Seed script `pnpm db:seed:staff` — first `ADMIN` + first `KITCHEN_PARTNER` (email + temp password from CLI prompt/env, never committed) + `HP-KULLU-01` pickup location + mapping.

### 2.4 Sessions & Cookies (D-20)
- [ ] **Access token**: JWT (15 min), payload `{ sub: userId, role, locs?: pickupLocationIds }` — **no phone/PII**. Cookie `pk_at`.
- [ ] **Refresh token**: opaque random 32 bytes, 30 din, cookie `pk_rt` with `Path=/api/v1/auth`. DB me sirf `sha256` hash (`refresh_tokens`).
- [ ] Cookie flags: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Domain=.pahadikhatki.in` (`COOKIE_DOMAIN` env; localhost me unset).
- [ ] `POST /api/v1/auth/refresh` — **rotation**: old token `revoked_at` + `replaced_by_id`, naya same `family_id`. **Reuse detection**: already-revoked token aaya → poori family revoke + security log + `401`.
- [ ] `POST /api/v1/auth/logout` (current family revoke), `POST /api/v1/auth/logout-all` (user ke saare tokens).
- [ ] `GET /api/v1/auth/me` → `{ id, role, fullName, phone(masked), pickupLocations }`.
- [ ] **CSRF defence**: har mutating request (`POST/PUT/PATCH/DELETE`) par `Origin` header `APP_ORIGINS` me hona chahiye, warna `403` (webhooks route exempt — unki apni signature auth hai).
- [ ] Daily cleanup job (Phase 5 worker ke saath): expired refresh tokens delete.

### 2.5 Authorization Guards
- [ ] `requireAuth` — `pk_at` verify, `req.user` attach; expired → `401 UNAUTHENTICATED` (client refresh karke retry kare).
- [ ] `requireRole(['ADMIN'])`, `requireRole(['ADMIN', 'KITCHEN_PARTNER'])`.
- [ ] `requirePickupLocationAccess(locationIdFrom(req))` — partner sirf apni location ka data.
- [ ] Violations → `403 FORBIDDEN` envelope.

### 2.6 Audit Log
- [ ] `audit(client, { actorId, action, entityType, entityId, before, after, ip })` helper — **same transaction** me jaise mutation.
- [ ] Is phase me log: staff login success/fail, password change, 2FA enroll, logout-all, token reuse detection.

### 2.7 Auth UI
- [ ] **Storefront**: OTP login bottom-sheet (mobile) / dialog (desktop) — Radix Dialog, `inputMode="numeric"`, `autocomplete="one-time-code"` (SMS autofill), auto-advance, resend countdown, error states.
- [ ] **Admin portal**: login page (theme tokens only), 2FA step screen, session-expired handling (silent refresh via TanStack Query interceptor; refresh fail → login redirect).
- [ ] Client side kabhi token read/store nahi karta (cookies only).

---

## 🚫 Out of Scope
- Saved addresses CRUD (`addresses` table) → **Phase 5** (migration `0003`).
- "My Orders" page → **Phase 8**.
- 2FA enforcement switch-on → **Phase 10**.
- Staff management UI (invite/deactivate) → **Phase 9**.

---

## 🔍 Verification Checklist
- [ ] OTP 5 min ke baad expire; 6th wrong attempt par OTP invalid (integration test `otp.test.ts`).
- [ ] 4th OTP send within 10 min → `429 RATE_LIMITED`; per-IP limit bhi enforce.
- [ ] Unknown phone aur known phone ka `otp/send` response identical.
- [ ] Refresh rotation: old token reuse par poori family revoke + `401` (test `refresh-rotation.test.ts`).
- [ ] Cookies prod config me `HttpOnly; Secure; SameSite=Lax; Domain=.pahadikhatki.in` (test asserts `Set-Cookie`).
- [ ] Wrong `Origin` par mutating request `403` (test).
- [ ] `KITCHEN_PARTNER` → ADMIN-only route (`/api/v1/admin/settings`) par `403`; doosri pickup location ka resource `403` (RBAC test matrix).
- [ ] JWT payload me phone/email nahi (unit test decodes token).
- [ ] Staff login fail/success + token reuse `admin_audit_log` me rows banate hain.
- [ ] OTP sheet + admin login 375 / 768 / 1440 par pass (Playwright screenshots).

---

## ✅ Definition of Done
Customers bina login checkout kar sakte hain aur optionally OTP se login kar sakte hain; staff secure cookies se login karte hain; rotation + reuse detection, CSRF origin check, RBAC + location scoping sab automated tests se proven hain.
