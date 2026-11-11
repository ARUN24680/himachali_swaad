# Test cases — admin UI: waitlist (`/waitlist`)

Module `apps/admin/src/modules/waitlist` · contract `AdminWaitlistResponseSchema` (`packages/shared/src/contracts/waitlist.ts`) · endpoints `GET /api/v1/admin/waitlist`, `GET /api/v1/admin/waitlist/export.csv` · audit 2026-11-03 R-5. Server side: `backend-waitlist.md`.
Automated: `pnpm --filter @pk/admin test:e2e -- tests/e2e/waitlist.spec.ts` (375 / 768 / 1440; every mocked list response is parsed through the shared schema).

| ID | Area | Precondition | Steps | Expected | Automated test (file › name) | Manual? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| AWL-01 | List (positive) | ADMIN, 32 entries | Open `/waitlist` | Header total, KPI cards, columns Joined / Name / Phone / E-mail / Source badge / Consent (cards on phone), "Showing 1–25 of 32", no horizontal overflow, table scrolls inside its card | `waitlist.spec.ts › renders rows, totals, source badges and pagination; no horizontal overflow (light)` · `(dark)` | — |
| AWL-02 | Pagination | 32 entries | Next page | `page=2&pageSize=25` sent, URL `?page=2`, "Showing 26–32 of 32" | same test | — |
| AWL-03 | Search | — | Type `person1` | `q=person1` sent, URL `?q=person1`, page reset, "N people match"; clear restores | `waitlist.spec.ts › search sends q, filters rows and lives in the URL; clearing restores the list` | — |
| AWL-04 | Source filter | — | Storefront / Coming soon / All pills | `source=` sent / removed, URL synced, counts match; no-match search → "No one matches" + Clear filters | `waitlist.spec.ts › source filter pills send source=…; "All" removes it; no match → clear filters` | — |
| AWL-05 | Empty state | 0 entries | Open | "No one on the list yet" + link to the storefront coming-soon page (new tab) | `waitlist.spec.ts › empty state points at the coming-soon page` | — |
| AWL-06 | Error state (negative) | List 500 | Open, fix API, Try again | Alert with server message, retry recovers | `waitlist.spec.ts › error state with retry recovers once the API answers` | — |
| AWL-07 | Export CSV | — | Export CSV | `fetch` with credentials + `Accept: text/csv`, saved as the server's Content-Disposition name, success toast with PII reminder | `waitlist.spec.ts › Export CSV fetches the export with credentials and saves the server file name` | — |
| AWL-08 | Export failure (negative) | Export 500 | Export CSV | "Export failed" toast with the server message | `waitlist.spec.ts › a failed export shows a toast with the server message` | — |
| AWL-09 | RBAC (abuse) | KITCHEN_PARTNER | Open `/waitlist` | Role guard "This page isn't part of your role", no Waitlist nav item (API also refuses — backend tests) | `waitlist.spec.ts › KITCHEN_PARTNER is refused by the role guard and has no Waitlist nav item` | — |
| AWL-10 | Navigation | ADMIN | Look at nav | "Waitlist" next to Customers (behind "More" on phones), active state on the page | `waitlist.spec.ts › ADMIN sees "Waitlist" in the navigation next to Customers` | — |
| AWL-11 | Loading skeleton | Slow API | Open | Table skeleton + KPI skeletons, no layout jump | — | Yes |
| AWL-12 | Touch targets | 375 px | Inspect pills, pagination, phone / e-mail links | ≥ 44 px | — | Yes |
| AWL-13 | Regression: customers list unaffected | ADMIN | Open `/customers` | Unchanged (same `customers:read` gate) | `admin-pages.spec.ts › every admin page renders the 3-tier layout without overflow (light)` · `› KITCHEN_PARTNER cannot reach any admin console route (UX guard; API answers 403)` | — |
