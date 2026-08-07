# Donor Explorer — Full Drill-Down for Voters & Journalists — Design

**Date:** 2026-08-07 · **Target:** ship before the Aug 11 primary
**Builds on:** `2026-08-06-finance-drilldown-design.md` (breakdowns, `CATEGORY_META`, pac-tags, import pipeline)

## Goal

The funding-mix drill-down stops at top-10 donors per category. Voters and
journalists need the whole picture: every reported donor per candidate
(searchable, sortable, filterable), cross-candidate donor profiles ("who else
did this donor fund"), transaction-level gift detail, CSV export, and the
voter chat answering donor questions from the same data. Decisions made
during brainstorming: in-place roster + donor pages now with a `/money` hub
layering on the same queries later; all donors get pages but pages are
noindex (public record on-site, not Google-surfaced); ships before the
primary.

## Data model

One new Convex table, one doc per (donor, candidate, source), gifts embedded:

```ts
donor_totals: defineTable({
  donorKey: v.string(),      // lowercase, whitespace-collapsed exact reported name — no fuzzy merging
  donorName: v.string(),     // display form as first reported
  candidateSlug: v.string(),
  raceId: v.string(),
  source: v.union(v.literal("openfec"), v.literal("sunshine")),
  category: v.string(),      // same assignment as finance_breakdowns (shared categoryFor + pac-tags)
  location: v.optional(v.string()),  // "City, ST"
  state: v.optional(v.string()),     // normalized (e.g. "WI") for filtering
  total: v.number(),
  giftCount: v.number(),     // transactions for THIS donor (not "count": avoids clash with breakdowns' donor-counts)
  gifts: v.array(v.object({ date: v.optional(v.string()), amount: v.number() })),
  giftsTruncated: v.optional(v.boolean()), // gifts capped at 500 newest; flag set when capped
  coverageEndDate: v.optional(v.string()),
  fetchedAt: v.number(),
})
.index("by_candidate_total", ["raceId", "candidateSlug", "total"])
.index("by_donor", ["donorKey"])
.searchIndex("search_name", { searchField: "donorName", filterFields: ["raceId", "candidateSlug"] })
```

- Volume ≈ 40–60k docs across the 13 tracked state committees.
- Different reported spellings of the same person remain separate donors,
  disclosed in the UI — never merged by code.
- Same-named different people collide on `donorKey` — inherent to the public
  record; the disclosure line covers it.

## Import pipeline

- `computeDonorRosters(csvText, pacTags, { cycle })` — new pure function in
  `scripts/lib/breakdowns.mjs`'s module family (new file `scripts/lib/donors.mjs`),
  REUSING exported helpers (`categoryFor`-equivalent, state normalization,
  cycle filter) from `breakdowns.mjs` rather than duplicating them. Returns
  `Map<committeeName, donorDoc[]>` (docs minus candidateSlug/raceId/source/
  coverageEndDate/fetchedAt). Gifts sorted date-ascending, capped at the 500
  newest with `giftsTruncated: true`.
- `scripts/import-sunshine-donors.mjs` — house-pattern CLI:
  `node scripts/import-sunshine-donors.mjs <export.csv> [--prod] [--coverage <label>]`.
  Per matched committee: clear-then-insert.
- Convex internals in `convex/finance.ts`:
  - `finance:clearDonors({ raceId, candidateSlug, source })` — deletes up to
    1,000 rows per call, returns `{ deleted, done }`; CLI loops until done.
  - `finance:insertDonors({ docs })` — inserts a batch (≤500), stamping
    `fetchedAt`.
- Verification output: per-candidate donor count + top donor, eyeballable at
  import time like the takeaway gate.

## Queries — new `convex/donors.ts` (public, read-only, indexed-only)

- `roster({ raceId, candidateSlug, paginationOpts })` — paginated (50/page)
  off `by_candidate_total` descending.
- `searchRoster({ raceId, candidateSlug, term })` — search index, top 20.
- `profile({ donorKey })` — rows via `by_donor` + computed grand total.
- `searchDonors({ term })` — global name search (donor lookup now; `/money`
  hub later).
- `rosterCount({ raceId, candidateSlug })` — donor count for the
  "See all N donors" button (0 → button hidden).

## CSV export

`src/app/api/donors/route.ts` — `GET /api/donors?race=…&candidate=…` walks
the paginated roster server-side and streams `text/csv`: donor, category,
location, total, giftCount, first gift date, last gift date. First line is a
comment row carrying the coverage label and "Data: WI Ethics Commission
(Sunshine) — non-commercial use per Wis. Stat. § 11.1304(12)". Params
validated against known race/candidate values; anything else → 400. No auth
(public record).

## UI

**Roster (in place):** "See all {N} donors" button at the bottom of the
candidate money section opens `DonorRoster` (new client component,
`src/components/guide/donorRoster.tsx`): search-as-you-type, category filter
chips using `CATEGORY_META` colors/labels, sorted by total, "Load more"
pagination via `usePaginatedQuery`, CSV download link, coverage line. Donor
names link to donor pages. Candidate with no roster rows → button absent,
page identical to today (federal candidates unchanged).

**Donor pages:** `/donors/[donorKey]` — server-rendered, `robots: { index:
false }`, excluded from sitemap. Header: display name, location, grand total
across tracked races. Body: one card per candidate (total, gift count, link),
then a gifts table (date · amount · candidate) newest-first with a truncation
note when `giftsTruncated`. Footer disclosure: "Names appear exactly as
reported to the WI Ethics Commission; the same person may appear under
multiple spellings" + source/statute + coverage label. Unknown key → "no
donor found" + global donor search box.

## Voter chat

New `convex/financeChatTools.ts` exporting two read-only `createTool`s in the
house style (withToolSpan telemetry, zod args):

- `getCandidateDonors({ candidateSlug, searchTerm?, category? })` → top 15
  matching donors with totals, the candidate's breakdown takeaways, the
  candidate page URL, and the coverage label.
- `getDonorProfile({ donorName })` → resolves via the search index to exact
  keys; returns cross-candidate giving + donor page URL; multiple matching
  spellings returned as separate entries, never merged.

`convex/voterHelp.ts` changes are minimal: one import, two entries in the
agent's `tools` list, two instruction rules — donor facts come ONLY from
these tools and cite their URLs; donor numbers always state the coverage
window. **Eval gate:** add 3 golden questions (who funds Crowley; has WEAC
PAC given to anyone; Hong's biggest donors) to the golden set;
`scripts/eval-gate.mjs` must score ≥ the current `sonnet-5-tuned` baseline
before ship. Note: the working tree has an unrelated uncommitted voterHelp.ts
edit — implementation happens in a worktree from committed HEAD; the ~4-line
change may need a trivial manual merge when that edit lands.

## Edge cases & invariants

- Category assignment shares code with breakdowns — a donor's category can
  never disagree between the mix bar and the roster.
- All queries indexed-only; no table scans.
- Gifts cap (500) keeps docs far under Convex limits; truncation is flagged,
  totals remain exact (computed from all transactions, not the capped list).
- Roster empty-state renders nothing; noindex pages stay out of the sitemap.
- Coverage label travels everywhere donor numbers appear (roster, donor page,
  CSV comment, chat tool output).

## Testing

- `scripts/lib/donors` unit tests: aggregation across gifts, donorKey
  normalization (case/whitespace), gifts cap + truncation flag + exact total,
  category parity with `computeBreakdowns` on a shared fixture.
- `convex-test`: roster pagination order (descending total), clearDonors loop
  semantics (returns done only when empty), profile grand total, insertDonors
  batch stamping.
- Export route: param validation (400 on unknown), CSV shape on a seeded
  candidate.
- Chat: eval gate run ≥ baseline is the test.
- Process: subagent-per-task with per-task reviews and a final whole-branch
  review, as with the breakdowns build.

## Out of scope

`/money` hub UI (queries are designed for it; page comes later) · fuzzy donor
identity resolution · federal (OpenFEC) rosters · donor pages in the sitemap
or search engines · write access of any kind from chat tools.
