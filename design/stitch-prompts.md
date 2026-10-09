# 🎨 Pahadi Khatki — Stitch / Figma Design Prompts

> **Kaise use karein:** Ek-ek karke bhejo. Order: Master → Design System → 1 → 2 → … → 10D.
> Har screen ke baad check karo (mobile + desktop frames, same colors/buttons), phir agla prompt.
> Agar tool style bhoolne lage, toh Master prompt dobara paste karke us screen ka prompt do.

---

## 0. Master Prompt (sabse pehle)

```text
Design a premium, mobile-first e-commerce brand called "Pahadi Khatki" — a direct-to-consumer brand selling authentic Himachali NON-VEG PICKLES (Chicken, Mutton, Himalayan Trout Fish) in small handcrafted batches, made in a village kitchen in Kullu Valley, Himachal Pradesh, India, and shipped across India.

BRAND FEELING
- "Deep mountain mood meets premium artisanal craft." Earthy, warm, organic, trustworthy, slightly luxurious — like a boutique Himalayan food label, NOT a generic grocery app.
- Storytelling: snow-capped Himalayan peaks, morning fog, pine forests, wooden kath-kuni village houses, glass jars glowing in golden sunlight, mustard oil, red chillies, brass utensils.
- Key promises: 100% pure mustard oil, no preservatives, sun-cured, small batches, every jar traceable to its batch (e.g. "Batch PK-2610-CHK250-01 · Bottled 04 Oct in Kullu Valley").

COLOR SYSTEM (use consistently on every screen)
Light mode:
- Background: Warm Cream #F8F5EF
- Surface / cards: #FFFFFF with soft border #E5DED2
- Secondary surface: Sandstone #EAE3D2
- Primary CTA: Mountain Gold #D4A359 (hover slightly darker), text on gold: #FFFFFF or deep pine
- Text: Deep Charcoal #211D1A, muted text #7A716A
- Accent: Terracotta #B5603A (small highlights only)
Dark mode:
- Background: Dark Forest Pine #121A16, cards #18231E, borders #26332D
- Primary: Radiant Gold #E0A84E with dark text #121A16
- Text: Off-white cream #F5F1E8, muted #A8A196
Status colors: Success green #2E8B57, Warning amber #D98E1C, Info blue #2F7FB5, Error red #D33A2C.
Non-veg symbol: the official Indian FSSAI non-veg mark — brown square outline with a filled brown circle (#723A1D). It must appear on every product card and product page.

TYPOGRAPHY
- Headings: elegant serif (Playfair Display), generous size, tight leading.
- Body/UI: Inter, 16px base on mobile, clean and highly readable.
- Prices in a bold sans with the ₹ symbol (e.g. ₹399, strike-through ₹449, "11% off" badge).

COMPONENT STYLE (make these a reusable design system)
- Corner radius 12px on cards, buttons and inputs.
- Buttons: Primary (gold filled), Secondary (sandstone filled), Outline, Ghost, Destructive; sizes S/M/L; minimum touch target 44px.
- Inputs, Select, Textarea, Phone input with +91 prefix, 6-digit Pincode input, 6-box OTP input, Quantity stepper (− 1 +) — all with identical height, border and focus ring (gold ring), with error and disabled states.
- Cards with subtle shadow, thin warm border, lots of whitespace.
- Status badges as soft pills (tinted background + colored text).
- Skeleton loaders, empty states with small mountain line illustrations, toasts.
- Icons: thin outline style (Lucide-like).

UX PRINCIPLES
- Mobile first: 80% of customers are on phones. Sticky bottom "Add to Cart / Buy Now" bar on mobile, bottom-sheet cart drawer, thumb-reachable actions, no horizontal scrolling.
- Desktop: wide editorial layouts, large photography, multi-column storytelling.
- Fast and friction-free checkout (UPI first: Google Pay / PhonePe), clear delivery estimates, visible trust signals (FSSAI licence, no preservatives, secure payment, leak-proof packaging).
- Accessible contrast, clear hierarchy, friendly microcopy with light Indian warmth ("Namaste!", "Taste the Mountains").

Produce every screen in two frames: Mobile (390 × 844) and Desktop (1440 wide). Keep the same design system across all screens.
```

---

## 0.1 Design System Page

```text
Start with the Design System page only (no other screens yet).
Show: color palette (light + dark mode), typography scale (Playfair Display headings, Inter body), buttons (Primary, Secondary, Outline, Ghost, Destructive in S/M/L + hover/disabled/loading states), inputs (text, select, textarea, +91 phone, 6-digit pincode, 6-box OTP, quantity stepper) with default/focus/error/disabled states, cards, status badges (Confirmed, Packed, In Transit, Delivered, Cancelled), the FSSAI non-veg mark, toast, skeleton loader and empty state.
Create it in both Mobile (390px) and Desktop (1440px) frames.
```

