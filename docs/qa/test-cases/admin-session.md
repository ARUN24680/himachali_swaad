# Test cases — admin UI: session, idle auto-logout, login page

App `apps/admin` · decisions D-20, D-48, D-57 · audit 2026-11-03 R-4, R-12, M-8. Server side of the idle rule: `backend-auth-session.md` AS-20 … AS-23.
Automated: `pnpm --filter @pk/admin test:e2e -- tests/e2e/idle-logout.spec.ts tests/e2e/auth.spec.ts tests/e2e/admin-phase10.spec.ts` (every test runs at 375 / 768 / 1440; API mocked; idle limit shortened via the DEV-only `localStorage['pk-admin-idle-ms-override']`).
Config: `VITE_ADMIN_IDLE_MINUTES` (integer 1–1440, default 30) — must equal the backend `ADMIN_IDLE_TIMEOUT_MIN`.

| ID | Area | Precondition | Steps | Expected | Automated test (file › name) | Manual? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| ADS-01 | Idle warning (positive) | ADMIN signed in, limit L | Do nothing until L − 60 s | "Still there?" dialog (bottom sheet on phone) with live countdown, limit copy, focus on "Stay signed in", no close (X), Esc / outside click ignored | `idle-logout.spec.ts › ADMIN: warning with countdown → "Stay signed in" resets → expiry lands on /login?reason=idle (light)` · `(dark)` | — |
| ADS-02 | Stay signed in | Warning open | Click "Stay signed in" | Dialog closes, `pk-admin-last-active` updated, page and URL unchanged, fresh window starts | same test | — |
| ADS-03 | Idle expiry | Warning open | Let the countdown reach 0 | Best-effort `POST /auth/logout`, query cache + offline data cleared, `replace` to `/login?reason=idle`, calm info notice "You were signed out after N minutes of inactivity" | same test | — |
| ADS-04 | Sign out now | Warning open | Click "Sign out now" | Same as expiry, immediately | `idle-logout.spec.ts › passive activity (scroll / key) keeps the session alive; the warning ignores stray scrolls once shown` | — |
| ADS-05 | Activity resets (positive) | ADMIN signed in | Press keys / scroll for longer than L | No warning, still signed in (writes throttled to 1/s) | same test | — |
| ADS-06 | Stray scroll while warning (negative) | Warning open | Scroll | Dialog stays — only the explicit button dismisses | same test | — |
| ADS-07 | Multi-tab | Two admin tabs | Activity in tab B only for > L | Tab A never warns (shared `pk-admin-last-active`); both sign out once both go quiet | `idle-logout.spec.ts › one active tab keeps the other admin tabs alive (shared last-activity timestamp)` | — |
| ADS-08 | Server idle_timeout | Refresh answers 401 `details.reason = idle_timeout` | Open `/customers?q=arun` | `/login?reason=idle&next=%2Fcustomers%3Fq%3Darun` with the idle notice | `idle-logout.spec.ts › server-side idle_timeout on refresh lands on /login?reason=idle with the notice (and keeps next)` | — |
| ADS-09 | Plain expiry (negative) | Refresh 401 `expired` | Open `/customers` | `/login?next=%2Fcustomers`, no idle notice | `idle-logout.spec.ts › an ordinary expired session shows no idle notice` | — |
| ADS-10 | Scope: Packing Desk | KITCHEN_PARTNER on `/desk`, override 3 s | Wait 7 s | No dialog, stays on `/desk`, `pk-admin-last-active` never written | `idle-logout.spec.ts › KITCHEN_PARTNER on the Packing Desk never sees the idle warning` | — |
| ADS-11 | Override stripped in prod | `pnpm --filter @pk/admin build` | `grep -r pk-admin-idle-ms-override dist/` | No match (guarded by `import.meta.env.DEV`) | — (build + grep, recorded in the audit report §6) | Yes |
| ADS-12 | Env validation (negative) | `VITE_ADMIN_IDLE_MINUTES=0` / `abc` / `2000` | Start the app | Boot fails with a readable env error; blank → 30 | — (`lib/env.ts` Zod schema) | Yes |
| ADS-13 | Login 2FA line (R-4) | Signed out | Open `/login` | Visible shield line "Admin accounts are protected by two-factor authentication" + "sign-in attempts are limited and logged"; flow unchanged | `auth.spec.ts › signed out → /login; wrong password; TOTP step; home + user menu (light)` (flow) · manual for the copy | Yes (copy) |
| ADS-14 | Regression: refresh + retry | Expired access cookie | Any request | One refresh, original request retried | `auth.spec.ts › expired access cookie: 401 → one refresh → original request retried` | — |
| ADS-15 | Regression: race | Another tab rotated first | Any request | 401 `race` → retried, stays signed in | `auth.spec.ts › refresh race (another tab rotated first) → original request retried, user stays signed in` | — |
| ADS-16 | Regression: single-flight | Many 401s together | Load a page | ONE `/auth/refresh` | `auth.spec.ts › concurrent 401s share ONE refresh (single-flight)` | — |
| ADS-17 | Regression: refresh fails → next | Refresh 401 | Open a deep page, sign in | `/login?next=<path>`, returns there | `auth.spec.ts › refresh fails → /login?next=<path>, and sign-in returns there` | — |
| ADS-18 | Regression: open redirect | — | `/login?next=//evil.example` | Goes home | `auth.spec.ts › open redirect is refused: ?next=//evil.example goes home` | — |
| ADS-19 | Regression: rate-limited login | 429 | Sign in | Wait shown, button disabled | `auth.spec.ts › rate-limited sign-in shows the wait and disables the button` | — |
| ADS-20 | Regression: TOTP enforcement | ADMIN without 2FA | Any admin call → 403 TOTP | `/account` banner → enrol → back | `admin-phase10.spec.ts › ADMIN without 2FA → /account banner → enrol → back where they were (light)` · `› a plain FORBIDDEN (no TOTP reason) never redirects to /account` | — |
