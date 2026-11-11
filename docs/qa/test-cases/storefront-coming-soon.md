# Test cases — storefront: coming-soon teaser + waitlist (audit 2026-11-03 R-5, D-61)

Component `apps/storefront/src/modules/teaser/{components/WaitlistForm.tsx, components/StayInTouch.tsx, hooks/useJoinWaitlist.ts, api/waitlistApi.ts}`. Contract `packages/shared/src/contracts/waitlist.ts` (`POST /api/v1/waitlist` → `{ joined: true, alreadyJoined }`). The spec mocks the endpoint with `page.route`, so it does not need the backend route; backend behaviour is in `backend-waitlist.md`.
Run: `pnpm --filter @pk/storefront test:e2e -- tests/e2e/coming-soon-waitlist.spec.ts`.

| ID | Area | Precondition | Steps | Expected | Automated test (file › name) | Manual? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| CS-01 | Secrecy (D-61) | — | Open `/coming-soon`; read body text, `<title>`, meta description | None of: pickle, chicken, mutton, fish, trout, non-veg; no horizontal overflow | `coming-soon-waitlist.spec.ts › teaser never names the product and has no overflow` | — |
| CS-02 | Join by phone | Mock 200 `alreadyJoined:false` | Type "98765 43210", name "Asha", tick consent, submit | Request body `{ phone: "+919876543210", name: "Asha", consent: true, source: "coming-soon" }`; "You’re on the list." | `coming-soon-waitlist.spec.ts › phone sign-up succeeds and sends a normalised E.164 number with consent` | — |
| CS-03 | Already joined | Mock 200 `alreadyJoined:true` | Submit "Asha@Example.in" | E-mail lower-cased in body; "You’re already on the list." (success, not an error) | `coming-soon-waitlist.spec.ts › e-mail sign-up already on the list shows the friendly "already" state` | — |
| CS-04 | Client validation | — | Submit "12345" without consent | Field error + consent error, focus moves to the first error, **no request sent** | `coming-soon-waitlist.spec.ts › consent is required and invalid contact is caught before any request` | — |
| CS-05 | Rate limited | Mock 429 `details.retryAfterSeconds: 42` | Submit | Warning with a live countdown; submit disabled until it ends | `coming-soon-waitlist.spec.ts › 429 shows a countdown and disables the button` | — |
| CS-06 | Server validation | Mock 400 `VALIDATION_ERROR` | Submit | Server message shown on the field (`role=alert`), no success panel | `coming-soon-waitlist.spec.ts › 400 shows the server message on the field` | — |
| CS-07 | Network failure | Request aborted | Submit | "We could not reach the hills…" error; button becomes "Try again" | `coming-soon-waitlist.spec.ts › network failure offers a retry` | — |
| CS-08 | Channels | `NEXT_PUBLIC_SELLER_WHATSAPP` / `_EMAIL` blank | Open teaser | No "Chat on WhatsApp" / "Write to us" buttons (no dead links) | — | Yes — dev default is blank; verify once with the env set that both appear and the WhatsApp prefill is product-neutral |
| CS-09 | Consent default | — | Load the form | Consent checkbox is never pre-ticked | covered by CS-04 | — |
| CS-10 | Live backend | Backend waitlist route deployed | Join for real on staging | Row in admin → Waitlist | — | Yes |
| CS-11 | Lock | Production build, prod host | Open `/products` on pahadikhatki.in | Product-neutral 404; `/coming-soon` + `POST /api/v1/waitlist` reachable | `proxy` unit tests (infra) | Yes — staging smoke |