---

## 1. Home Page

```text
Using the Pahadi Khatki design system above, design:

1) HOME PAGE: Full-bleed hero with misty Himalayan peaks and a glowing pickle jar, serif headline "Authentic Non-Veg Pickles, Matured Under the Himalayan Sun", subtext, gold CTA "Taste the Mountains", small live badge "Current batch bottled 04 Oct in Kullu Valley · Only 34 of 100 jars left". Then: "3 Pillars of Purity" (Pure Mustard Oil · Traditional Kath-Kuni Kitchen & Sun Curing · Small-Batch Handcrafted Cuts) with icons; product showcase (3 cards: Chicken, Mutton, Himalayan Trout Fish — each with non-veg mark, price, Add to Cart); "From Our Village to Your Table" origin story with photos; how-we-pack-leak-proof section (4 layers: headspace, foam-sealed cap, heat-shrink band, bubble-wrapped box); customer reviews; Instagram strip; FAQ teaser; rich footer with FSSAI licence no., policies, contact, WhatsApp.

Header: logo, nav (Shop, Our Story, Track Order), cart icon with count; on mobile a hamburger menu and a sticky bottom bar with "Shop Now".
Create it in both Mobile (390px) and Desktop (1440px) frames, strictly using the same colors, fonts, buttons and cards from the design system.
```

---

## 2. Product Listing

```text
Using the Pahadi Khatki design system above (same header, footer, colors, fonts, buttons and cards as the Home page), design:

2) PRODUCT LISTING PAGE ("Shop"):
- Page header: serif title "Our Pickles", subtitle "Small-batch, sun-cured, bottled in Kullu Valley", breadcrumb (Home / Shop).
- Filter chips: All, Chicken, Mutton, Fish (selected chip in gold); sort dropdown (Popular, Price: Low to High, Price: High to Low, Newest Batch). On mobile, filters in a horizontally-wrapping chip row and sort inside a bottom sheet — no horizontal page scroll.
- Product cards (6 products: Himachali Chicken Pickle, Pahadi Mutton Pickle, Himalayan Trout Fish Pickle — each in 250g and 500g via a toggle on the card): jar photo, FSSAI non-veg mark (brown square + circle), product name, one-line tasting note, spice level (1–5 chilli icons), weight toggle 250g / 500g, price + strike-through compare price + "% off" badge, stock badge ("Only 6 jars left" in amber / "Sold out — next batch bottling" in muted style with disabled button), "Add to Cart" button with a small "Added ✓" state.
- Show one card in each state: normal, low stock, sold out.
- A trust strip below the grid: 100% Pure Mustard Oil · No Preservatives · Leak-proof Packing · Pan-India Delivery.
- Empty state for when a filter has no products (small mountain illustration + "No pickles here yet — new batch coming soon").

Layout: Mobile 1 column with full-width cards, Tablet 2 columns, Desktop 3 columns with hover zoom on jar photos.
Create Mobile (390px) and Desktop (1440px) frames.
```

---

## 3. Product Detail

```text
Using the Pahadi Khatki design system above (same header, footer, colors, fonts, buttons and cards as the Home and Shop pages), design:

3) PRODUCT DETAIL PAGE for "Himachali Chicken Pickle":
- Breadcrumb: Home / Shop / Chicken Pickle.
- Image gallery: large main jar photo + thumbnails (jar front, close-up texture of pickle in mustard oil, ingredients flat-lay with red chillies and garlic, jar on a wooden table in a Himachal kitchen). Swipeable carousel with dots on mobile.
- Info panel: FSSAI non-veg mark, serif title, short tagline "Slow-cooked chicken in pure mustard oil & Pahadi spices", star rating (4.8 · 126 reviews), spice level (4/5 chillies), price ₹399 with strike-through ₹449 and "11% off" badge, "Inclusive of all taxes".
- Weight selector as two large option cards: 250g (₹399) / 500g (₹749).
- Quantity stepper (− 1 +), "Add to Cart" (gold) and "Buy Now" (outline) buttons. On mobile these sit in a sticky bottom bar showing price + Add to Cart.
- Stock note: "Only 8 jars left in batch PK-2610-CHK250-01".
- Pincode checker: 6-digit input + "Check" button, with result states — success "Delivery by Mon, 14 Oct (3–4 days)" in green, and error "Sorry, we don't deliver here yet" in red.
- Trust row with icons: Pure Mustard Oil · No Preservatives · Leak-proof Packing · Secure UPI Payment.
- Accordion / tabs: Tasting Notes · Ingredients · Nutrition (per 100g table: energy, protein, fat, carbs, sugar, sodium) · Shelf Life & Storage ("Best before 4 months from bottling. Always use a dry spoon. Keep in a cool, dry place.") · Batch Info (batch code, bottled on 04 Oct 2026 in Kullu Valley, best before date) · FSSAI & Manufacturer details.
- Reviews section: rating summary bars + 3 review cards with name, city, verified badge.
- "You may also like": 3 product cards (same card style as the Shop page).

Layout: Desktop — gallery left (sticky on scroll), info right, details full-width below. Mobile — gallery on top, info stacked, sticky bottom Add-to-Cart bar.
Create Mobile (390px) and Desktop (1440px) frames.
```

