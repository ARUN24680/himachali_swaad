# Key rotation

All secrets live in the host's **secret manager** (never in git; `.env` is local only). Rotate
on a schedule (every 6–12 months), when someone with access leaves, or immediately on a leak.
General order: **create new → deploy new → verify → revoke old.**

| Secret | Where to rotate | Steps | Impact |
| :--- | :--- | :--- | :--- |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay → Settings → API Keys → Regenerate | Generate → update both secrets (API + worker) **and** storefront's public key id → redeploy. Old key stops working immediately on regenerate, so do it in a quiet hour. | Checkouts during the deploy window may fail; pending orders reconcile via the sweeper. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Webhooks → edit → new secret | Set the new secret in the secret manager → deploy API → then save it in Razorpay. Failed deliveries in between are retried by Razorpay; the sweeper reconciles payments anyway. | Short window of 401s (see webhooks-failing.md). Must differ from the key secret (env check). |
| `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` | Shiprocket → API user → change password | Update secret → deploy worker + API. The cached Shiprocket token (Redis) is refreshed on the next 401. | None if done together. |
| `SHIPROCKET_WEBHOOK_TOKEN` | Shiprocket → Webhooks `x-api-key` | Deploy API with the new token, then update it in Shiprocket. `POLL_TRACKING` covers the gap. | Short window of 401s. |
| `WHATSAPP_ACCESS_TOKEN` | Meta Business → System user → generate token | Update → deploy worker. | Messages fail until deployed (retried). |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` | Meta app → Basic settings / Webhook config | Deploy API first, then change at Meta (re-verify webhook). | Status webhooks 401 briefly. |
| `JWT_SECRET` | `openssl rand -base64 48` | Update → deploy API. All **access** tokens (15 min) become invalid; refresh tokens are DB rows, so users are silently re-issued tokens on the next refresh. | Everyone gets one refresh; nobody is logged out. |
| `TOTP_ENC_KEY` | `openssl rand -base64 32` | **Do not rotate casually**: it encrypts admin TOTP secrets. Rotation = admins re-enrol 2FA: set `users.totp_secret_enc = NULL` for ADMINs in the same deploy, then each admin enrols again at first login. | Admins must re-scan the QR code. |
| `REVALIDATE_SECRET` | `openssl rand -hex 32` | Update storefront + API together. | Cache purge fails until both deployed (pages refresh on their ISR timer anyway). |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → API tokens | Create new token (same bucket scope) → deploy API + worker → delete old token. | None. |
| `VAPID_*` | `npx web-push generate-vapid-keys` | Avoid: changing VAPID keys invalidates every partner push subscription — partners must re-enable notifications on the desk. | Push stops until re-subscribed (WhatsApp fallback continues). |
| DB password | Provider console | Create new user/password or rotate → update `DATABASE_URL` → deploy → revoke old. | None with rolling deploy. |

After each rotation: `GET /readyz` 200, place a test order on staging, check Ops → Webhooks, record
the date in the secrets register.
