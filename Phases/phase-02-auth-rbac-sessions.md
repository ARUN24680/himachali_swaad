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
- [x] Roles: `CUSTOMER`, `ADMIN`, `KITCHEN_PARTNER` (`RoleEnum` in `packages/shared`).
  > Evidence: `packages/shared/src/auth/roles.ts` (`RoleEnum` = DB `user_role`); `packages/shared/tests/schemas.test.ts › mirrors the user_role enum`.
- [x] Access matrix (`packages/shared/src/auth/permissions.ts`) — single place:
  > Evidence: `packages/shared/src/auth/permissions.ts` (`CAPABILITIES`, `can`, `rolesFor`); `packages/shared/tests/auth.test.ts › matches the documented role table`, `› gives ADMIN every capability`.
  | Capability | CUSTOMER | KITCHEN_PARTNER | ADMIN |
  | :--- | :---: | :---: | :---: |
  | Own orders / addresses | ✅ | — | ✅ (all) |
  | Packing queue, mark packed, labels | — | ✅ (own pickup location) | ✅ |
  | Batch create / stock adjust | — | ✅ (own location) | ✅ |
  | Products CRUD, pricing, settings | — | — | ✅ |
  | Cancel / refund, NDR actions | — | — | ✅ |
  | Settlement statements (read + acknowledge, D-40) | — | ✅ | ✅ |
  | Settlement create/finalize/mark paid, revenue dashboard, customer list | — | — | ✅ |
- [x] `KITCHEN_PARTNER` ka scope `user_pickup_locations` se — har partner query me `pickup_location_id = ANY($partnerLocations)` filter.
  > Evidence: JWT `locs` from `user_pickup_locations` (active locations only) + `requirePickupLocationAccess`; `rbac.test.ts › kitchen partner sees only their own pickup location`. Per-query `ANY($locations)` filters arrive with partner queries (Phase 3/7).

### 2.2 Customer Phone OTP (D-18, D-21)
- [x] OTP provider interface: `OtpProvider.send(phone, code)` → `MockOtpProvider` (dev/test: logs + test hook), `Msg91Provider` (**live tabhi jab TRAI DLT template approved — Phase 0**), `WhatsAppOtpProvider` (optional).
  > Evidence: `src/integrations/sms/otp-provider.ts` (`OtpProvider`, `MockOtpProvider` with test hook, `Msg91OtpProvider` stub — live after Phase 0 DLT); env forbids `mock` in production (`env.test.ts`). WhatsApp provider: optional, not built.
- [x] 6-digit OTP via `crypto.randomInt`; Redis me **hash** store (`otp:{phone}` → `{ hash, attempts }`, TTL 5 min).
  > Evidence: `auth.service.ts sendOtp` (randomInt, HMAC hash + attempts in Redis hash, 5 min TTL); `otp.test.ts › stores only a hash of the code, with a 5-minute TTL`.
- [x] Limits: send **3 / 10 min per phone** + per-IP limit; verify **max 5 attempts per OTP** (phir OTP invalidate); constant-time compare.
  > Evidence: `otp.test.ts › limits sends to 3 per phone…`, `› limits sends per IP (10 / 10 min)`, `› invalidates the code after 5 wrong attempts…`; compare via `timingSafeEqual`.
- [x] `POST /api/v1/auth/otp/send` → `{ sent: true, resendAfterSec }` (phone exist kare ya na kare same response — no user enumeration).
  > Evidence: `otp.test.ts › answers identically for registered and unknown phones (no enumeration)`.
- [x] `POST /api/v1/auth/otp/verify` → user upsert (`INSERT ... ON CONFLICT (phone) DO UPDATE SET last_login_at = NOW()`) role `CUSTOMER`, session issue.
  > Evidence: `otp.test.ts › logs a new phone in as CUSTOMER…`; upsert restricted to CUSTOMER/active (D-48) — `› never logs a staff account in through OTP`.
- [ ] **Guest checkout** OTP ke bina allowed hai (phone + address at checkout). Login ke baad, same phone wale guest orders "My Orders" me dikhte hain (`orders.customer_phone` match).
  > ⏳ Guest flow needs `orders` (migration 0003, Phase 5); "My Orders" phone match → Phase 8. OTP login itself is optional and done.

### 2.3 Staff Login (D-19)
- [x] `POST /api/v1/auth/staff/login` — email + password, **bcrypt cost 12**; generic error message ("Invalid email or password"); per-IP + per-email rate limit; `users.is_active = false` → blocked.
  > Evidence: `staff-auth.test.ts › logs staff in…`, `› uses one generic error…`, `› rate-limits 5 attempts per email + IP per 15 minutes`; bcrypt cost 12 (`BCRYPT_COST`), dummy-hash compare for unknown emails.
