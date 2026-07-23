# Voting-record UX redesign + bill enrichment — design

**Date:** 2026-07-23 · **Status:** approved-pending-review · **Skill for build:** `/impeccable` (Phase 1 UI), standard ingest work (Phase 2 data)

## Problem

`VotingRecord` (`src/components/guide/voting-record.tsx`) was built when a legislator held a handful of votes. It shows 5 rows, then one `<details>` that dumps every remaining vote into a single flat `<ol>`. After the pre-2019 ingest the counts are:

| Candidate | Votes | Sessions |
|---|---|---|
| JoCasta Zamarripa | 2,043 | 2011, 2013, 2015, 2017, 2019 |
| Brett Hulsey | 1,125 | 2011, 2013 |
| Mandela Barnes | 823 | 2013, 2015 |
| David Crowley | 515 | 2017, 2019 |

Three concrete failures:
1. **Unusable list.** "Show all 2,043 votes" renders 2,000+ near-identical `<li>` as one undifferentiated wall — no sessions, no filter, no search.
2. **Payload bloat.** `public:getCandidateBySlug` ships *every* row inline. Barnes's page payload measured **592 KB**; Zamarripa's is ~1.5 MB — on every load.
3. **No context on the vote itself.** A row names the bill (`AB 388 · CHILD CARE CENTER RENOVATIONS LOAN PROGRAM`) but never says what the bill *does*, and links only to the roll call, not the bill.

## Goals (chosen by Tarik)

- **Scannability** — a 2,000-row record must be skimmable and searchable.
- **Neutral signal** — scannable aggregates that involve zero editorial judgment.
- **Payload/perf** — stop shipping 1,000+ vote objects per page load.
- **Bill context** — a short summary of each bill + a link to the full bill.

## Hard constraints

- **Neutrality is load-bearing.** The current component's doc comment states the rule: selection is *recency, stated as such*, and *"we don't rate or score votes."* The schema echoes it: titles/vote types are *"verbatim, never paraphrased."* Therefore:
  - No "key votes," no importance ranking, no AI-written summaries.
  - Aggregates are pure arithmetic (counts, rates), framed as facts, never as good/bad.
  - Bill summaries are the **Legislative Reference Bureau (LRB) analysis** — the Legislature's own official, neutral plain-language description — quoted and attributed, never generated or paraphrased.
- **Established design system.** Neo-brutalist: `border-2 border-border`, `shadow-[var(--shadow-brutal)]`, mono uppercase labels. Reuse `StatTile` (`src/components/guide/stat-tile.tsx`), the `SectionNav` pattern, and the collapsible-fold idiom already in `src/components/guide/`.
- **Folding only helps repetitive content** (project scroll-UX lesson). 2,043 roll-call rows are the most repetitive content on the site — this is where progressive disclosure pays off.

## Locked design decisions (from brainstorm)

1. **Direction A — inline accordion.** The full record stays on the candidate page (not a separate route).
2. **Default view — summary + newest session open.** Summary tiles always on top; the most-recent session is pre-expanded to its first ~25 votes with filter chips + bill search visible; older sessions collapsed with counts.
3. **Rows compact; summary on expand/hover.** The LRB one-liner (first sentence) is revealed per-row on expand (tap) or hover (desktop), with "Full bill ↗" to the complete analysis. The default row stays: `billNumber · voteType · date` / title / `Voted X · A ayes, N nays` / links.
4. **One spec, two phases; Phase 1 ships first.**

## Phase 1 — Voting-record UX + payload fix

### Data layer (Convex)

Two new public queries replace the single inline list. `legislator_votes` holds `{ voteKey, candidateSlug, position }`; `voteKey` is `"{session}-{chamber}-{voteId}"`, so **session and chamber are derivable from the key without a join**.

**`public:votingRecordSummary({ candidateSlug })`** → 
```ts
{
  total: number,
  byPosition: { aye: number; nay: number; not_voting: number },
  participationRate: number,        // (aye + nay) / total, 0..1 — mechanical
  sessions: { session: string; count: number }[], // desc by session
  chamber: "assembly" | "senate",
}
```
Reads `legislator_votes` by the `by_candidate` index (lightweight rows: key + position), buckets by `voteKey.split("-")[0]`. No join. ~2,043 small reads worst case — within Convex limits.

**`public:votingRecordPage({ candidateSlug, session, offset?, position?, query? })`** →
```ts
{ rows: VoteRow[], total: number, nextOffset: number | null }
```
- Requires a new index to page by session. Add `session` to `legislator_votes` and index `by_candidate_session` (`candidateSlug`, `session`). See migration below.
- Reads that session's rows (indexed), joins `legislative_votes` by `by_voteKey` for metadata, joins `bills` (Phase 2) by `by_session_bill` for `summary` + `billUrl`.
- Applies `position` filter and `query` (reuse the whole-word word-set matcher already in `votesQueries.votingRecord`) **server-side**, sorts (final votes first, then newest — same as today), then slices `[offset, offset + PAGE]` (`PAGE = 25`). Offset-based load-more; a single session is ≤705 rows so reading it whole to filter is acceptable.
- `VoteRow` = today's shape (`billNumber, billTitle, voteType, votedOn, chamber, session, position, ayes, nays, sourceUrl, otherVotesOnBill`) **plus** `summary: string | null` and `billUrl: string | null`.

