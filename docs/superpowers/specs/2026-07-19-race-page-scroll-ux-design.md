# Race-page scroll UX — design (2026-07-19)

## Problem

The race page is a single vertical column with no in-page navigation. Measured
on prod (`/races/wi-gov-2026`): **5.8 screens of scrolling at 390×844**, 3.3 at
1280×800. The bulk is 13 full-width candidate cards stacked one per row on
mobile, five of which are people who aren't on the Aug 11 ballot, shown at
equal weight. User-confirmed pain: both jumpability ("can't skip to what I
want") and density ("pages feel endless"). Scope decision: **race page only**,
as a pattern-proof before the Aug 4 launch; other pages follow post-launch if
the pattern earns it.

## Design (approach A: jump nav + compact rosters + not-on-ballot fold)

### 1. `RaceSectionNav` — sticky in-page jump nav

- New client component `src/components/guide/race-section-nav.tsx`, rendered
  only by the race page, sticky directly under the page top (`sticky top-0
  z-40`), horizontally scrollable chip row on mobile.
- Chips: one per party section present, plus `The money` and `Sources` —
  e.g. `Democrats (7) · Republicans (2) · Independent · The money · Sources`.
- Chip counts = **on-ballot candidates only** (see §3 classifier).
- Plain anchor links (`#democratic-primary`, `#republican-primary`,
  `#independent`, `#money`, `#sources`). No scroll-spy/IntersectionObserver in
  v1 — chips don't highlight the active section.
- Target sections get `scroll-mt-*` (scroll-margin-top) equal to the nav
  height so anchored headings are never hidden under the sticky bar.
- Section ids derived from the party name via a small slug helper shared
  between the page (ids) and the nav (hrefs).

### 2. Compact candidate tiles

- `CandidateCard` in `src/components/guide/cards.tsx` gains a
  `variant?: "full" | "compact"` prop (default `"full"` — no behavior change
  for existing call sites).
- `compact`: tighter padding, name + `PartyBadge` + `StatusBadge` +
  occupation clamped to one line (`truncate`). Still a full-card `<Link>` to
  the candidate page.
- Race page grids change from `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` to
  `grid grid-cols-2 gap-3 lg:grid-cols-3` with `minmax(0,1fr)` track behavior
  (Tailwind `grid-cols-2` already emits `minmax(0,1fr)`); cards must not
  overflow at 320px (long names wrap inside the tile, `min-w-0`).

### 3. Not-on-ballot fold + classifier

- New pure helper `isOnBallot(status?: string): boolean` in a new
  `src/lib/ballot-status.ts` (`districts.ts` stays pure district math; the
  string heuristic intentionally mirrors `StatusBadge`'s label logic): returns `false` only when the status contains
  "not on" or "did not file" (case-insensitive); `true` otherwise
  (undefined, Active, Withdrawn, Suspended → `true`).
- **Accuracy rule (from the MOO-314 WEC verification): Withdrawn (Rodriguez)
  and Suspended (Hughes) candidates remain in the visible grid with their
  badges** — they are on the printed ballot per WEC's official contest list.
  Only did-not-file/not-on-ballot candidates fold.
- Per party section: on-ballot candidates render in the compact grid;
  not-on-ballot candidates render inside a single collapsed
  `<details>` — summary: `Not on the Aug 11 ballot (N)` — using the same
  compact tiles when open. Native `<details>`, no JS.
- All content stays in the DOM (SEO and find-in-page unaffected).

### 4. Finance table: top 5 + show all

- `RaceFinanceTable` renders the top 5 rows (already sorted by receipts);
  remaining rows go inside a native `<details>` with summary
  `Show all N candidates`. No change when N ≤ 5. Section gets `id="money"`.

### 5. Unchanged

Header, rating chips, "why this race matters", compare link, `SourceList`
(`id="sources"` added), all data fetching, all other pages, no new
dependencies, existing design tokens only.

## Error handling / edge cases

- Race with no partisan sections (nonPartisan only): nav renders
  `Candidates · The money · Sources`.
- Party with zero on-ballot candidates but some folded: section still renders
  with the fold; chip count shows `(0)` — acceptable, truthful.
- Races with ≤ 5 candidates and ≤ 5 finance rows: page renders exactly as
  today minus the card-size change; folds/`show all` don't appear.
- No-finance races: `RaceFinanceTable` already returns null; nav omits
  `The money` chip when `finance` is empty.

## Testing & verification

- Unit: `isOnBallot` — Active/undefined/Withdrawn/Suspended → true;
  "Did not file by June 1, 2026 deadline — not on primary ballot" → false.
- Full suite green (`npx vitest run`), `tsc --noEmit`, `next build`.
- Live (Playwright, prod after deploy):
  - `/races/wi-gov-2026` at 390×844: **≤ 3 screens** of scroll (from 5.8);
    at 1280×800: ≤ 2.5 (from 3.3).
  - Tapping each nav chip lands with the section heading visible (not under
    the sticky bar).
  - No horizontal scroll at 320/390; tile tap targets don't wrap to
    unreadable multi-line buttons.
  - Rodriguez and Hughes visible in the Democratic grid; Jacobson, Hulsey,
    Roper, Strnad inside the fold.
- Frontend-only change: eval gate not required (no agent prompt/model change).

## Out of scope

Other pages (home, candidate, /vote, compare) — pattern rollout is a
post-launch decision. Scroll-spy active-chip highlighting. Tabs. Any data
model change.