- [x] **TOTP 2FA** for `ADMIN`: schema ready (`users.totp_secret_enc`), enroll + verify endpoints (`/auth/staff/2fa/setup`, `/auth/staff/2fa/verify`) is phase me banao; **enforcement mandatory Phase 10 se pehle** (feature flag).
  > Evidence: `/auth/staff/2fa/setup` + `/verify` (pending secret in Redis, AES-256-GCM at rest); `staff-auth.test.ts › enrolls, then requires the code at login`, `› is not available to kitchen partners`. Enforcement switch → Phase 10.
- [x] `POST /api/v1/auth/staff/change-password` (old password required, saare refresh tokens revoke).
  > Evidence: `staff-auth.test.ts › needs the current password, revokes every old session and issues a fresh one`.
- [x] Seed script `pnpm db:seed:staff` — first `ADMIN` + first `KITCHEN_PARTNER` (email + temp password from CLI prompt/env, never committed) + `HP-KULLU-01` pickup location + mapping.
  > Evidence: `apps/backend/scripts/seed-staff.ts` — env `SEED_*` or hidden prompt; ran locally twice (created → "already existed — left unchanged").

### 2.4 Sessions & Cookies (D-20)
- [x] **Access token**: JWT (15 min), payload `{ sub: userId, role, locs?: pickupLocationIds }` — **no phone/PII**. Cookie `pk_at`.
  > Evidence: `auth.tokens.ts` (HS256, iss/aud, 15 min); `staff-auth.test.ts › puts no phone or email in the JWT…`.
- [x] **Refresh token**: opaque random 32 bytes, 30 din, cookie `pk_rt` with `Path=/api/v1/auth`. DB me sirf `sha256` hash (`refresh_tokens`).
  > Evidence: `newRefreshToken` (32 bytes) + SHA-256 `token_hash`; cookie path `/api/v1/auth` asserted in `cookies-csrf.test.ts`.
