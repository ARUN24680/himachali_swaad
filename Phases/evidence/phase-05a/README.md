# Phase 5A evidence: Direct UPI pay page (`apps/payment/web`)

Screenshots were taken from the **production build** (`apps/payment/dist/web`). It was served with the payment service's exact CSP header, and `GET /pay/api/orders/:id` was mocked. Viewports were 375 (mobile, touch), 768 (tablet, touch) and 1440 (desktop), with Playwright `colorScheme` set to light or dark.

- Main states: `pay-{created,paid,timeup}-{375,768,1440}-{light,dark}.png` (18 files).
- Extra states: `pay-{timeupfinal,expired,lowtime,nodiscount,notfound,ratelimit,error,slow}-{375-light,1440-dark}.png`. `slow` is the loading skeleton.

The harness checked these automatically (all passed):
- No CSP violations and no page errors. The only console errors were the mocked 404/429/500 responses.
- No horizontal overflow at any viewport.
- Every visible link or button at 375 is at least 44 × 44 px. There are 0 `[style]` attributes.
- Polling ran 3 calls in 7.5 s while `created`, and 1 call (then stopped) when `expired`.
- The `paid` state auto-redirected to `returnUrl` within 3 s.
- The "Open UPI app" `href` equals `upiUri`.

## Design deviation note (Rules §1.5)
There is no Stitch screen for this page. It is designed from the "Himalayan Pantry" tokens in `@pk/ui` (Playfair headings, Inter amounts, ivory and pine-night canvas, gold primary CTA).

- **Order of elements depends on the device.** On a phone the order is amount, then status and "Open UPI app" (gold primary, full width), then QR ("Or scan from another phone"), then payee. From `md` up, the QR becomes the left-hand hero ("Scan to pay") and the intent button steps down to an outline button. A phone can't scan its own screen, and a desktop usually has no UPI app.
- **QR sits in a forced-light frame** (the `.light` token scope) so it still scans in dark mode, without any hard-coded white.
- **Exact amount comes first.** It has a copy button that copies plain `499.37` for pasting into UPI apps, plus an "exact amount, paise included" note. When `payablePaise < amountPaise`, the note also explains the discount.
- **Countdown chip** reads "Jars reserved mm:ss" and turns to the warning tone under 2 minutes. It is corrected for the server clock using the envelope `timestamp`. Screen readers get a minutes/seconds text, not per-second announcements.
- **Anti-phishing hint:** "Your UPI app should show Pahadi Khatki as the payee. We will never ask for your UPI PIN."
- **Time-up, paid, expired and error states** use one centred state card. It shows order code + amount so the customer can compare with their UPI app. Once time is up the QR and intent are hidden.
- **Theme** follows the system, with a manual toggle remembered in `localStorage` (D-14). It is applied from the bundle because the CSP forbids inline scripts.
