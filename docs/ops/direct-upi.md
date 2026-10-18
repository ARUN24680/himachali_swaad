# Direct UPI on AWS (D-59, D-60)

Service: `apps/payment` (README there for the design and CLI). This page is the AWS setup.
Region `ap-south-1` unless noted.

## 1. Database
- Same RDS instance as the store, **separate database** `pk_payment` and **separate user**
  `pk_payment` (owner of that database only, no rights on the store database).
- Migrations: run `dbmate --migrations-dir migrations up` from the image (one-off ECS task) on
  each deploy. `PAYMENT_DB_SSL=true` (required in production).

## 2. ECS service
- Image from `docker/Dockerfile.payment` (non-root, healthcheck `/readyz`). 1 task is enough;
  2 is safe (outbox + sweepers use `SKIP LOCKED`).
- ALB host rule `pay.pahadikhatki.in` → target group port 4100, health check `/readyz`.
  `PAYMENT_TRUST_PROXY=true`. WAF rate rule on `/pay/*` and `/v1/*`.
- Optional hardening: restrict `/v1/orders*` and `/v1/payments*` to the store tasks' security
  group (internal ALB listener); `/v1/inbound/ses` and `/v1/observer/*` must stay public.
- Secrets (Secrets Manager → task env): `PAYMENT_API_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`,
  `UPI_DEVICE_KEK`, `PAYMENT_DATABASE_URL`. Generate with `openssl rand -hex 32` /
  `openssl rand -base64 32`. The store gets the same key id/secret/webhook secret as
  `DIRECT_UPI_KEY_ID/_KEY_SECRET/_WEBHOOK_SECRET`.
- Store backend: `PAYMENT_GATEWAY=direct_upi`, `DIRECT_UPI_API_URL=https://pay.pahadikhatki.in/v1`,
  `DIRECT_UPI_PUBLIC_URL=https://pay.pahadikhatki.in`. Service: `PAYMENT_WEBHOOK_URL=https://api.pahadikhatki.in/api/v1/webhooks/razorpay`.
- Admin CLI: `aws ecs execute-command … --command "node dist/admin.js refunds:list --by Arun"`.
  Only the people allowed `ecs:ExecuteCommand` can run it — that IAM permission *is* the admin login.

## 3. Bank alert e-mails (channel 1, primary)
1. **Check SES inbound is offered in your region** (it has historically been limited to a few
   regions). If ap-south-1 lacks it, use the nearest supported region for SES + SNS only — the
   rest of the stack stays in Mumbai.
2. SES → verify domain `in.pahadikhatki.in`; add its **MX** record
   (`inbound-smtp.<region>.amazonaws.com`).
3. SNS topic `pk-upi-alerts`, attribute **`SignatureVersion=2`**. Subscription: HTTPS
   `https://pay.pahadikhatki.in/v1/inbound/ses` (the service confirms it automatically).
4. SES receipt rule: recipient `upi-alerts@in.pahadikhatki.in` → action **SNS**, topic
   `pk-upi-alerts`, encoding **Base64**; enable spam/virus scanning.
5. Service env: `UPI_ALERT_SNS_TOPIC_ARN`, `UPI_ALERT_EMAIL_RECIPIENT=upi-alerts@in.pahadikhatki.in`,
   `UPI_BANK_EMAIL_DOMAINS=<your bank's DKIM domain>`.
6. In the bank account: enable e-mail alerts for credits to the Gmail inbox; in Gmail add
   `upi-alerts@in.pahadikhatki.in` as forwarding address and a filter *from your bank's alert
   address* → forward.
7. **Go-live spike (mandatory):** send ₹1 to the VPA, then `alerts:list`. It must show the alert
   (not `DKIM_NOT_BANK`) with the right amount + UTR. If the bank's DKIM breaks on forwarding or
   the text is not parsed, add the bank's real alert as a fixture to `tests/unit/parse.test.ts`
   and fix before launch.

## 4. Android observer (channel 2, backup)
- `UPI_DEVICE_KEK` + `UPI_BANK_SMS_SENDERS` (e.g. `HDFCBK`). Enrol: `devices:enroll "Shop phone"`
  → enter the id + secret in the app. Lost phone: `devices:revoke <id>`.
- The observer **app itself is not built yet** — the API contract is fixed:
  `POST /v1/observer/alerts` body `{sender, text, receivedAt}`; headers `X-Device-Id`,
  `X-Timestamp` (epoch ms), `X-Nonce` (16–64 `[A-Za-z0-9_-]`),
  `X-Signature = hex(HMAC_SHA256(secret, "<ts>.<nonce>.<raw body>"))`; heartbeat
  `POST /v1/observer/heartbeat` (empty body, same headers) every 5 min.

## 5. Alarms (CloudWatch metric filters on the service log group)
| Log message | Meaning | Action |
| :-- | :-- | :-- |
| `credit alert needs admin review` | money arrived that could not be matched | `alerts:list` → link / dismiss |
| `UPI refunds waiting for an admin payout` | store cancelled a paid order | pay back, `refunds:complete` |
| `webhook to store gave up` | store unreachable for ~a day | check backend; the store's sweeper also polls |
| `UPI observer device silent` | phone off / app killed | check the phone |
| `SNS message rejected` (warn) | forged or misconfigured SNS | check topic / subscription |

## 6. Cost (indicative, small launch)
One extra Fargate task (0.25 vCPU / 0.5 GB) ≈ $9–10/month; SES inbound $0.10 per 1,000 mails;
SNS HTTPS deliveries ~free at this volume; no extra RDS instance. Gateway fee: ₹0
(the 0–99 paise offset is booked as the "fee" in settlements).
