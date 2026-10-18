# Storefront home redesign — evidence

Screenshots captured from the local dev server (`localhost:3000`, dev catalogue on `:4000`) with reduced motion and consent pre-declined.

- Full page: `home-{375,768,1440}-{light,dark}.png`. Above the fold: `*-fold.png`.
- Mobile sticky "Shop pickles" bar (shown after scrolling past the hero): `home-375-{light,dark}-sticky-cta.png`.
- Horizontal overflow measured at 0 px on all six viewport/theme combinations.

Product photos in these shots are flat jar placeholders because the dev database holds placeholder product images. The real demo photos live in `packages/database/seeds/demo-catalog/images` and are loaded with `pnpm --filter @pk/backend seed:demo`. The cards render whatever `images[0]` the API returns, through `ProductImage` (next/image).

## Design deviations (Rules §1.5)

- Stitch se alag: hero on the Deep Pine band with a transparent jar cut-out — kyunki the white photo card clashed with the band, and the light Stitch hero loses the brand mood.
- Stitch se alag: no rating in the hero ("4.92 / 5", "★ 4.9 (1,200+ Jar Orders)") and no "Pantry Chronicles" testimonials — kyunki the store is pre-launch, reviews are v2, and that content was hard-coded.
- Stitch se alag: "How to enjoy it" and a 4-question FAQ teaser (answers taken from the FAQ page) — kyunki it is useful and makes no claims; Stitch's FAQ block was the idea.
- Stitch se alag: the quick shop is a swipeable rail on phone/tablet and a 3-column grid on desktop, with compact 4:3 cards — kyunki price and Add to cart stay visible without a tall image.
- Stitch se alag: no "4-Layer Leak-Proof Transit" section and no "Dispatches from Kullu Decks" gallery — kyunki we have no photography for them. The packing promise lives in the trust strip under the products.
- Stitch se alag: "FSSAI Certified" and "19,000+ pincodes" were removed from the hero and the trust strip — kyunki the footer still shows the FSSAI licence as Pending and the pincode count is not verified.

## Hero v2 (2026-10-18) — `hero-v2/`

Only the hero changed (`modules/home/components/HomeHero.tsx` + new `HeroBackdrop.tsx`); tokens, navbar, products and footer are untouched. The shared `MountainRidges` (About page) is unchanged; the hero just no longer uses it.

- Before / after hero: `hero-v2/{before,after}-{375,768,1440}-{light,dark}.png`. Full page at 1440: `hero-v2/{before,after}-fullpage-1440-{light,dark}.png`.
- Horizontal overflow 0 px on all six. CTA bottom: 417 px at 375×812 and 460 px at 1440×900, so both are above the fold. `smoke.spec.ts`: 15/15 passed. typecheck, lint and `check:colors` are clean.

### Design deviations (Rules §1.5)
- Stitch se alag: the jar stands on a lit plinth inside a soft arch of warm light, with a contact shadow, instead of a halo disc. Kyunki the disc edge read as "a cut-out on a circle"; a plinth and arch ground the jar in the band.
- Stitch se alag: the fresh-batch label is a compact two-line plate tucked under the jar's base, no wider than the plinth. Kyunki the old full-width box looked detached. The data is unchanged: batch code, product, bottled date, `data-testid="current-batch"`.
- Stitch se alag: the hero ends with one smooth curve in `background` plus a gold hairline, over a single faint ridge silhouette (4% opacity). Kyunki the grey ridge strip plus the wavy curve looked like two stacked placeholders.
- Stitch se alag: the headline breaks after the comma ("Taste the mountains," / "slow-cooked in small batches.") on 2 lines from 1024 px; it is balanced on smaller screens. The trust points are a 2×2 grid under a hairline, kept well above the edge.
- The band gets depth from token-only light (radial `primary` key light, `secondary-foreground` lift) and an SVG film grain coloured through `currentColor`. There is no motion, so `prefers-reduced-motion` has nothing to disable.