**Migration** (`legislator_votes.session`): add the field; `storeRollCall` already knows the session at ingest — set it going forward. One-time backfill mutation parses `voteKey` on existing rows. Both are idempotent. Do this before the paginated query goes live.

**`getCandidateBySlug` change:** stop embedding the full `votingRecord` array; return the small `votingRecordSummary` object in its place (used for the SectionNav count and the tiles). Pagination stays out of `getCandidateBySlug` — the `VotingRecord` server shell, given the summary, calls `votingRecordPage` itself for the newest session's first page during SSR. The SectionNav count (`page.tsx:114`) switches from `votingRecord.length` to `summary.total`; the section renders only when `summary.total > 0`.

### Component

`VotingRecord` splits into a server shell + a client island (RSC + client-island pattern):
- **Server shell** renders the summary `StatTile` row (SSR — good for first paint and SEO) and SSRs the first page of the newest session (via `votingRecordPage`). Zero interactivity, zero client JS for the summary.
- **Client island `VotingRecordSessions`** (`"use client"`) owns: session expand/collapse, lazy-fetching each session's pages on first open (Convex `useQuery`), the filter chips (All / Voted yes / Voted no / Didn't vote), the in-session bill search input (debounced; re-queries with `query`), "load N more" (increments `offset`), and per-row summary expand.
- Summaries for a loaded page arrive in that page's payload (first sentence only, ~150 chars × 25 ≈ 4 KB/page — trivial); the full analysis stays behind "Full bill ↗". Initial payload = summary + 25 newest rows, not 2,043.

### Layout / responsive

- Summary tiles: a `StatTile` row (total, yes, no, didn't-vote, participation). Follow the existing candidate-page grid (`max-w-6xl`, main `col-span-8`); tiles wrap responsively, pass an explicit layout prop rather than trusting `sm:`/`md:` inside the narrow column (documented container-query trap).
- Session groups: collapsible sections with a mono count header, `scroll-mt-16` so headings clear the sticky `SectionNav`.
- Keep the single-card, dashed-divider row idiom (`divide-y-2 divide-dashed`).

### Empty / edge states

- Zero votes → render nothing (unchanged).
- A session whose `position`/`query` filter yields no rows → a quiet "No votes match" line, not an empty card.
- Search that matches nothing across the open session → same quiet line + a "clear search" affordance.

### Testing (Phase 1)

- `votingRecordSummary`: totals and per-session counts reconcile against a seeded fixture set (e.g. counts sum to `total`; participation = (aye+nay)/total).
- `votingRecordPage`: paging is exhaustive and non-overlapping (union of pages = full session, no dupes); `position` and `query` filters reduce correctly; `nextOffset` null exactly at the end.
- Migration backfill: every existing `legislator_votes` row gets the correct `session` (parsed key == joined `legislative_votes.session`).
- Component: newest session open by default; older sessions lazy-load on expand; SectionNav count uses `summary.total`.

## Phase 2 — Bill enrichment (LRB summary + full-bill link)

### Source (verified)

`https://docs.legis.wisconsin.gov/{session}/related/proposals/{billnumber}` (billNumber lowercased, spaces removed: `AB 388` → `ab388`) returns HTTP 200 with an **"Analysis by the Legislative Reference Bureau"** section — a neutral official plain-language description. Verified on 2023 AB 388. The bill URL is deterministic, so "link to full bill" needs no fetch.

### Data + ingest

- **`bills` table:** `{ session, billNumber, billUrl, summary: string | null, fetchedAt: number }`, index `by_session_bill` (`session`, `billNumber`). `summary` = first sentence of the LRB analysis; `null` when there is no analysis.
- **`bills:enrich` action** (`"use node"`): collect distinct `(session, billNumber)` from `legislative_votes`; for each not already in `bills`, construct the URL, fetch, parse the first sentence of the LRB analysis, store. Dedup means one fetch per unique bill (~1,000–1,500 total, not per-vote). Runs as a **one-time backfill** then a **weekly cron** alongside the existing `votes:ingest` cron, so new bills self-enrich.
- **Graceful fallbacks:** resolutions (AJR/SJR/AR/SR) and any bill with no analysis section store `summary: null` (+ `billUrl`); the row shows title + "Full bill ↗" with no summary line. A fetch failure leaves the bill un-enriched; the page query simply returns `summary: null` until the next cron.

### UI

`votingRecordPage` joins `bills`; each row gains the expand/hover summary + "Full bill ↗". Rows whose bill isn't enriched yet degrade to exactly today's row + a bill link — never a broken or empty summary.

### Testing (Phase 2)

- LRB first-sentence parser: fixtures for a bill *with* analysis, a bill *without*, and a resolution → correct summary / null. Commit fixture HTML like the roll-call fixtures.
- URL builder: `AB 388`/`SB 330`/`AJR 15` → correct lowercased no-space paths.
- Enrichment idempotency: re-running `bills:enrich` fetches only bills absent from `bills`.

## Out of scope / future

- Cross-session search (search spans only the open session for now; a global search is a later server-side add).
- Virtualized rendering (offset load-more keeps the DOM bounded without it).
- Federal voting records (MOO-396, separate source).
- Storing the full LRB analysis text (we link to it instead of duplicating it).

## Sequencing

1. Phase 1 data layer (migration + two queries) → component split → verify payload drop and record usability. **Ship.**
2. Phase 2 `bills` table + enrich action + backfill + cron → wire summary/link into the row. **Ship.**
