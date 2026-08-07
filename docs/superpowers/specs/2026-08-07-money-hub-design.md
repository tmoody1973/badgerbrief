# /money Hub — Design

**Date:** 2026-08-07 · **Target:** ship before the Aug 11 primary
**Builds on:** `2026-08-07-donor-explorer-design.md` (donor_totals, searchDonors, MixBarMini/MixLegend, donor pages)

## Goal

The donor explorer is only reachable through candidate pages. `/money` makes it
a destination: a site-wide donor search plus a one-screen "follow the money"
overview of every state race, linked from the header nav. Indexable (unlike
donor pages) — it is the discovery surface.

## Data

One new public query in `convex/donors.ts`:

- `raceMoney({})` → `[{ raceId, office, candidates: [{ slug, name, receipts,
  categories, coverageEndDate }] }]`
  - Collects `finance_totals` (small table, ~30 rows), filters `source ===
    "sunshine"`, groups by raceId.
  - Joins candidate names via `candidates.by_race` and breakdown `categories`
    via `finance_breakdowns.by_candidate` (indexed per race).
  - Candidates sorted by receipts descending within each race; races sorted
    governor-first (fixed prominence order: WI-GOV-2026, WI-AG-2026,
    WI-LTGOV-2026, WI-SOS-2026, WI-TREAS-2026; unknown raceIds appended).
  - Federal races (openfec-only) are absent by construction.

## Page — `src/app/money/page.tsx`

Server component, `revalidate = 300`, **indexable** (normal metadata, no
robots restriction) and added to `src/app/sitemap.ts`.

Top to bottom:
1. Title + one-line explainer ("Who funds Wisconsin's 2026 campaigns — every
   reported donor, searchable.").
2. **Donor search** — new client island `src/components/guide/donorSearch.tsx`:
   input (aria-labeled) + `api.donors.searchDonors` gated at ≥2 chars (same
   convention as the roster search, no debounce); results list shows
   donorName, location, total, category dot (CATEGORY_META), each linking to
   `/donors/{encodeURIComponent(donorKey)}`. Empty states reuse the roster's
   message conventions.
3. **Race money cards** — one card per `raceMoney` race: office name heading;
   `MixLegend` rendered once above all cards; per-candidate rows (name →
   `/candidates/{slug}`, `MixBarMini` from categories or the `—` fallback,
   receipts via the shared `fmt`); card footer links to the race page's money
   section (`/races/{raceId.toLowerCase()}#money`).
4. Footer: coverage label (single distinct value across rows, same
   omit-when-mixed rule as donor pages) + WI Ethics source/statute note.

## Nav

`chrome.tsx`: "Money" link beside Races and Candidates, same styling.

## Edge cases & invariants

- Candidate without a breakdown doc → row renders with `—` instead of a mini
  bar (race-table convention).
- Empty `raceMoney` (pre-import) → cards section renders a single muted
  "Money data is being updated." line; search still works.
- Colors/labels only via `CATEGORY_META`/`MixBarMini`/`MixLegend` — no drift.
- Donor pages stay noindex; only the hub is indexable.

## Testing

- convex-test for `raceMoney`: seeded totals/candidates/breakdowns → grouped
  shape, sunshine-only filter, receipts-desc candidate order, governor-first
  race order.
- tsc + full vitest; live post-deploy checks: nav link present on home, search
  round-trip to a donor page, cards render with mini bars, `/money` in
  sitemap.xml, donor pages still noindex.

## Out of scope

Big-donor leaderboard · federal money cards · any change to donor pages,
rosters, CSV, or chat tools.