---

## 4. Cart Drawer

```text
Using the Pahadi Khatki design system above (same colors, fonts, buttons, inputs and cards as previous screens), design:

4) CART DRAWER (opens over the current page, page behind is dimmed):
- Desktop: slides in from the right, 440px wide, full height. Mobile: bottom sheet covering ~90% of the screen with a drag handle and rounded top corners.
- Header: "Your Cart (2)" + close (X) button.
- Free-delivery progress bar at top: "Add ₹151 more to unlock FREE delivery 🚚" with a gold progress bar; unlocked state: "Yay! You've unlocked FREE delivery 🎉" in green.
- Cart item rows: jar thumbnail, FSSAI non-veg mark, product name, weight (250g), unit price, quantity stepper (− 1 +), line total, remove (trash icon). Example items: Himachali Chicken Pickle 250g ₹399 × 1, Pahadi Mutton Pickle 250g ₹449 × 1.
- Item warning states: one row showing "Only 2 jars left — quantity updated" (amber), and one showing "Price updated to ₹419" (info blue) — because the cart is re-checked with the server.
- "Remove" undo toast at the bottom: "Removed Trout Fish Pickle · Undo".
- Small upsell row: "Complete your pahadi platter" with 1–2 mini product cards and "+ Add" buttons.
- Footer (sticky at the bottom of the drawer): Subtotal ₹848, "Shipping calculated at checkout", note "Jars are reserved for 15 minutes once you start checkout", big gold "Checkout →" button, and a "Continue shopping" text link. Trust line: "Secure UPI payment · Leak-proof packing".
- Empty cart state: small mountain-and-jar illustration, "Your cart is as empty as a mountain morning", gold button "Explore Pickles".

Show these frames: (a) filled cart below free-delivery threshold, (b) free delivery unlocked, (c) cart with warning rows + undo toast, (d) empty cart.
Create Mobile (390px) and Desktop (1440px) versions.
```

---

## 5. Checkout

```text
Using the Pahadi Khatki design system above (same colors, fonts, buttons, inputs and cards as previous screens), design:

5) CHECKOUT PAGE (single page, distraction-free — minimal header with only the logo, "Secure Checkout 🔒" and a back-to-cart link; no full navigation, no footer links except policies):

Left column (Desktop) / top-to-bottom (Mobile):
- Small text link: "Already ordered with us? Login with OTP" (optional — guest checkout is the default).
- Section 1 "Contact": Full name, Phone with fixed +91 prefix (10 digits), Email (optional).
- Section 2 "Delivery Address": Pincode FIRST (6-digit) → auto-fills City and State (show filled state with a small "Auto-filled" hint) + delivery estimate chip "Delivery by Mon, 14 Oct"; then House/Flat & Street (line 1), Area / Locality (line 2, optional), Landmark (optional). Checkbox "Save this address for next time" (only when logged in).
- Checkbox (UNCHECKED by default): "Send me order updates on WhatsApp".
- Section 3 "Payment": Prepaid only. Large selectable card "UPI — Google Pay / PhonePe / Paytm" marked "Recommended", plus "Cards / Net Banking". Small note: "Cash on Delivery is not available for perishable small-batch orders."

Right column (Desktop, sticky) / collapsible "Order summary ₹927 ▾" bar at the top on Mobile:
- Items with thumbnails, weight, quantity (Chicken Pickle 250g × 1 ₹399, Mutton Pickle 250g × 1 ₹449).
- Subtotal ₹848, Shipping ₹79, Total ₹927 (inclusive of all taxes).
- Reservation timer card: "⏱ Your jars are reserved for 14:32" (gold), with an expired variant: "Reservation expired — we'll re-check stock" (amber) + "Refresh" button.
- Trust badges: Secure payments by Razorpay · FSSAI licensed kitchen · Leak-proof packing.
- Big gold button "Pay ₹927 securely" (sticky at the bottom on Mobile), with policy line: "By placing this order you agree to our Terms, Refund & Shipping policies."

Also show these states:
(a) Validation errors: invalid phone, missing address line, field-level red error messages.
(b) Pincode not serviceable: red message "Sorry, we don't deliver to 799001 yet" and the Pay button disabled.
(c) Payment processing overlay: "Confirming your payment… please don't close this page" with a spinner.
(d) Payment failed: "Payment didn't go through. No money was deducted. Try again" with a Retry button (reservation timer still visible).

Create Mobile (390px) and Desktop (1440px) frames.
```

