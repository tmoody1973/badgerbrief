# MOO-411 — Rebuild `/compare/[slug]` issue-by-issue

**Date:** 2026-07-25 · **Issue:** [MOO-411](https://linear.app/moodyco/issue/MOO-411) (parent epic MOO-409) · **Priority:** High

## Problem

`/compare/[slug]` is the one tool built to help an undecided voter choose, and it
fails. It renders a candidate×column table (Candidate / Party / Occupation /
Stated priorities) fed by thin `keyPriorities` (≤3 bullets), so ~14 of 18
governor candidates show only dashes. Meanwhile the richest data on the site —
the ~10 **sourced** `candidate_positions_published` rows per marquee candidate,
already shown on `/candidates/[slug]` — never reaches the compare tool. A voter
cannot see where candidates clash on an issue.

## Goal

Restructure the page around **issues, not candidates**: group by issue, show
each candidate's sourced stance under it, real side-by-side. Label missing data
honestly. Source-linked, non-partisan (no scoring/ranking). Mobile-first.

## Scope / non-goals

- **In scope:** frontend rebuild of `src/app/compare/[slug]/page.tsx` + one pure
  grouping helper + its unit test.
- **Out of scope:** any Convex query or schema change (the data is already
  returned by `getRace`), the issue-alignment on-ramp (MOO-412), filling data
  gaps or the site-wide "no sourced positions yet" labeling beyond this page
  (MOO-413), and the `/es` locale variant (deferred with the i18n thread).

## Data — already available, no backend change

`getRace(raceId)` (via `src/lib/data.ts` → `api.public.getRace`) already returns:

- `race` — `office`, `dataAsOf`, `raceId`, …
- `candidates[]` — `{ slug, name, party, incumbent, currentOccupation }`
- `positions[]` — every `candidate_positions_published` row for the race:
  `{ _id, candidateSlug, issueSlug, stance, summary, sources[], confidence }`
  where `stance ∈ {support, oppose, mixed, evolving, unclear}`.

The page currently ignores `positions` entirely. The rebuild just consumes it.

## Components

### 1. Grouping helper (the only non-trivial logic → unit-tested)

New pure function, `src/lib/compare.ts`:

```ts
buildIssueComparison(candidates, positions) => {
  issues: Array<{
    issueSlug: string;
    label: string;                    // display label from slug
    onRecord: Array<{ candidate, position }>;  // alpha by last name
    noRecord: Candidate[];            // alpha by last name
  }>;                                 // sorted by onRecord.length desc, then label asc
  totalOnRecord: number;              // for empty-state decision
}
```

Rules:
- Group `positions` by `issueSlug`.
- For each issue: `onRecord` = candidates who have a position on it; `noRecord` =
  every other candidate in the race. Both sorted **alphabetically by last name**
  (last whitespace-separated token, case-insensitive), consistent across issues.
- Sort issues by `onRecord.length` descending (most comparable first), tiebreak
  by `label` ascending.
- If a candidate somehow has two rows for one issue, keep the first after sort
  (positions are published one-per-candidate-per-issue by pipeline; guard, don't
  crash). `// ponytail:` note it.
- `label`: title-case the slug (`"gun-policy"` → `"Gun Policy"`). Keep the raw
  slug available for the anchor id.

**Test** (`src/lib/compare.test.ts`, `// @vitest-environment node` not needed —
pure, no next imports): a fixture with 3 candidates and positions across 2 issues
asserts issue sort order (coverage desc), candidate alpha order, and that a
candidate with no position lands in `noRecord`.

### 2. Page rebuild (`src/app/compare/[slug]/page.tsx`)

- Keep `revalidate = 300`, `generateStaticParams`, `getRace`, JSON-LD breadcrumb,
  the `← {office}` back link, and the `LastUpdated` footer.
- Header: `How do the {office} candidates compare?` + one-line intro that states
  positions are sourced and this is not a ranking.
- **SectionNav** (reuse `@/components/guide/section-nav`): one entry per issue,
  `label` = issue label, `count` = `onRecord.length`. Same sticky jump-nav used
  on race/candidate pages (MOO-329/399).
- **Per-issue `<section>`** (`id={issueSlug}`, `scroll-mt-16`):
  - Heading = issue label.
  - Grid of candidate cards — `grid gap-3 sm:grid-cols-2 xl:grid-cols-3`,
    stacked on mobile. Each card (reusing the neo-brutalist card treatment from
    the candidate page positions section): candidate name (link to
    `/candidates/{slug}`) + `PartyBadge` + incumbent tag, a stance badge
    (`support`/`oppose`/… styled like the candidate page's stance chip), the
    `summary`, and `<SourceList sources={position.sources} collapsible />`.
  - Below the grid, a compact honest line for `noRecord`:
    `No position on record: Name, Name, …` — show first ~3 names inline, fold the
    rest behind a `<details>` (`+N more`). Never a silent blank.
- **Empty state** (`totalOnRecord === 0`): render the page shell + a clear panel:
  *"No sourced positions on record yet for these candidates."* with a link back to
  the race page, instead of the issue sections. (Honest-labeling; deeper cross-site
  treatment is MOO-413.) The page still renders (not `notFound`) so the URL stays
  valid and indexable, matching how sparse candidate pages are handled today.
- Update `generateMetadata` description to reflect the issue-by-issue comparison
  and drop the "stated priorities" framing.

### 3. Reuse, don't rebuild

- `SectionNav`, `SourceList` (collapsible), `PartyBadge`, `LastUpdated` — all
  exist and are already the site's idiom. Stance badge styling is copied from the
  candidate page positions block (a `<span>` with the mono-uppercase treatment) —
  extract only if it's needed a third time (YAGNI).

## Data flow

`ComparePage` → `getRace(raceId)` → `buildIssueComparison(candidates, positions)`
→ render SectionNav + sections. All at build/ISR time (static, CDN-cacheable —
same posture as the current page, no cookies/auth).

## Error handling / edge cases

- `getRace` null or zero candidates → `notFound()` (unchanged).
- Race has candidates but zero positions → empty-state panel (above), not 404.
- A candidate in `positions` but not in `candidates[]` (stale slug) → ignored by
  the helper (we drive `onRecord`/`noRecord` off the race's candidate list).
- Names with one token or suffixes ("Jr.") → last-token sort is a known
  approximation; `// ponytail:` note, upgrade only if a real ordering complaint
  appears.

## Testing

- Unit: `buildIssueComparison` (sort orders + gap classification), per the fixture
  above. `npx vitest run src/lib/compare.test.ts`.
- Manual/live verify (per handoff §4): build, then curl `/compare/governor`
  (marquee race, has data) and a sparse race — confirm 200, `public` cache header,
  issue sections render with sourced summaries, gaps labeled, no partisan grouping.

## Non-partisan guardrails (explicit)

- No scoring, ranking, "best match", or agreement %. Ordering is by data coverage
  and alphabetical only — never by candidate merit.
- Every stance shown is a sourced summary linking to its source; nothing is
  BadgerBrief's characterization.