- [x] Cookie flags: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Domain=.pahadikhatki.in` (`COOKIE_DOMAIN` env; localhost me unset).
  > Evidence: `cookies-csrf.test.ts › are HttpOnly; Secure; SameSite=Lax; Domain=.pahadikhatki.in…`; localhost → host-only (`config/auth.ts`).
- [x] `POST /api/v1/auth/refresh` — **rotation**: old token `revoked_at` + `replaced_by_id`, naya same `family_id`. **Reuse detection**: already-revoked token aaya → poori family revoke + security log + `401`.
  > Evidence: `refresh-rotation.test.ts › rotates…`, `› reuse of a rotated token revokes the whole family, returns 401 and is audited`, `› treats a near-simultaneous second refresh (two tabs) as a race` (D-48).
- [x] `POST /api/v1/auth/logout` (current family revoke), `POST /api/v1/auth/logout-all` (user ke saare tokens).
  > Evidence: `refresh-rotation.test.ts › logout revokes the current family…`, `› logout-all revokes every session…`.
- [x] `GET /api/v1/auth/me` → `{ id, role, fullName, phone(masked), pickupLocations }`.
  > Evidence: `rbac.test.ts › GET /auth/me returns the masked user and partner locations`.
- [x] **CSRF defence**: har mutating request (`POST/PUT/PATCH/DELETE`) par `Origin` header `APP_ORIGINS` me hona chahiye, warna `403` (webhooks route exempt — unki apni signature auth hai).
  > Evidence: `src/plugins/csrf.ts`; `cookies-csrf.test.ts` (foreign origin 403, missing Origin 403, GET + webhooks not checked).
- [ ] Daily cleanup job (Phase 5 worker ke saath): expired refresh tokens delete.
  > ⏳ Phase 5 (first worker jobs) — as the phase file says.

### 2.5 Authorization Guards
- [x] `requireAuth` — `pk_at` verify, `req.user` attach; expired → `401 UNAUTHENTICATED` (client refresh karke retry kare).
  > Evidence: `src/middleware/auth.ts`; `rbac.test.ts › … as anonymous → 401`, `› rejects a tampered access token`.
- [x] `requireRole(['ADMIN'])`, `requireRole(['ADMIN', 'KITCHEN_PARTNER'])`.
  > Evidence: `rbac.test.ts › /api/v1/admin/settings as customer|partner → 403, admin → 200`.
- [x] `requirePickupLocationAccess(locationIdFrom(req))` — partner sirf apni location ka data.
  > Evidence: `rbac.test.ts › kitchen partner sees only their own pickup location`, `› admin sees every pickup location; customers none`.
- [x] Violations → `403 FORBIDDEN` envelope.
  > Evidence: `rbac.test.ts` asserts `error.code === 'FORBIDDEN'`.

### 2.6 Audit Log
- [x] `audit(client, { actorId, action, entityType, entityId, before, after, ip })` helper — **same transaction** me jaise mutation.
  > Evidence: `src/modules/audit/audit.service.ts` — called with the transaction client in staff login, password change, 2FA, logout-all, token reuse.
- [x] Is phase me log: staff login success/fail, password change, 2FA enroll, logout-all, token reuse detection.
  > Evidence: `staff-auth.test.ts` audit assertions (SUCCESS, FAILED with reason, PASSWORD_CHANGED, TOTP_ENROLLED), `refresh-rotation.test.ts` (TOKEN_REUSE_DETECTED, LOGOUT_ALL); unknown email stored only as hash tag.

### 2.7 Auth UI
- [x] **Storefront**: OTP login bottom-sheet (mobile) / dialog (desktop) — Radix Dialog, `inputMode="numeric"`, `autocomplete="one-time-code"` (SMS autofill), auto-advance, resend countdown, error states.
  > Evidence: `apps/storefront/src/modules/account/*` + `packages/ui` Dialog (`layout="sheet"`), OtpInput (`one-time-code`, paste, auto-advance); `tests/e2e/otp-login.spec.ts` 18/18 at 375/768/1440; `Phases/evidence/phase-02/storefront-otp-*.png`.
- [x] **Admin portal**: login page (theme tokens only), 2FA step screen, session-expired handling (silent refresh via TanStack Query interceptor; refresh fail → login redirect).
  > Evidence: `apps/admin/src/modules/auth/*`, `services/api/http.ts` (single-flight refresh → retry, `race` retry, fail → `/login?next=`), AuthGuard/RoleGuard; `tests/e2e/auth.spec.ts` 33/33; `Phases/evidence/phase-02/admin-*.png`.
- [x] Client side kabhi token read/store nahi karta (cookies only).
  > Evidence: all fetches `credentials: 'include'`; no `localStorage`/`sessionStorage`/`document.cookie` token access (grep); live smoke: `document.cookie === ""` with httpOnly `pk_at`/`pk_rt` set.

---

## 🚫 Out of Scope
- Saved addresses CRUD (`addresses` table) → **Phase 5** (migration `0003`).
- "My Orders" page → **Phase 8**.
- 2FA enforcement switch-on → **Phase 10**.
- Staff management UI (invite/deactivate) → **Phase 9**.

---

## 🔍 Verification Checklist
- [x] OTP 5 min ke baad expire; 6th wrong attempt par OTP invalid (integration test `otp.test.ts`).
  > Evidence: `otp.test.ts › stores only a hash…5-minute TTL`, `› rejects an expired code`, `› invalidates the code after 5 wrong attempts — the 6th fails even with the right code`.
- [x] 4th OTP send within 10 min → `429 RATE_LIMITED`; per-IP limit bhi enforce.
  > Evidence: `otp.test.ts › limits sends to 3 per phone per 10 minutes (4th → 429)`, `› limits sends per IP (10 / 10 min)`.
- [x] Unknown phone aur known phone ka `otp/send` response identical.
  > Evidence: `otp.test.ts › answers identically for registered and unknown phones`.
- [x] Refresh rotation: old token reuse par poori family revoke + `401` (test `refresh-rotation.test.ts`).
  > Evidence: `refresh-rotation.test.ts › reuse of a rotated token revokes the whole family, returns 401 and is audited`.
- [x] Cookies prod config me `HttpOnly; Secure; SameSite=Lax; Domain=.pahadikhatki.in` (test asserts `Set-Cookie`).
  > Evidence: `cookies-csrf.test.ts › are HttpOnly; Secure; SameSite=Lax; Domain=.pahadikhatki.in with the right paths and lifetimes`.
- [x] Wrong `Origin` par mutating request `403` (test).
  > Evidence: `cookies-csrf.test.ts › blocks a mutating request from a foreign origin`, `› … with no Origin header`.
- [x] `KITCHEN_PARTNER` → ADMIN-only route (`/api/v1/admin/settings`) par `403`; doosri pickup location ka resource `403` (RBAC test matrix).
  > Evidence: `rbac.test.ts` (partner → `/api/v1/admin/settings` 403; other kitchen 403).
- [x] JWT payload me phone/email nahi (unit test decodes token).
  > Evidence: `staff-auth.test.ts › puts no phone or email in the JWT — only id, role and partner locations` (integration, decodes the real token).
- [x] Staff login fail/success + token reuse `admin_audit_log` me rows banate hain.
  > Evidence: `staff-auth.test.ts › logs staff in… and audits success`, `› uses one generic error… and audits each`; `refresh-rotation.test.ts › reuse… is audited`.
- [x] OTP sheet + admin login 375 / 768 / 1440 par pass (Playwright screenshots).
  > Evidence: Playwright admin 33/33 + storefront 18/18 (light + dark); 33 screenshots in `Phases/evidence/phase-02/`.

---

## ✅ Definition of Done
Customers bina login checkout kar sakte hain aur optionally OTP se login kar sakte hain; staff secure cookies se login karte hain; rotation + reuse detection, CSRF origin check, RBAC + location scoping sab automated tests se proven hain.
