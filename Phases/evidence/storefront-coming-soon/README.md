# Public "coming soon" teaser — evidence

Route: `/coming-soon`. It is public (no auth, no middleware), statically rendered (D-51) and has 0 px horizontal overflow at 375, 768 and 1440 in both light and dark.

- Full page: `coming-soon-{375,768,1440}-{light,dark}.png`. Above the fold: `*-fold.png`. The page is one viewport tall, so the two are almost identical.

## No-hint guarantee
- The page shows no brand name, logo, product, category or imagery. It says only that something is coming from Himachal.
- Store chrome (header, footer, cart drawer, Organization JSON-LD) is no longer in the root layout. It now lives in `app/(site)/layout.tsx` through `app/_shell/SiteShell.tsx`, so the teaser HTML and RSC payload contain none of it.
- I checked this with `curl`: `/coming-soon` has 0 matches for pickle, khatki, mutton, chicken, shop, jar or non-veg.
- `<title>`, the description, OG and Twitter tags, and the share image (`coming-soon/opengraph-image.tsx`) are all neutral.
- The root `app/not-found.tsx` is now product-neutral, because Next ships it with every page's payload. Store 404s still show the full chrome through `(site)/[...missing]` and `(site)/not-found.tsx`. Checked: `/nope-xyz`, `/products/no-such-slug` and `/account/zzz` all return 404 with header and footer.
- The cookie-consent banner still appears for first-time visitors (DPDP). Its text is generic.

## Design (Rules §1.5 — there is no Stitch screen for this page)
v2 (2026-10-18), after owner feedback: "add more content, scrollable", "the mountains don't look good / too curvy / too little snow".

- **Mountains:** `HimalayaRange.tsx` draws a generated, deterministic Himalayan range (`range-paths.ts`; superseded by v3 below).
  - Sharp straight-edged peaks, no curves.
  - Big snow caps whose snowline follows each peak, with snow gullies and rock ribs.
  - A shadow face on every peak.
  - A lower mid range with light snow, mist between the layers, and deodar-forested foothills in front.
  - Each layer is opaque, so the gold sun truly rises *behind* a saddle.
  - Token colours only.
- **Page sections, in scroll order:**
  1. Hero: "Something is coming / from the mountains." with a scroll cue.
  2. "Chapter one · The hills": a short piece about Himachal's pace, beside "Slow. Honest. Of the hills."
  3. "What it stands for": Unhurried / Honest / Of the hills.
  4. "Chapter two · The valleys": Kullu, Kangra, Chamba, Kinnaur, Lahaul, Spiti, Mandi, Shimla and Sirmaur, plus the Shivalik, Dhauladhar, Pir Panjal and Great Himalaya ranges. A mirrored range follows.
  5. "What we can tell you": What is it? *Not yet.* Where from? *Himachal Pradesh.* When? *Soon.*
  6. Closing: "Keep watching the mountains." with Unveiling soon and Back to the top.
- **Motion:** only the ping dot, the scroll-cue bounce and a slow glow pulse, all `motion-safe`.
- **No email "notify me" form:** the storefront has no API for capturing launch sign-ups. That needs backend work (an endpoint plus consent text).
- **No-hint check:** a `curl` of `/coming-soon` has 0 matches for pickle, khatki, mutton, chicken, shop, jar, non-veg, food, kitchen or spice.

## v3 mountains (2026-10-18) — `v3-before-*` / `v3-after-*`
Owner feedback: too many look-alike peaks (a saw blade), big grey/white slabs and hard facets, noisy middle layers, a pasted-on row of trees, and a band that stopped in a flat strip.

