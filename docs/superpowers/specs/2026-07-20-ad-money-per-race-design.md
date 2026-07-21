# Ad Money, By Race — design spec

**Status:** approved design, pre-implementation
**Date:** 2026-07-20
**Issue:** MOO-309 (extends the ad tracker) — presentation layer
**Depends on:** shipped Meta + Google adapters, `ads` table with `stance`, human attribution flow

## Intent

The ad tracker currently shows *what* was spent (totals, top spenders, a for/against
chart). It does not help a citizen understand **who is influencing their vote**, or
give a journalist the accountability angle. This adds a **by-race presentation** that
answers, for each race: who is being boosted vs buried, who is paying (the candidate's
own committee vs outside groups), and how far the money reaches.

**North star (in priority order, from brainstorming):**
1. *Who's influencing my vote* — citizen-first, organized by race, personalized to the user's ballot.
2. *Money vs. reality* — spend paired with reach; own money vs outside money.
3. *Where the ad war is hottest* — which races are attack wars vs positive-ad races.

**Honesty constraint (non-negotiable, BadgerBrief ethos):** we can show scale,
direction (support/attack), who's paying, and reach. We CANNOT show whether an ad
changed votes — no outcome data exists. All copy frames this as *influence/pressure*,
never *effect on results*. "Supporting/attacking" reflects the human-verified `stance`;
"outside money" is a heuristic estimate and is labeled as such.

## Scope

**In (v1 "Core"):**
- Per-race ad-money panel on the race page: candidate money cards (support $, attack $,
  reach, own-vs-outside split) — **layout B** from the mockups.
- `/ads` restructured as a by-race overview: statewide headline stats (total, outside
  money, most-attacked candidate), a "Your races" band, and race cards (spend +
  outside-money pill + for/against mini-bar) that link to each race.
- "Your races" personalization via the existing ballot-finder districts (hybrid: works
  for everyone; personalizes when an address/sign-in is present).

**Out (later fast-follows, explicitly deferred):**
- Geographic targeting ("aimed at your district") — needs storing Google `geo_targeting_included`.
- Spend-over-time / momentum — needs weeks of `ad_metrics_daily` snapshots (only ~2 days now).
- Outside-vs-candidate as a standalone leaderboard view.

## Data model

No schema changes. Everything derives from existing `ads` rows (attributed: `candidateSlug`
set, `stance` set) joined to `candidates` and `races`.

**Pure aggregation (unit-testable, no Convex):** `convex/lib/adMoney.ts`

- `isOwnCommittee(sponsor, candidateName): boolean` — sponsor (pageOrCommittee/fundingEntity)
  contains the candidate's name (reuses the same name heuristic as `defaultStance`). Own =
  the candidate's own committee; everything else is "outside."
- `rollupCandidate(ads, candidate): CandidateAdMoney` — from that candidate's attributed
  ads: `supportSpend`, `attackSpend` (range-midpoint sums), `impressions` (midpoint sum),
  `ownSpend`, `outsideSpend`, `adCount`. Support ads from the own committee count as own;
  outside support PACs + all attack ads count as outside.
- `rollupRace(ads, candidates): RaceAdMoney` — per-candidate rollups + race totals
  (`totalSpend`, `outsideSpend`, `supportShare`/`attackShare` for the mini-bar,
  `mostAttacked` slug).

Spend/impressions are ranges; aggregates use **midpoints** and are labeled "estimated."

**Convex queries (`convex/public.ts` / a new `convex/adMoney.ts` for cohesion):**
- `adMoneyForRace(raceId)` — attributed ads for the race → `rollupRace`. Used by the race page.
- `adMoneyOverview()` — all races' summaries (`rollupRace` per race, trimmed to headline
  fields) + statewide stats (total, outside, most-attacked). Bounded: iterate the ~16 races;
  read attributed ads via the `by_candidate` index per candidate, or scan `ads` once and group.