---

## 6. Order Confirmation + Tracking

```text
Using the Pahadi Khatki design system above (same colors, fonts, buttons, inputs, cards and status badges as previous screens), design:

6A) ORDER CONFIRMATION PAGE (after payment):
- Elegant celebration: a glowing jar + mountain illustration, subtle confetti, serif headline "Namaste Arun, your order is confirmed!", order code "PK-7KQ2M9" in a copyable pill.
- Message: "We're packing your jars fresh in our Himachal kitchen. You'll get updates on WhatsApp."
- Order summary card: items with thumbnails, quantities, total paid ₹927 via UPI, delivery address, estimated delivery "Mon, 14 Oct".
- "What happens next" mini-stepper: Confirmed ✓ → Packed in Kullu → Picked up by courier → Delivered.
- Buttons: gold "Track my order", outline "Continue shopping", and a small "Download invoice" link.
- Also show these states:
  (a) "Confirming your payment…" — loading state with a spinner while the payment is being verified.
  (b) Rare stock issue — "Sorry, your jars sold out while the payment was processing. A full refund of ₹927 has been started and will reach your account in 5–7 working days." (calm amber tone, apologetic, with a "Notify me for the next batch" button).

6B) TRACK ORDER PAGE (/track):
- Search card: "Track your order" with two fields — Order code (PK-XXXXXX) and Phone (+91) — and a gold "Track" button. Small helper: "Find your order code in your WhatsApp or SMS confirmation." Error state: "We couldn't find an order with these details."
- Result view:
  - Top summary card: order code, status badge "In Transit", courier "Delhivery", AWB number with copy icon, ETA card "Arriving by Mon, 14 Oct".
  - Vertical timeline (current step highlighted in gold, completed steps with a green check, future steps muted):
    🏔️ Bottled in Himachal — Batch PK-2610-CHK250-01, 04 Oct
    📦 Packed & sealed (leak-proof) — 09 Oct, 10:42 AM
    🚚 Picked up by Delhivery — 09 Oct, 4:15 PM
    📍 In transit — Reached Delhi hub, 10 Oct
    🛵 Out for delivery
    🏡 Delivered
  - Exception variants: "Delivery attempt failed — customer unavailable. We'll try again tomorrow." (amber badge) and "Delivered 🎉" final state with a "Rate your pickle" button.
  - Help card: "Need help with your parcel? Chat with us on WhatsApp" button.
- Privacy: show only the customer's first name and city, never the full address or phone.

Create Mobile (390px) and Desktop (1440px) frames for both 6A and 6B.
```

---

## 7. Login + My Account

```text
Using the Pahadi Khatki design system above (same colors, fonts, buttons, inputs, cards and status badges as previous screens), design:

7A) OTP LOGIN (opens as a bottom sheet on Mobile, centered modal on Desktop):
- Step 1: Title "Login or Sign up", subtitle "We'll send a 6-digit code to your phone". Phone input with fixed +91 prefix, gold "Send OTP" button, small text "By continuing you agree to our Terms & Privacy Policy".
- Step 2: "Enter the code sent to +91 98765 43210" with an "Edit" link, 6 separate OTP boxes (auto-advance, the active box has a gold focus ring), "Resend OTP in 00:28" countdown → then a "Resend OTP" link, gold "Verify & Continue" button.
- States: wrong OTP ("Incorrect code. 3 attempts left" in red with the boxes shaking), too many attempts ("Too many tries. Please wait 10 minutes"), and loading on the button.
- Note: login is optional — guests can still checkout.

7B) MY ACCOUNT (logged-in customer):
- Account header: "Namaste, Arun 👋", phone number, Logout link. Tabs/side menu: My Orders · Saved Addresses · Profile.
- My Orders list: order cards with order code, date, item thumbnails ("Chicken 250g + 1 more"), total ₹927, status badge (Confirmed / Packed / In Transit / Delivered / Cancelled — show one of each), and "Track" / "View details" buttons. Empty state: "No orders yet — the mountains are waiting" + "Shop Pickles" button.
- Order Detail: status timeline (same style as the Track page), items with batch code, price breakdown, delivery address, payment method, "Download invoice", "Need help? WhatsApp us", and a "Cancel order" button (only visible while the order is not yet packed) that opens a confirmation dialog with a reason dropdown and the note "Refund will be credited in 5–7 working days".
- Saved Addresses: address cards with "Default" badge, Edit / Delete / Set as default actions, and an "+ Add new address" card that opens a form (pincode first → auto-filled city/state, same form fields as checkout).

Create Mobile (390px) and Desktop (1440px) frames. On Mobile the account menu becomes top tabs; on Desktop a left side menu with content on the right.
```