- Shots: `v3-{before,after}-hero-{375,768,1440}-{light,dark}.png` (the hero section) and `v3-{before,after}-valleys-{375,768,1440}-{light,dark}.png` (the valleys band down to "What we can tell you"). Full-page `coming-soon-*.png` were re-shot after v3.
- **One calm composition:** a hero peak (x 650) and two lower peaks (x 330, x 1060) of different heights and widths. The sun rises in the saddle right of the hero peak; it is visible at 375 too. The glow lives in the hero sky, so it is never clipped by the SVG box.
- **Atmospheric perspective:** the far ridge is a faint wash that fades into mist. The massif uses a top-to-bottom tint, and the right-hand faces get a soft vertical shade with no hard facet triangles. A mist band sits over the massif's base.
- **Snow:** a modest cap on the hero peak and a small one on the right peak only. Both fade downward and the shade falls across them.
- **Foreground:** a near foothill in the band colour with five deodar clusters of varied height and spacing, with gaps between them. Because it matches the band colour, the illustration melts into the next section with no strip or dead space.
- **Valleys band:** replaced by a slim, quiet ridge divider (`variant="divider"`): a faint far-ridge line and wash, then the treeline over one gold hairline (the home hero's edge language), mirrored.
- **Film grain:** now sits above the content (pointer-events-none), so the opaque mountain layers no longer show as grain-free rectangles.
- **Generator:** moved to `apps/storefront/scripts/gen-range.py`; run `python3 apps/storefront/scripts/gen-range.py apps/storefront/src/modules/teaser/components/range-paths.ts`. The silhouettes are authored by hand; only the trees are generated, from a fixed seed.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15; overflow is 0 px in all six viewport/theme combinations; the no-hint scan has 0 matches.

## v4: valley photo in the hero (2026-10-18), `v4-photo-*`
At the owner's request, the hero's mountain illustration is replaced by the owner-supplied Kangra panorama (`packages/ui/images/kangra_oldskool_panorama_1_1792313589441.jpg`).

- It is converted to `apps/storefront/public/teaser/kangra-valley.webp` (1376×768, about 200 KB) and served through `next/image` (`fill`, `sizes="100vw"`).
- The photo's top is masked (`mask-t-from-45%`), so the snow peaks dissolve into the night sky with no seam. A 15 % band-colour wash keeps the daylight photo in the evening mood, and the bottom fades into the next section.
- The object position keeps the Dhauladhar peaks in frame at 375, 768 and 1440.
- Nothing in the frame relates to the product: a train, terraces, deodar forest, a river and snow peaks.
- The illustrated ridge is still used as the slim divider in the valleys section (`HimalayaRange variant="divider"`).
- Shots: `v4-photo-hero-{375,768,1440}-{light,dark}.png`. Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.

## v5: photo blends up behind the lede (2026-10-18), `v5-blend-*`
At the owner's request, the Kangra photo now rises behind "Born in the valleys…".

- **Layout:** the photo is pulled up with a negative margin (`-mt-44` / `sm:-mt-52` / `md:-mt-60`) and sits behind the text layer (`-z-10`). It is taller (`h-[62vh]`, `md:h-[72vh]`) and uses a softer top mask (`mask-t-from-55%`), so the snow peaks fade in right under the lede.
- **Readability:** the lede and the scroll cue get a soft band-colour text shadow (`text-shadow-md text-shadow-secondary/80`) and slightly stronger text (`/85`), so they stay readable over clouds and peaks.
- **Shots:** `v5-blend-hero-{375,768,1440}-{light,dark}.png`. Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.

## v6: only "Kangra, Himachal Pradesh" (2026-10-18), `v6-kangra-*`
At the owner's request, chapter two now names one place only, to match the Kangra photo in the hero.

- **Heading:** the eyebrow is now "Chapter two · The valley" and the heading "Somewhere in this valley, something is getting ready."
- **Removed:** the list of nine valleys and the line of four mountain ranges.
- **Added:** a large gold italic "Kangra" with a small "Himachal Pradesh" line between hairlines.
- **Shots:** `v6-kangra-valleys-{375,768,1440}-{light,dark}.png`. Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.

## v7: a calm ridge under "Kangra" (2026-10-18), `v7-*`
Owner feedback: "make the bottom of the Kangra area lines good". The old divider was a straight-segment zig-zag with a gold hairline tracing the same zig-zag (it read as a line chart), the trees were almost invisible in dark mode, the band was a flat grey slab with a hard top, and there was a big gap above it. Only the divider changed; the hero, copy and other sections are untouched.

- **Ridge:** `HimalayaRange variant="divider"` now renders `RidgeDivider`, a distant Dhauladhar silhouette that echoes the hero photo: a tall cluster of summits just right of centre and lower shoulders on both sides. The paths are smooth cubic Béziers (Catmull-Rom through densely sampled points), built from broad massifs with high saddles, soft summit cusps and a little noise that grows with altitude. There are no straight segments and no even zig-zags.
- **Two layers only:** the far snow range is a faint wash that fades into mist downward, with a whisper of a rim light that fades out toward both edges. The near foothills are long and low, in the band colour, so they read darker and nearer. Their faint tint fades to nothing, so there is no slab and no bottom edge.
- **Snow:** a hint of snow on the tallest summits only. The ragged caps follow the ridge and fade downward.
- **Removed:** the gold hairline (it only added noise) and the deodar treeline (it was invisible in dark mode at this size).
- **Spacing:** the divider sits closer under "Himachal Pradesh" (`mt-6` / `md:mt-8`, was `mt-12` / `md:mt-16`). Its faded tail runs under the top padding of "What we can tell you" (`-mb-12` / `md:-mb-20`), so the band flows into the next section. It is no longer mirrored. The svg is centre-cropped (`xMidYMax slice`, `min-h-28`), so phones see the snow cluster.
- **Generator:** the `DIV_*` exports come from `apps/storefront/scripts/gen-range.py` and use their own seeded RNG, so the hero paths stay byte-identical. Regenerate with the same command as in v3.
- **Shots:** `v7-before-valleys-*` and `v7-after-valleys-*` at `{375,768,1440}-{light,dark}`. Each shows the valleys section down to the "What we can tell you" heading.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15; overflow is 0 px in all six viewport/theme combinations; the no-hint `curl` scan has 0 matches.

## v8: a medium ridge with real snow (2026-10-18), `v8-after-valleys-*`
Owner feedback on v7: "looks good but too small — make it medium size and better snow." Only the divider and its own margins changed.

- **Size:** the drawing box is now 1440 × 300 (it was 200). It renders at `aspect-[1440/300]`, with a minimum height of `min-h-40` (160 px) on phones and `sm:min-h-48` (192 px) from 640 px up, so the band is about 245 px tall at 1440 (v7: about 120). The main massif and its five summits rise roughly twice as high, but the band stays calmer and smaller than the hero photo. It still has two layers that fade into mist, and the curves are still smooth.
- **Snow:** the caps sit on the four tallest summits.
  - The snowline is sampled every 2 units. It wanders, reaches lower under each summit, runs down into narrow gullies and sits higher on short rock ribs, so it is irregular, not a slab.
  - A few thin streaks grow out of the deeper gullies and lean down the fall line.
  - The snow fades into rock below. A blurred band-colour shade on each summit's east face gives a lit west side and a shaded east side.
  - The caps are clipped to the ridge, so the summit edge stays crisp. Two geometry-only blur filters (`feGaussianBlur`, `color-interpolation-filters: sRGB`, no colours) soften the snowline and the shade.
  - Light mode: the band is darker there, so the snow group drops to 80 % opacity (`opacity-80 dark:opacity-100`).
- **Spacing:** `mt-2` / `md:mt-4` (the svg has its own sky headroom). The faded tail still runs under the top padding of "What we can tell you" (`-mb-12` / `md:-mb-20`), so there is no hard edge.
- **Generator:** `gen-range.py` now has `snowfield()`, `streaks()` and `shade()`, which output `DIV_SNOW`, `DIV_STREAKS` and `DIV_SHADE`. The hero paths are still byte-identical.
- **Shots:** `v8-after-valleys-{375,768,1440}-{light,dark}.png`. For "before" shots, compare with `v7-after-valleys-*`.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15; overflow is 0 px in all six viewport/theme combinations; the no-hint `curl` scan has 0 matches.

## v9: full-width range with one main summit on each side (2026-10-18), `v9-after-valleys-*`
Owner feedback: "make it full length, mountains on the left and right too, only 1 or 2 main mountains on the left or right."

- The range now spans the full width. The five-summit group stays in the centre.
- Each side gets one main snow-capped summit on its own massif: one on the left at x 230 and one on the right at x 1210. Each sits on its own massif, with a smaller bare shoulder beside it (left at x 345, right at x 1320) and lower saddles between the side summits and the centre group. The small foothill bumps from v8 were dropped.
- Snow, streaks and the shaded east faces now run across the whole width (`snowfield(..., 120, 1360)`). Only the summits above the snowline get caps.
- At 375 and 768 the svg is centre-cropped, so the side summits are partly or fully out of frame and phones still see the centre group.
- **Shots:** `v9-after-valleys-{375,768,1440}-{light,dark}.png`. For "before" shots, compare with `v8-after-valleys-*`.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15; overflow is 0 px in all six viewport/theme combinations; the no-hint `curl` scan has 0 matches.

## v10: bottom blends into the green (2026-10-18), `v10-after-valleys-*`
Owner feedback: the green should blend in more at the bottom.

- **Valley mist:** a mist in the band colour (`text-secondary` via `currentColor`) now covers the lower half of the divider. It goes from 0 to 70 % to fully opaque, so the lower slopes dissolve into the section green and run under "What we can tell you" with no line or edge.
- **Removed:** the near-ridge hairline (`DIV_NEAR_RIDGE`). It drew a visible line across the bottom.
- **Unchanged:** the summits, snow and side mountains are the same as v9.
- **Shots:** `v10-after-valleys-{375,768,1440}-{light,dark}.png`. For "before" shots, compare with `v9-after-valleys-*`.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15; overflow is 0 px in all six viewport/theme combinations; the no-hint `curl` scan has 0 matches.

## v11: "01 / 02 / 03" numerals get breathing room (2026-10-18), `v11-{before,after}-values-*`
Owner feedback: the 01, 02 and 03 numbers in the "What it stands for" cards were stuck to the right edge. They were positioned at `-top-6 -right-2`, so the card clipped them at the top and right.

- **Fix:** the numerals now sit inside the card's padding: `top-5 right-6` on mobile and `md:top-6 md:right-8` from 768 up. They are slightly smaller (`text-6xl`, `md:text-7xl`; was `text-8xl`) and line up with the icon row. Opacity is `/10` (was `/5`), so they still read as a quiet watermark now that they are uncropped.
- **Shots:** `v11-{before,after}-values-{375,768,1440}-{light,dark}.png`. Overflow is 0 px in all six viewport/theme combinations.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15.

## v12: "Chapter three · The making" (2026-10-18), `v12-making-*`
At the owner's request, a section now describes how it is made, set in the Kangra valley. It hints at the craft (slow-cooked, tangy) but never names the product.

- **Placement:** between "Chapter two · The valley" (the mountain divider fades into it) and "What we can tell you".
- **Copy:** the heading is "Made slowly, the Kangra way." The lede says the valley still makes some things "by hand, over a low flame, under an open sky", and "What is coming is one of them."
- **Four steps,** in an `<ol>` with Lucide icons. Each has a decorative "01"–"04" (aria-hidden):
  1. Chosen by hand (Sprout): gathered from Kangra's farms and hill markets at the height of the season.
  2. Slow-cooked (Flame): a low flame, stirred by hand, never hurried.
  3. Sun-cured (Sun): set out under the Kangra sun on open rooftops.
  4. Rested (MoonStar): through warm days and cold nights, until the taste turns "deep, bold and gently tangy".
- **Closing line:** "Slow-cooked. Sun-cured. *Gently tangy.*" Each phrase is `whitespace-nowrap`, so "Sun-cured" never breaks at its hyphen on phones.
- **Layout:** desktop shows four columns joined by a gold hairline that fades out; the numerals and icons sit on the band colour, so the line never crosses them. Tablet uses two columns and mobile a single column. Token colours only.
- **No-hint change (owner's decision):** the page now hints at the process and the taste. The scan still has 0 matches for pickle, achaar, achar, khatki, mutton, chicken, meat, shop, jar, non-veg, food, kitchen, spice or recipe.
- **Shots:** `v12-making-{375,768,1440}-{light,dark}.png`. Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15.

## v13: "The making" as a timeline on mobile and tablet (2026-10-18), `v13-making-*`
Owner feedback: make the same joined-steps design work on mobile too.

- **Below `lg` (mobile and tablet):** the steps form a vertical timeline. Each icon sits in a 3 rem left column with its "01"–"04" under it, and a gold hairline runs down through the icons and fades out after the last step. The title sits beside the icon and the text below the title, in the right column. The list is capped at `max-w-2xl`, so lines stay readable at 768. This replaces the 2-column grid with no connector on tablet.
- **`lg` and up:** unchanged from v12, with four columns and the horizontal hairline.
- **Shots:** `v13-making-{375,768,1440}-{light,dark}.png`. Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.
- **Checks:** typecheck, lint and `check:colors` are clean; `smoke.spec.ts` passed 15/15; the word scan has 0 matches.

## v14: 4K Kangra banner (2026-10-18), `v14-banner-hero-*`
The owner replaced `public/teaser/kangra-valley.webp` with a 3840×2160 version of the same Kangra photo (about 2 MB) and asked for it to be the page's banner. The hero (`ValleyPhoto`, `next/image fill sizes="100vw" priority`) already points at that path, so it now shows the 4K photo.

- **Quality:** `ValleyPhoto` asked for `quality={95}`, but Next 16 serves only the qualities listed in `images.qualities` (the default is `[75]`), so it fell back to 75. `next.config.ts` now allows `qualities: [75, 90]`, and the banner uses `quality={90}`. The srcset goes up to `w=3840&q=90`. The 1920 px AVIF is about 211 KB, so visitors never download the 2 MB source.
- **Shots:** `v14-banner-hero-{375,768,1440}-{light,dark}.png` (above the fold). Overflow is 0 px in all six viewport/theme combinations.

## v15: the banner shows its full bottom, then blends (2026-10-18), `v15-banner-bottom-*`
Owner feedback: the bottom of the photo was hidden. Show the full bottom, and blend only the very bottom.

- **Cause:** at 1440 the photo box was `h-[72vh] max-h-[50rem]`, which is wider than the photo's 16:9. `object-cover` therefore cut off the bottom, losing the tea terraces, the track and the village. A bottom overlay over a third of the height, reaching 60 % band colour, hid even more.
- **Fix:**
  - **lg and up:** the box is exactly 16:9 (`lg:aspect-video lg:h-auto`), so the whole photo shows.
  - **Phones and tablets:** the box stays taller than 16:9 (`h-[62vh]` / `md:h-[72vh]`), so only the sides are trimmed and the bottom is never cut.
  - **Blend:** the bottom blend now covers only the last quarter (`h-1/4`, `via-secondary/25`), so the terraces stay visible and only the very edge melts into the band green. The top mask and the evening wash are unchanged.
- **Shots:** `v15-banner-bottom-{375,768,1440}-{light,dark}.png` (hero down to "Chapter one"). Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.

## v16: a longer, softer fade at the banner's bottom (2026-10-18), `v16-banner-fade-*`
Owner feedback: fade the bottom more.

- **Fade:** the bottom wash now covers the lower half of the photo (`h-1/2 from-secondary from-5% via-secondary/50 via-35% to-transparent`). The photo's lower third melts gradually into the band green, while the train, terraces and village stay visible above it. The photo box is unchanged from v15, so the bottom is still never cropped.
- **Wash, not a mask:** a CSS bottom mask (`mask-b-from-*`) was tried first and dropped. It made the photo transparent, so the hero's gold sun glow showed through and ended in a hard edge at the section's bottom. An opaque band-colour wash has no such edge.
- **Shots:** `v16-banner-fade-{375,768,1440}-{light,dark}.png`. Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.

## v17: hero text sits a little lower (2026-10-18), `v17-hero-text-*`
Owner feedback: move the text down a little, and the green background with it.

- The hero content's top padding is now `pt-16` / `md:pt-24` (was `pt-12`). "Coming soon", the heading, the lede and the scroll cue sit about 16 px lower on phones and 48 px lower from md up. The night-green sky above them grows by the same amount. The photo follows in the flow, so its overlap with the lede is unchanged.
- **Colour:** the sky colour is not changed. Light mode uses the `secondary` token (deep pine, which reads almost black-green), and dark mode is a lighter pine. A greener sky in light mode is a palette change: it belongs in `packages/ui/src/styles/globals.css` with a decisions-log entry, so it was left for the owner to approve.
- **Shots:** `v17-hero-text-{375,768,1440}-{light,dark}.png` (above the fold). Full-page `coming-soon-*.png` were re-shot. Overflow is 0 px in all six viewport/theme combinations.

## v18: the photo's top fades in with no line (2026-10-18), `v18-blend-*`
Owner feedback (light mode, about 2000 px wide): "still shows line — make it fully blended". A soft straight band crossed the full width where the photo begins, level with "Born in the valleys…", and it was most visible at the left over the dark forest.

- **Cause:** the top mask was linear (`mask-t-from-55%`). At the photo's top edge the brightness goes from flat (the sky) to rising at a steady rate in a single pixel row. The eye reads that sudden change of slope as a line (a Mach band). The sky behind it was not the problem: a column at x = 20 px reads a flat L ≈ 25.5 (light) and 55.9 (dark) all the way down to the photo's edge, with no step.
- **Fix:** the photo now uses `PHOTO_TOP_FADE`, a `mask-image` linear gradient with 12 stops along a smoothstep curve (3t² − 2t³). It runs from fully transparent at the photo's top edge to fully opaque at 50 % of the photo's height. The fade starts and ends with zero slope, so there is no edge at either end. The stops carry alpha only; their colour is ignored. The line carries the `pk-allow-color` marker because the checker flags the `rgb(0 0 0 / a)` stop syntax. No colours, overlays or palette changed.
- **Unchanged:** the layout, the photo box (still never crops the bottom), the v16 bottom wash into the green, the `bg-secondary/15` evening wash, the sun glow and the text shadows on the lede and "Scroll". At 50 % height the mask is opaque before the glow's ellipse, so the glow never shows as an edge.
- **Measured (1920 light, x = 20 px, 9 × 5 px patches every 10 px):**
  - Before: flat at 25.4, then +1.9 per 10 px from the first row of the photo.
  - After: +0.1, +1.0, +0.5, +0.3, +0.9, +1.5, +1.8 per 10 px, a gentle ramp that grows smoothly.
  - Row means over x 0–300 change by at most 0.6 grey levels per 4 px across the photo's top region.
- **Shots:** `v18-blend-{before,after}-{375,768,1440,1920,2000}-{light,dark}.png` (the hero section). Zoomed crops of the transition band (x 0–720, from 160 px above the photo top to 340 px below it): `v18-blend-{before,after}-zoom-{1440,1920}-{light,dark}.png`. `v18-blend-{before,after}-zoom-contrast-sheet.png` shows the same four crops with the dark tones stretched hard. The before sheet shows a clear straight line at the photo top, and the after sheet does not.
- **Checks:**
  - Typecheck, lint, Prettier and `check:colors` are clean.
  - `smoke.spec.ts` passed 15/15.
  - Overflow is 0 px in all ten viewport/theme combinations.
  - The no-hint word scan has 0 matches.

## v19: "Chapter four · The secret", the advert section (2026-10-18), `v19-sealed-*`
At the owner's request, a teaser advert for the secret launch now uses the two brand images in `packages/ui/brand/`. They were converted to webp in `public/teaser/`:
- `woodfire-hearth.webp`: 1024², about 197 KB.
- `sealed-card.webp`: the wax-seal card cropped to the card only, 614 × 868, about 124 KB.

- **Placement:** between "Chapter three · The making" and "What we can tell you". The owner's screenshot (Image #31) was not available to the agent, so "above this section" was read as "above What we can tell you". Moving it is a one-line change in `ComingSoon()`.
- **Layout:**
  - **Collage:** the hearth photo is large and rounded, with a gold ring, a bottom wash and a "Lit before dawn" chip. The sealed card is tucked over its lower-right corner, tilted 3° (it straightens on hover; no motion under reduced motion).
  - **Copy:** "Sealed by hand. *Yours, soon.*", a short lede, three Lucide-icon notes (wood-fired, sealed by hand in small batches, kept under seal) and the closing "Authenticity, *redefined.*"
  - **Responsive:** 7/5 columns from lg up; stacked below lg with the collage first. A soft primary glow sits behind it.
- **No-hint:** the copy and alt text never name the product. The word scan still has 0 matches. Both images carry baked-in "Coming soon" text, as supplied by the owner.
- **Shots:** `v19-sealed-{375,768,1440,1920}-{light,dark}.png`. Overflow is 0 px in all eight viewport/theme combinations.
- **Checks:** typecheck, lint, Prettier and `check:colors` are clean; `smoke.spec.ts` passed 15/15.

## v20: brand logo in place of "Dev Bhoomi" (2026-10-18), `v20-logo-hero-*`
At the owner's request, the hero's top bar now shows the horizontal logo where the words "Dev Bhoomi" used to be. It still reads logo, gold hairline, "Himachal Pradesh".

- **Asset:** `packages/ui/brand/logo-horizontal-dark.png` (the cream version for dark backgrounds) is imported statically, the same way `BrandLogo` does it. The hero sky is dark in both themes, so this version is always used, even in light mode. It is rendered with `next/image` and `priority`, with alt "Pahadi Khatki". It is served from `/_next/…`, which D-61's pre-launch lock lets through.
- **Size:** `h-14` (56 px) on phones and `md:h-20` (80 px) from 768 up. The bar's top padding dropped to `pt-4` / `md:pt-6`, so the taller logo pushes the hero down by only about 40–55 px. The photo's v18 fade is unchanged and was re-measured: row means still change smoothly, with no step at the photo's top.
- **Policy change (owner's decision):** the teaser used to show no brand name. Now the brand appears once, as the logo. The no-hint scan now finds exactly one "Khatki", the logo's alt text. The copy still never names the brand or the product.
- **Shots:** `v20-logo-hero-{375,768,1440,1920}-{light,dark}.png` (the hero section). Overflow is 0 px in all combinations.
- **Checks:** typecheck, lint, Prettier and `check:colors` are clean; `smoke.spec.ts` passed 15/15.
- **Follow-up (owner):** "Dev Bhoomi" is back, as a second line under "Himachal Pradesh" on the right of the top bar. It is right-aligned, smaller (`text-[0.625rem]`, wider tracking) and set in gold (`text-primary/80`). The `v20-logo-hero-*` shots were re-taken with it. Overflow is 0 px at 375 / 768 / 1440 / 1920 / 2000 in light and dark.

## v21: full-width valley photo on phones and tablets (2026-10-20), `v21-fullwidth-*`
The owner reported that on phones and tablets the hero photo was cut off on both sides. The train's blue engine (at the photo's left) was missing, and so was the river valley on the right. Below `lg`, the photo box used to be a tall `h-[62vh]` / `md:h-[72vh]` box, so `object-cover` trimmed the 16:9 panorama sideways.

- **Fix:** the box is now `aspect-video` (the photo's own 16:9) at every width, so `object-cover` crops nothing and the whole panorama shows edge to edge. The photo is shorter on phones (211 px at 375), so it tucks under the text less: `-mt-12` / `sm:-mt-24` / `md:-mt-36`. `lg:-mt-60` is unchanged. The phone-only `object-[50%_30%]` is removed because there is nothing left to position. The v18 `PHOTO_TOP_FADE` mask and the bottom wash into the next section are unchanged.
- **Desktop unchanged:** 1024 / 1440 / 1920 in light and dark are pixel-identical to the pre-change shots (the image diff bounding box is `None`).
- **Engine:** fully visible at 375, 390, 640 and 768 (lower-left, with the coaches curving behind it). The right-hand river valley is visible too.
- **Text:** the "Scroll" cue always ends above or at the photo's top, over the transparent part of the fade (for example 375: scroll bottom 594, photo top 601; 768: 636 / 592, about 10% into the fade). No text sits on the opaque photo.
- **Seam re-check (v18 method, row means with the centred text columns excluded):** the largest row-to-row step within 15 px of the photo's top edge is 1.0–1.3 at 375 and about 0.9 at 768, in light and dark. That is a smooth ramp with no line. Larger steps appear only deeper in the photo content (the ridges and trees).
- **Overflow:** 0 px at 320 / 375 / 390 / 640 / 768 / 812×375 (landscape) / 900 / 1000 / 1024 / 1440 / 1920, in light and dark.
- **Shots:** `v21-fullwidth-{375,390,768,1024,1440,1920}-{light,dark}.png` (the hero section), plus `v21-fullwidth-before-{375,768}-light.png` for comparison.
- **Checks:** storefront typecheck, lint, Prettier and `check:colors` are clean; `smoke.spec.ts` passed 15/15.