- Reuse existing `getCandidateBySlug.ads` for the candidate-page module (already shipped).

## Components

- **`RaceAdMoney`** (server component, `src/components/guide/race-ad-money.tsx`) — the
  layout-B panel: one card per candidate with For/Against numbers, reach, and an
  own-vs-outside split bar; a race-level "who's paying" takeaway line. Rendered as a
  section on `src/app/races/[slug]/page.tsx`, added to that page's `SectionNav`.
- **`AdsOverview`** (`src/app/ads/page.tsx` restructure) — statewide stat tiles (reframed:
  add "outside money" + "most-attacked"), the "Your races" band, and race cards. Keeps the
  existing searchable ad list + analytics below the fold (they stay useful).
- **`YourRaces`** band — resolves the viewer's races from ballot districts (see below) and
  renders their per-race one-liners; falls back to the existing "Find your races" ballot
  prompt when no districts are known.
- Existing `AdsAnalytics` (for/against chart, top spenders, reach-per-dollar) stays on
  `/ads` below the overview — it's the statewide detail. The new overview is the lead.

## Personalization ("Your races")

Reuse existing infrastructure — no new geocoding:
- Signed-in users: saved districts from `user_preferences` / My Brief.
- Anonymous with address entered: districts from the existing ballot-finder flow
  (`/api/geocode` → congressional/senate/assembly).
- Map districts → `raceId`s (Governor + statewide always included; plus the viewer's
  US House, State Senate, State Assembly races). Highlight those in the "Your races" band.
- No address/sign-in → render the existing "Find your races" prompt instead. Never blocks
  the statewide overview.

## Data flow

Race page: `adMoneyForRace(raceId)` (server fetch, ISR `revalidate = 300`) → `RaceAdMoney`.
`/ads`: `adMoneyOverview()` + district resolution → `AdsOverview` + `YourRaces`.
All server-rendered with ISR, matching existing pages.

## Error handling & edge cases

- Race with no attributed ads → panel renders a quiet "No ads tracked in this race yet"
  (and the race card on `/ads` shows greyed "No ads tracked yet"). Never an error.
- Ad attributed without `stance` (legacy: the one pre-`stance` ad) → excluded from
  support/attack sums; counted in `adCount` with an "unclassified" note if any exist.
- Own-vs-outside is heuristic → the split bar carries an "estimated" label; a methodology
  line links to how we classify.
- Personalization failures (geocode down, no districts) → silently fall back to the
  statewide view + ballot prompt.

## Testing

- **Unit (`convex/lib/adMoney.test.ts`, node env):** `isOwnCommittee` (name in sponsor →
  own; PAC → outside), `rollupCandidate` (support/attack/own/outside midpoint sums; missing
  bounds; no-stance excluded), `rollupRace` (totals, most-attacked, shares). Fixtures reuse
  the Governor-race shape from the mockups.
- **Convex (`convex/adMoney.test.ts`):** seed a race + candidates + attributed ads
  (support own-committee, outside attack) → `adMoneyForRace` returns correct per-candidate
  and race aggregates; `adMoneyOverview` ranks races and computes statewide outside money.
- **No new e2e**; verify visually on prod against the real synced data (Governor's race is
  the natural check — ~$1M, mostly own-committee, $70k outside attacking Tiffany).

## Success criteria

- On a race page, a citizen sees, per candidate: support $, attack $, reach, and how much
  is the candidate's own money vs outside groups — in the layout-B cards.
- On `/ads`, the viewer sees statewide outside-money + most-attacked headline, their own
  races highlighted (when known), and race cards that reveal at a glance whether each race
  is positive-ad or attack-war.
- Every figure is honestly framed (ranges/midpoints, "estimated" outside split, influence
  not vote-effect), consistent with the guide's sourcing posture.
- All aggregation is pure + unit-tested; queries covered by convex-test; suite stays green.