---

## 8. Static Pages (About, FAQ, Contact, Legal, 404)

```text
Using the Pahadi Khatki design system above (same header, footer, colors, fonts, buttons and cards as previous screens), design these static pages:

8A) OUR STORY / ABOUT:
- Hero: wide misty Kullu Valley photo, serif headline "From a Himachal Village Kitchen to Your Table".
- Story section in an editorial layout (alternating image + text blocks): the family recipe, the kath-kuni village kitchen, sun-curing on wooden rooftops, why pure mustard oil.
- "The Two Partners" section: two portrait cards — "The Kitchen in Kullu" (makes and packs every jar) and "The Team in Chennai" (brings it to your door) — with a short quote each.
- "How a Jar is Made" horizontal process (vertical on mobile): Fresh meat sourced → Slow-cooked with Pahadi spices → Sun-cured → Bottled & batch-stamped → Leak-proof packed.
- Promise strip: No preservatives · Small batches · Every jar traceable · FSSAI licensed.
- CTA band: "Taste the Mountains" gold button.

8B) FAQ:
- Search input at the top + category chips: Orders & Delivery, Payments & Refunds, Product & Storage, Packaging.
- Accordion with 8–10 questions (e.g. "How long does the pickle last?", "Do you deliver to my city?", "Is Cash on Delivery available?", "What if my jar arrives damaged?", "How do I store it after opening?").
- Bottom card: "Still have a question? Chat with us on WhatsApp".

8C) CONTACT:
- Contact cards: WhatsApp (primary), Email, Phone with working hours.
- Simple contact form: name, phone, order code (optional), message, "Send" button + success state.
- Business details block: registered address, FSSAI licence no., GSTIN, Grievance Officer name & email.

8D) LEGAL PAGE TEMPLATE (one reusable layout for Privacy Policy, Terms of Service, Refund & Cancellation, Shipping Policy):
- Title, "Last updated: 09 Oct 2026", sticky table of contents on the left (Desktop) / collapsible "On this page" at the top (Mobile), clean readable long-form text (max ~70 characters per line) with headings, lists and a callout box. Use placeholder legal text.

8E) 404 PAGE:
- Friendly illustration of a lost trekker on a mountain path, headline "Lost in the mountains?", text "This trail doesn't exist, but our pickles do.", buttons "Back to Home" (gold) and "Shop Pickles" (outline).

Create Mobile (390px) and Desktop (1440px) frames for each page.
```

> ⚠️ Legal pages ka asli text lawyer / CA se banwana hai — Razorpay KYC inhi pages ko check karta hai.

---

## 9. Kitchen Partner Packing Desk (Mobile only, English)

```text
Using the Pahadi Khatki design system above (same colors, fonts and components), design a SEPARATE internal mobile app:

9) KITCHEN PARTNER "PACKING DESK" — MOBILE ONLY (390px). Used by a non-technical kitchen partner in a Himachal village on a budget Android phone, often with poor network and busy hands. Design rules for this app:
- Extra-large text (body 18px+, numbers 28px+), buttons at least 56px tall and full-width, high contrast, very few choices per screen, no tiny icons without labels, no dropdowns where big tiles can be used.
- ENGLISH ONLY by default, using short, very simple words. Keep a language toggle (EN / हिं) in the header only as a switch — do not show bilingual text on the screens.
- Bottom navigation with 3 big tabs: 📦 Orders · ➕ New Batch · 💰 My Payments.
- No customer phone numbers, no revenue or profit figures anywhere.

Screens:
9A) LOGIN: logo, email + password, big "Login" button, "Remember this phone" checkbox. Also a one-time prompt: "Allow notifications to know when a new order arrives" with Allow / Later buttons.

9B) ORDERS HOME ("To Pack Today"):
- Header: "🏔️ Packing Desk", today's date, big counter card "5 orders to pack today · Courier pickup by 11:00 AM".
- Order cards: big order code "PK-7KQ2M9", items in large text ("1× Chicken Pickle 250g", "1× Mutton Pickle 250g"), customer first name + city ("Arun · Chennai"), time since order, a "Label ready ✓" chip (green) or "Label preparing…" chip (amber, card not yet actionable). Tap opens the pack screen.
- Top segmented tabs: To Pack (5) · Packed Today (3).
- Offline banner variant: "No internet — your actions will sync automatically" (amber).
- Empty state: "All packed for today! 🎉".

9C) PACK ORDER (step-by-step):
- Order code + items at the top, each item with its batch code (PK-2610-CHK250-01).
- Large tick checklist (each row is a big tappable card):
  ☐ Jar seal checked
  ☐ Shrink band applied
  ☐ 3 layers of bubble wrap
  ☐ Weight OK (≤ 500g)
- Two big buttons: "🖨️ Print Label" and "📲 Share on WhatsApp".
- Final full-width green button "✅ Mark as Packed", disabled until all 4 boxes are ticked.
- Success screen after tapping: big green check animation, "PK-7KQ2M9 packed! Courier will pick it up tomorrow morning", button "Next order →".

9D) NEW BATCH (3 fields only):
- Step 1: choose product as 6 big photo tiles (Chicken / Mutton / Trout × 250g / 500g).
- Step 2: "Jars made" — large number input with + / − buttons and a numeric keypad.
- Step 3: "Total cost ₹" — large ₹ input, helper "Meat + oil + spices + jars".
- Big "Save Batch" button → success card showing the auto-generated batch code "PK-2610-CHK250-02", expiry date and "Print batch sticker" option.
- Below: "My batches" list with stock left and badges: Fresh (green) / Aging (amber) / Expired (red).

9E) MY PAYMENTS / SETTLEMENTS (read-only):
- List of settlement cards by period ("1–15 Oct 2026"): jars sold, raw cost reimbursed ₹, my share ₹, total payout ₹, status badge (Draft / Finalized / Paid with bank reference).
- Detail view: simple breakdown list and an "✔ Acknowledge" button.

Show all screens as Mobile (390px) frames only.
```

