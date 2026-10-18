# Pre-launch lock: evidence (D-61, 2026-10-18)

At the owner's request, production launches with only the storefront's `/coming-soon` page. Everything else in the storefront answers 404, and the admin build shows only a 404. Development (`next dev`, `vite dev`) is never locked.

## Storefront: locked production build (`next build && next start`, `LAUNCH_MODE` unset)

| URL | Status | Product words* |
| --- | --- | --- |
| `/` (rewritten to the teaser) | 200 | 0 |
| `/coming-soon` | 200 | 0 |
| `/products`, `/products/foo`, `/about`, `/checkout`, `/account/login`, `/track`, `/privacy-policy`, `/zzz`, `/launch-404` | 404 | 0 |
| `/sitemap.xml` | 404 | 0 |
| `/robots.txt`, `/icon.svg`, `/coming-soon/opengraph-image`, `/_next/image?url=/teaser/…` | 200 | 0 |
| `/api/revalidate` (GET) | 405 (the route exists; the backend's POST still works) | n/a |

\* `grep -i` for pickle, khatki, mutton, chicken, non-veg, food, kitchen, spice and cart in the HTML.

- **Locked 404 head:** `<title>Page not found</title>`, `robots: noindex, nofollow`, and no `og:image`. Before the neutral metadata was added, the root layout's brand title and description leaked into the 404 head.
- **Same build with `LAUNCH_MODE=live`:** `/`, `/products` and `/about` return 200, and `/zzz` returns 404.
- **Dev server (:3000):** `/products` returns 200, and `smoke.spec.ts` passed 15/15.
- **Shots:** `locked-404-{375,768,1440}-{light,dark}{,-fold}.png`, with 0 px overflow.

## Admin: locked build (`vite build`, `VITE_LAUNCH_MODE` unset)

- **Output:** only `index.html` (title "Page not found", no brand icon), `_headers` (the CSP), and three assets: the entry, the locked 404 chunk and the CSS, plus fonts. There is no app bundle, no PWA manifest or service worker, no `offline.html`, no icons and no source maps. `grep -i` finds 0 matches for khatki, pickle or "packing desk", apart from the API domain in `_headers`.
- **`VITE_LAUNCH_MODE=live`:** the full app, manifest, `sw.js`, icons and `offline.html` are built.
- **Shots:** `admin-locked-{375,768,1440}-{light,dark}{,-fold}.png` (`/orders` on `vite preview`), with 0 px overflow.
- **Dev server (:5173):** `/login` renders the real sign-in page.
- **Admin `auth.spec.ts`:** fails 11/11 on desktop with **and without** this change (the original `main.tsx` was restored for the baseline run). The login mock answers "Too many sign-in attempts…", so the failures are unrelated to the lock.
