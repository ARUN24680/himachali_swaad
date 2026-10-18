# Storefront About / Our story redesign — evidence

Screenshots come from the local dev server (`localhost:3000`, API on `:4000`), taken with reduced motion and consent already declined.

- Before: `before-{375,768,1440}-{light,dark}.png` (full page) and `before-*-fold.png` (above the fold).
- After: `after-{375,768,1440}-{light,dark}.png` (full page) and `after-*-fold.png` (above the fold).
- Mobile sticky "Shop pickles" bar, after tapping "How it's made": `after-375-{light,dark}-sticky-cta.png`. The `#process` anchor lands 80 px from the top, below the header.
- Horizontal overflow is 0 px in all 12 before/after viewport and theme combinations.
- Checks: `typecheck`, `lint` and `check:colors` are clean. `smoke.spec.ts` passed 15/15. No e2e spec targets `/about` directly, so no selectors changed.

## What was weak before
- The hero was text only, with a grey layered ridge strip at the bottom. That looked like a placeholder, and it differed from the new home hero.
- The story was one centred 3-paragraph text block with no imagery or hierarchy, and a lot of empty space around it.
- There were no section transitions or rhythm: three generic cards, then a lone button.
- Mobile had a long run of text and cards, and no shop CTA within thumb reach until the very end.

## Structure (hybrid, D-44)
`app/(shop)/about/page.tsx` is unchanged (metadata and canonical are kept). `modules/content/components/AboutContent.tsx` puts together `about/AboutHero`, `AboutBackdrop`, `AboutStory`, `AboutProcess`, `AboutPromises`, `AboutClosing` and `AboutStickyCta`. Everything is a server component except the sticky bar, so the page still renders statically (D-51).

## Design deviations (Rules §1.5)
- Stitch se alag: no "EST. 1954", "Upper Sultanpur", "Solar cured 45 days", "100% Unadulterated", elevation, family residence or "multi-generational" claims. Kyunki nothing in the codebase backs them up, and the content-honesty rule applies.
- Stitch se alag: the hero is the Deep Pine band with one smooth curve and a gold hairline, like home hero v2. It does not use a full-bleed landscape photo, because we have no landscape photography. The About page has its own `AboutBackdrop`, so the shared `MountainRidges` and the home `HeroBackdrop` stay untouched.
- Stitch se alag: the hero photo sits in an arched "window" frame, not the home page's jar-on-plinth. Kyunki the two pages should feel related but not identical. The jar on a plinth appears only, and smaller, in the closing CTA card.
- Stitch se alag: there are two "chapters" (photo, paragraph and pull-quote), not long chapter essays. They reuse the existing three paragraphs. Images alternate sides from 768 px, and on phones a 3:2 crop comes first.
- Stitch se alag: "How a jar is made" is a 4-stop timeline: vertical on phones, 2×2 on tablets, horizontal from 1024 px. The four steps are the four verbs already in the copy (cooks, matures, seals, packs). It has no durations or counts.
- Stitch se alag: there is a phone-only sticky "Shop pickles" bar, the same pattern as home. It hides over the closing CTA and the footer, so it never covers the legal links.
- Not used: the `heritage-label` image. Its artwork shows a sample FSSAI number and batch data (see `public/home/asset-provenance.json`), which would read as real facts at that size.