---

## 10A. Admin Portal — Layout + Dashboard

```text
Using the Pahadi Khatki design system above (same colors, fonts, buttons, inputs, cards and status badges), design a SEPARATE internal web app:

10A) ADMIN PORTAL — LAYOUT + DASHBOARD (for the business owner; data-dense but calm and premium; desktop-first, show light AND dark mode).

APP SHELL (reused on every admin page):
- Left sidebar (collapsible): logo "Pahadi Khatki · Admin", nav items with icons: Dashboard, Orders (with count badge "5"), Products, Inventory, Customers, Settlements, Expenses, Settings; bottom: theme toggle, user avatar "Arun · Admin", Logout.
- Top bar: global search ("Search order code, phone, AWB…"), date range picker, notifications bell with dot.
- Every page follows a strict 3-TIER LAYOUT:
  Tier 1 — Page header: title + subtitle on the left, primary actions on the right.
  Tier 2 — Row of 4 KPI cards.
  Tier 3 — One large content card (table/charts) with a controls bar (filter pills on the left, search on the right).

DASHBOARD content:
- Header: "Dashboard", subtitle "Good morning, Arun — here's today in the mountains", actions: "New Batch" (outline), "Export" (ghost).
- 4 KPI cards: 📦 Orders to Pack (5, "2 waiting > 24h" in amber) · 🚚 In Transit (12) · 💰 Today's Revenue (₹8,430, "+12% vs yesterday" in green) · 🏔️ Active Batches (4, "1 aging soon" in amber).
- "Needs Attention" card (top priority, amber accents): rows like "PK-3HD8QX · Shipment booking failed · Retry", "PK-9MK2TA · Delivery attempt failed (NDR)", "Shiprocket wallet low: ₹1,250", "Batch PK-2610-MUT250-01 expires in 12 days".
- Charts: Revenue last 30 days (area chart in gold), Orders by status (horizontal bar), Top products (Chicken/Mutton/Trout share).
- Recent orders table (5 rows): order code, time, customer + state, items, amount, status badge, "View" link.
- Low stock list: product, jars left, progress bar.

Also show a TABLET (1024px) frame where the sidebar collapses to icons only.
Create Desktop (1440px) frames in light and dark mode, plus the tablet frame.
```

---

## 10B. Admin — Orders + Order Detail

