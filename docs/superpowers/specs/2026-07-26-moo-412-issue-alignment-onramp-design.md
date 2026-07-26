# MOO-412 — Issue-alignment on-ramp ("what matters to you?")

**Date:** 2026-07-26 · **Issue:** [MOO-412](https://linear.app/moodyco/issue/MOO-412) (parent epic MOO-409) · **Priority:** High

## Problem

A lost, undecided voter has no on-ramp. Every existing surface assumes you already
know which race or candidate you're looking for. There is nothing that starts from
what a voter *cares about* and walks them to the candidates on their ballot who have
spoken to it.

## Goal

A dedicated page where a voter picks the issues they care about and sees which
candidates **on their ballot** have a **sourced position** on those issues, linked to
the source — with "no position on record" where data is missing. **Alignment, never
endorsement:** no scoring, no ranking, no "best match" — just the voter's own
priorities surfaced against candidates' own sourced positions.

## Decisions (from brainstorming)

- **Dedicated page** (proposed route `/match` — see Naming), linked from the home hero
  and the compare pages. Not folded into the home BallotFinder.
- **Statewide-first, progressive:** pick issues → immediately see results for statewide
  races (on everyone's ballot); an optional address/district step adds the voter's
  U.S. House + legislative races. No address gate.
- **Issue-primary results:** each selected issue is a section; under it, candidates with
  a sourced position grouped by their race/office, plus a "no position on record" line
  per race.

## Naming (open — confirm at spec review)

Proposed route `/match`, page title framed to avoid any "match score" reading, e.g.
*"See where the candidates on your ballot stand on what matters to you — no rankings,
no endorsements."* If `/match` reads too endorsement-like, `/issues` or `/what-matters`
are alternatives. Pick one before implementation; the plan will use `/match`.

## Race classification (verified — `src/lib/districts.ts`)

Races carry a `level` field:
- **Statewide (always on ballot):** `level === "State Executive"` (Gov, LtGov, AG, SoS,
  Treasurer) or `level === "State Judicial"` (Supreme Court).
- **District (need address):** `level === "Federal"` (U.S. House, by congressional
  district) and `level === "State Legislative"` (senate/assembly by district) —
  computed by the existing `relevantRaces(districts, races)`.

(No statewide U.S. Senate race exists in the 2026 dataset; if one is added later it is
`Federal` and would need to be included in the statewide set — noted, not built now.)

## Architecture

Client page drives two pieces of state — selected issues and (optional) districts — and
renders results reactively. Data comes from one new read-only Convex query; grouping is
a pure, unit-tested helper. No schema/data change.

### Components

**1. Convex query — `api.public.positionsForRaces({ raceIds })`** (new, in `convex/public.ts`)
- Args: `raceIds: v.array(v.string())`.
- Returns per race: `{ raceId, office, level, candidates: {slug,name,party,incumbent}[], positions: <candidate_positions_published rows> }`.
- Reuses the same reads `getRace` already does (candidates by race + positions by race),
  batched over the id list. Read-only, cacheable, no auth. Wrap in `src/lib/data.ts`
  `cached(...)` like the other public fetchers (key includes the sorted raceIds).
- **Why one query, not N `getRace` calls:** the statewide set is ~6 races and up to 3
  district races; a single batched query is one round-trip and one cache entry.

**2. Pure helper — `buildIssueMatch(races, selectedIssueSlugs)`** (new, `src/lib/issue-match.ts`)
- Input: the query's `races[]` plus the chosen issue slugs.
- Output:
  ```ts
  type IssueMatchGroup = {
    issueSlug: string;
    label: string;                          // labelForSlug (reuse from compare.ts)
    races: {                                // only races that have ≥1 candidate on record for this issue
      raceId: string; office: string;
      onRecord: { candidate, position }[];  // alpha by last name
      noRecord: Candidate[];                // alpha by last name
    }[];
  };
  buildIssueMatch(races, selectedIssueSlugs): { groups: IssueMatchGroup[]; totalOnRecord: number };
  ```
- Implementation reuses `buildIssueComparison` (from MOO-411) per race, then pivots to
  issue-primary: for each selected issue, collect each race's on/noRecord for that issue,
  drop races where no candidate in the race has a position on it (keep the section
  focused — a race with zero coverage on an issue adds only noise). Sort issue groups by
  the order the voter selected them (stable, predictable), races within a group by the
  ballot's natural order (statewide before district; then as returned).
- Extract the shared `labelForSlug` + last-name sort out of `compare.ts` into a tiny
  `src/lib/candidate-order.ts` so both helpers use one copy (targeted DRY — both files
  need it now).

**3. Issue picker — `src/components/match/issue-picker.tsx`** (client)
- Multi-select chips from `api.public.listIssueSlugs` (labels via `labelForSlug`).
- Acceptance says "pick 2–3"; allow any number, but nudge toward a few. Selection is
  local state (also reflected in the URL as `?issues=a,b,c` so results are shareable and
  survive reload — no persistence needed).

**4. Ballot step — reuse, don't rebuild.** The address→districts logic already lives in
`BallotFinder`. Extract its lookup core (address → `/api/geocode` → `Districts`, manual
fallback, saved-prefs prefill) so `/match` can use it without the RaceCard rendering.
If a clean extraction is more than a small refactor, `/match` instead renders a compact
inline address/manual-district control that calls the same `/api/geocode` endpoint and
sets local `Districts` state — the endpoint is the real reuse boundary. Districts →
`relevantRaces(districts, allRaces)` → district raceIds appended to the statewide set.

**5. Page — `src/app/match/page.tsx`** (+ a small client `MatchExperience`)
- Server page: fetch `listRaces` (for the statewide set + to pass to `relevantRaces`) and
  render the client experience. `revalidate = 300`; static shell, JSON-LD breadcrumb,
  SEO metadata (this is a new indexable route).
- Client `MatchExperience`: holds selected issues + optional districts; computes the
  active raceId set (statewide always + district when present); `useQuery`
  `positionsForRaces({ raceIds })`; runs `buildIssueMatch`; renders results issue-primary
  with the neo-brutalist candidate cards + `SourceList` (same idiom as compare), gaps as a
  "no position on record" line per race. Empty selection → a short "pick an issue to
  start" prompt. Selected issues but zero coverage → honest "none of the candidates on
  your ballot have a sourced position on these yet" + link to the data-gaps reality.

**6. Entry points:** a home hero card ("What matters to you? →" deep-linking `/match`)
and a link from each compare page ("Start from the issues you care about →").

## Data flow

`/match` (server: listRaces) → MatchExperience (client) → selected issues + optional
districts → active raceIds → `positionsForRaces({raceIds})` → `buildIssueMatch(races,
issues)` → issue-primary render. Address lookup reuses `/api/geocode`; district mapping
reuses `relevantRaces`.

## Error handling / edge cases

- No issues selected → prompt, no query fired (or fire with statewide ids but render the
  prompt; prefer not firing until ≥1 issue).
- Geocode failure / not-Wisconsin → same messaging as BallotFinder; statewide results
  still show (progressive — the address only *adds* races).
- Selected issue with zero coverage across the active ballot → honest empty line, never a
  blank.
- A candidate with a position but absent from a race's candidate list → ignored (drive
  on/noRecord off the race's candidate list, same rule as MOO-411).

## Non-partisan guardrails (explicit)

- No scoring, ranking, agreement %, "best match", or party grouping. Results are the
  voter's selected issues × their ballot's candidates' *sourced* positions, nothing more.
- Issue-group order follows the voter's own selection order; races follow ballot order;
  candidates alphabetical. No ordering implies merit.
- Every stance links to its source; "no position on record" is stated, never implied by
  omission.

## Testing

- Unit — `buildIssueMatch` (`src/lib/issue-match.test.ts`, node env): fixture with 2
  races (one statewide, one district) and positions across 3 issues; assert issue-primary
  grouping, that a race with no coverage on a selected issue is dropped from that issue's
  section, on/noRecord membership + alpha order, and `totalOnRecord`.
- Unit — the extracted `candidate-order.ts` (`labelForSlug`, last-name sort) keeps
  MOO-411's existing assertions (move them with the code).
- Manual/live — `/match?issues=abortion,healthcare`: statewide results render; add an
  address → district races appear; a zero-coverage issue shows the honest line; no body
  horizontal scroll at 375px.

## Dependencies / scope

- **Depends on** position coverage (MOO-413) for richness — the tool is honest-but-thin
  until more positions are published; that's acceptable and by design (it improves as
  drafts are approved). Not a blocker to building.
- **Out of scope:** any endorsement/scoring, `/es` locale variant (defer with i18n
  thread), persisting selections server-side (URL param is enough), and changes to the
  compare page beyond adding the entry link.