```text
Using the same Pahadi Khatki Admin Portal shell (sidebar, top bar, 3-tier layout) and design system, design:

10B) ORDERS PAGE + ORDER DETAIL

ORDERS LIST:
- Tier 1 header: "Orders", subtitle "All customer orders across every stage", actions: "Export CSV" (outline).
- Tier 2 KPI cards: Awaiting Packing (5) · Packed, Awaiting Pickup (3) · In Transit (12) · Issues (2, red accent).
- Tier 3 table card:
  - Controls bar: status filter pills on the left — All · Awaiting Packing · Packed · In Transit · Delivered · Issues · Cancelled/Refunded (selected pill in gold); on the right: search input ("Order code, phone or AWB"), date range picker, filter button.
  - Table columns: checkbox, Order code (bold, clickable, e.g. PK-7KQ2M9), Date & time, Customer (name + state, e.g. "Arun K · Tamil Nadu"), Items ("1× Chicken 250g, 1× Mutton 250g"), Amount ("₹927 · UPI"), Courier & AWB ("Delhivery · 1493…"), Status badge, row actions (⋯ menu: View, Resend WhatsApp, Cancel & Refund).
  - Show ~10 rows covering many statuses: Confirmed, Awaiting Packing, Packed, Pickup Scheduled, In Transit, Out for Delivery, Delivery Failed (amber), Delivered (green), Cancelled (muted), RTO (red), plus one row with a red "⚠ Needs attention" tag.
  - Bulk action bar when rows are selected: "3 selected · Print labels · Export".
  - Pagination at the bottom ("Showing 1–20 of 248") + rows-per-page select.
  - Empty state and skeleton loading state for the table.

ORDER DETAIL (opens as a wide right-side drawer, ~720px, over the list):
- Header: order code + copy icon, status badge, payment badge "Paid", created time, actions: "Cancel order", "Refund", "Resend WhatsApp", ⋯ more (Retry shipment, Add note).
- Issue banner variant at the top (red/amber): "Shipment booking failed after 5 retries — Retry now".
- Sections as cards:
  1. Customer: name, phone (masked with a reveal eye icon), email, full shipping address, WhatsApp opt-in status.
  2. Items: thumbnail, name, weight, qty, price, and allocated batch codes with expiry ("PK-2610-CHK250-01 · exp 04 Feb 2027").
  3. Payment: total breakdown (subtotal, shipping, tax included, total), Razorpay payment ID, method UPI, attempts list (1 failed, 1 captured), refunds list.
  4. Shipment: courier, AWB, pickup date, ETA, shipping label preview thumbnail with "Open label" and "Print" buttons, charged weight.
  5. Timeline: combined status history + courier scans, each with time and actor ("System", "Kitchen Partner", "Delhivery").
  6. Notifications sent: WhatsApp messages with delivered/read ticks.
  7. Internal notes: note list + add-note input.
- Cancel dialog: reason select + note + warning "This will cancel the shipment and refund ₹927 to the customer" + red "Cancel & Refund" button.
- Refund dialog: Full / Partial toggle, amount input (₹), reason select, confirmation summary.

Create Desktop (1440px) frames in light mode (and the list also in dark mode), plus a Tablet (1024px) frame of the list where less important columns are hidden.
```

---

## 10C. Admin — Products + Inventory

```text
Using the same Pahadi Khatki Admin Portal shell (sidebar, top bar, 3-tier layout) and design system, design:

10C) PRODUCTS + INVENTORY

PRODUCTS LIST:
- Tier 1 header: "Products", subtitle "Your catalog as customers see it", action: gold "+ Add Product".
- Tier 2 KPI cards: Live Products (5) · Drafts (1) · Low Stock (2, amber) · Sold Out (1, red).
- Tier 3 table card: filter pills (All · Live · Draft · Sold out) + search. Columns: jar thumbnail, product name with non-veg mark, SKU (CHK250), weight, price (₹399, compare ₹449), sellable stock with a small progress bar, status badge (Live green / Draft muted), actions (Edit, Publish/Unpublish).

ADD / EDIT PRODUCT (full page form with a sticky "Save" / "Publish" bar at the bottom):
- Left column (form sections as cards):
  1. Basic info: title, slug (auto), product group ("Himachali Chicken Pickle" — links 250g/500g variants), meat type select (Chicken/Mutton/Fish), short description, full description (rich text).
  2. Pricing & tax: price ₹ (inclusive of GST), compare price ₹, HSN code, GST rate select.
  3. Images: drag-and-drop uploader with reorderable thumbnails, "Primary" tag on the first image.
  4. Food details: ingredients, allergens, spice level (1–5 chilli selector), shelf life (days), storage instructions, nutrition table inputs per 100g.
  5. Shipping: net weight (g), packed weight (g) with a warning chip "Over 500g — higher courier slab" when exceeded, box size L×B×H (cm).
- Right column (sticky): live preview of the storefront product card, publish status, a checklist "Ready to publish: ✓ images ✓ price ✓ FSSAI details ✗ nutrition" — Publish disabled until complete.

INVENTORY / BATCHES:
- Tier 1 header: "Inventory", subtitle "Every jar traceable to its batch", actions: gold "+ New Batch", outline "Stock Adjustment".
- Tier 2 KPI cards: Sellable Jars (148) · Batches Active (6) · Aging Soon (1, amber) · Wastage this month (4 jars).
- Tier 3 table card: filter pills (All · Fresh · Aging · Not Sellable · Expired) + product filter + search. Columns: batch code (PK-2610-CHK250-01), product, kitchen (Kullu), bottled date, expiry date, stock (available / initial with a progress bar, e.g. 34 / 100), cost per jar ₹120, status badge (Fresh green / Aging amber / Not sellable muted / Expired red), actions (View ledger, Adjust).
- Batch ledger drawer: batch summary at the top + movement history table (date, type badge: Production / Reserved / Released / Adjustment / Wastage, quantity +/−, order code link, by whom, reason) and a running balance.
- New Batch dialog: product select, jars produced, total cost ₹ (shows the computed "₹120 per jar"), bottled date, notes → preview of the generated batch code and expiry date.
- Stock Adjustment dialog: batch select, type (Adjustment / Wastage), quantity (+/−), reason (required) e.g. "Jar cracked during packing".

Create Desktop (1440px) frames in light mode (Inventory also in dark mode).
```

---

## 10D. Admin — Settlements + Expenses + Customers + Settings

```text
Using the same Pahadi Khatki Admin Portal shell (sidebar, top bar, 3-tier layout) and design system, design:

10D) SETTLEMENTS + EXPENSES + CUSTOMERS + SETTINGS

SETTLEMENTS LIST:
- Tier 1 header: "Settlements", subtitle "Transparent 50/50 profit share with the Kitchen Partner", action: gold "+ Generate Settlement".
- Tier 2 KPI cards: Unsettled Orders (42) · Pending Payout (₹20,160) · Paid This Month (₹38,400) · Avg Profit per Jar (₹96).
- Tier 3 table card: filter pills (All · Draft · Finalized · Paid) + search. Columns: period ("1–15 Oct 2026"), orders, jars, net profit ₹, partner payout ₹, status badge (Draft muted / Finalized info-blue / Paid green), partner acknowledged (✓ with date or "Pending"), actions.

SETTLEMENT DETAIL (full page):
- Header: period, status badge, actions depending on status: "Recompute" + "Finalize" (Draft) → "Mark as Paid" (Finalized) → "Download Statement PDF" (Paid).
- Profit WATERFALL chart (gold bars going down step by step): Revenue (excl. GST) ₹45,600 → Raw cost reimbursed −₹14,400 → Packaging −₹3,840 → Courier −₹8,160 → Payment gateway fees −₹1,130 → Refunds −₹380 → RTO courier −₹170 → Shared expenses (Ads) −₹6,000 → Net Profit ₹11,520.
- Split cards side by side: "Kitchen Partner — 50%: ₹5,760 share + ₹14,400 raw cost = ₹20,160 payout" and "Admin — 50%: ₹5,760".
- Line items table per order: order code, jars, revenue, raw cost, packaging, courier, gateway fee, refunds, net.
- Linked expenses table.
- Mark as Paid dialog: bank reference no., paid date, amount (pre-filled), confirm.
- Partner acknowledgement banner: "Acknowledged by Kitchen Partner on 17 Oct 2026" (green) or "Awaiting partner acknowledgement" (amber).

EXPENSES:
- Tier 1: "Expenses", action "+ Add Expense". Tier 2 KPIs: This Month (₹9,240) · Ads (₹6,000) · Packaging (₹2,100) · Unsettled (₹3,240).
- Tier 3 table: date, category badge (Ads, Packaging, Raw material, Logistics, Software, Compliance, Other), description, amount ₹, paid by (Admin / Kitchen Partner), receipt (attachment icon), linked settlement.
- Add Expense dialog: category, amount, date, description, paid by, receipt upload.

CUSTOMERS:
- Tier 1: "Customers". Tier 2 KPIs: Total Customers · Repeat Customers % · Avg Order Value · Top State.
- Tier 3 table: name, phone (masked), city/state, orders count, total spent ₹, last order date; row click opens a drawer with their order history.

SETTINGS (tabbed page: Store · Shipping · Inventory · Staff · Audit Log):
- Store: free-shipping threshold ₹, flat shipping fee ₹, reservation time (minutes), Cash on Delivery toggle (off) with a caution note.
- Shipping: pickup location card (Kullu kitchen address, Shiprocket nickname), pickup cut-off time, minimum courier rating, max delivery days, wallet low-balance alert ₹.
- Inventory: minimum shelf life at delivery (days), transit buffer (days), low-stock threshold.
- Staff: table of users (name, email, role badge Admin / Kitchen Partner, kitchen, status, last login) + "Invite Staff" dialog + "Force logout" action.
- Audit Log: read-only table (time, who, action, entity, before → after diff view).
- Every setting change shows a confirmation and a "Saved" toast.

Create Desktop (1440px) frames in light mode (Settlement detail also in dark mode).
```
