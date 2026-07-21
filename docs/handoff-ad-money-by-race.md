# Handoff — Ad Money, By Race (MOO-309 presentation)

**Next session's job:** turn the **approved** design spec into an implementation plan
(superpowers `writing-plans` skill), then build it. Repo
`/Users/tarikmoody/Documents/Projects/badgerbrief`. Live: https://badgerbrief.vercel.app
Primary **Aug 11 2026**.

## Start here

1. Read the approved spec: **`docs/superpowers/specs/2026-07-20-ad-money-per-race-design.md`**.
   It is done and committed (`c7ab0fb`). Design was validated with the user via mockups.
2. Invoke **`superpowers:writing-plans`** on that spec → implementation plan.
3. Then implement. Do NOT re-brainstorm — the design is locked (decisions below).

## What we're building (the spec, in one breath)

A **by-race** presentation of the ad data so a citizen understands *who's influencing
their vote*. Two surfaces:
- **Race page** (`src/app/races/[slug]/page.tsx`): a "Ad money in this race" section —
  **layout B** candidate money cards (per candidate: Supporting $, Attacking $, reach, and
  an own-committee-vs-outside-money split bar) + a "who's paying" takeaway line. Add to that
  page's `SectionNav`.
- **`/ads` overview** (`src/app/ads/page.tsx` restructure): statewide headline (total,
  **outside money**, **most-attacked candidate**), a **"Your races"** band (personalized via
  the existing ballot-finder districts), and **race cards** (spend + outside-money pill +
  for/against mini-bar → tap opens the race). Keep the existing analytics/list BELOW it.

## Locked design decisions (do not relitigate)

- **North star:** citizen-first "who's influencing my vote," organized **by race**.
- **Personalization:** hybrid — statewide for everyone; "Your races" when address/sign-in
  known (reuse ballot-finder / `/api/geocode` / `user_preferences`; fall back to the
  "Find your races" prompt).
- **v1 scope = Core.** Deferred (fast-follows): geo-targeting ("aimed at your district" —
  needs storing Google `geo_targeting_included`), spend-over-time timeline (needs weeks of
  `ad_metrics_daily`).
- **Panel layout = B** (candidate money cards), chosen from mockups.
- **Honesty (non-negotiable):** influence/pressure, NOT vote-effect (no outcome data).
  "Outside money" is a heuristic → labeled "estimated." Spend/impressions are ranges →
  aggregates use midpoints, labeled.
- **Own-vs-outside classification is a heuristic** (sponsor name contains candidate name →
  own committee). User OK'd this for v1. Pure fn in `convex/lib/adMoney.ts`, reuse the same
  name logic as `defaultStance` in `src/components/admin/ad-review.tsx`.

Mockups (reference for the build) persist at
`.superpowers/brainstorm/1981-1784602630/content/per-race-panel.html` and `overview.html`
(gitignored). The brainstorm companion server was stopped.

## Implementation shape (from the spec)

- `convex/lib/adMoney.ts` (pure, unit-tested): `isOwnCommittee`, `rollupCandidate`,
  `rollupRace`. `convex/lib/adMoney.test.ts` (node env).
- Convex queries (new `convex/adMoney.ts` or in `public.ts`): `adMoneyForRace(raceId)`,
  `adMoneyOverview()`. Covered by `convex/adMoney.test.ts` (convex-test).
- Components: `src/components/guide/race-ad-money.tsx` (layout-B panel), `/ads` overview +
  "Your races" band. Server components, ISR `revalidate = 300`, follow existing page patterns.
- Verify visually on prod against real data — Governor's race is the natural check (~$1M,
  mostly own-committee, ~$70k outside attacking Tiffany).

## What is ALREADY SHIPPED this session (build on it — do not rebuild)

All live on prod, committed:
- **Dark mode** across the whole guide (`8bf2b1e`) — next-themes, CSS-var override, toggle in
  header/mobile. See `[[badgerbrief-dark-mode]]`.
- **Meta ad adapter** LIVE (`bf7af92`, `9688f1f`) — `convex/ads.ts` + `convex/lib/metaAds.ts`
  + `adsMatch.ts`. Discovers by candidate name (`search_terms`), WI-scoped via
  `deliveredInWisconsin` (delivery_by_region ≥5%). 581 real WI Meta ads. Cron 12:45 UTC.
- **Google ad adapter** LIVE (`bd85907`) — `convex/lib/googleAds.ts`. Live BigQuery via
  **Web Crypto** service-account JWT → OAuth → jobs.query (in `convex/ads.ts`,
  `queryBigQuery`/`googleAccessToken`), capped 10GB billed. WI scope =
  `geo_targeting_included LIKE '%Wisconsin%'` (NOT `regions`, which is only "US"). 500 real
  WI Google ads. Cron 13:00 UTC. See `[[badgerbrief-moo309-adapter]]`.
- **/ads tracker page** — analytics (stat tiles, for/against diverging chart, top spenders,
  reach-per-dollar), search + status/attribution filters. `src/components/guide/ads-analytics.tsx`,
  `ads-browser.tsx`, `src/app/ads/page.tsx`.
- **Candidate ad module** — "Political ads about X" on candidate pages
  (`src/components/guide/candidate-ads.tsx`; `getCandidateBySlug` returns `ads`).
- **Attribution admin** (`/admin`, admin-gated): name-matched queue + **Unattributed
  spenders** reviewer, with platform (Meta/Google) + race/office + stance filters, search,
  spend-sort. `src/components/admin/ad-review.tsx`; `convex/adminQueue.ts` (`adQueue`,
  `confirmAdMatch`, `unattributedAds`, `attributeAd`, `bulkConfirmOwnCommittee`,
  `candidatesWithOffice`). Ads carry a `stance` field (support/oppose), set at attribution.

## Current data state (prod `precious-axolotl-906`)

- **1,081 ads** (581 Meta + 500 Google), ~$3.5M–$4.3M tracked. `listAds` cap = 2000.
- **Attribution partly done:** ~366 attributed (292 Meta support + 44 Google support + ~30
  Meta attacks the user reviewed). ~715 still unattributed (mostly Google issue ads /
  national PACs — Planned Parenthood $300k, A Better Wisconsin Together $70k). These are
  attributable via the `/admin` "Unattributed spenders" reviewer but need human judgment
  (suggestions are unreliable on ambiguous multi-name ads).
- Governor race: ~$1M ads, mostly Tiffany's own committee ($817k support, much of it
  Google), ~$70k outside attacking Tiffany. Good demo/verify target.

## Gotchas / patterns (earned this session)

- **NEVER print env values.** `convex env list --prod` dumps values; even `| cut -d= -f1`
  leaks multi-line JSON. Existence check ONLY via `npx convex env get <NAME> --prod
  >/dev/null 2>&1 && echo present`.
- Adding a convex module/function → run `npx convex codegen` or `internal.*`/`api.*` types
  stay stale. Deploy order: `npx convex deploy -y` before `npx vercel deploy --prod --yes`.
- Public pages are ISR (`revalidate = 300`) — data changes take ≤5 min OR redeploy vercel to
  see immediately. Local dev reads the **dev** Convex (`greedy-armadillo-714`), which has NO
  ad data; the live site + `convex run ... --prod` use prod.
- `convex run` can call internal functions but NOT admin-gated public mutations
  (`getUserIdentity()` is null via CLI → `requireAdmin` throws). Bulk/maintenance ops must be
  `internalMutation`.
- Neo-brutalist + dark mode: use semantic tokens (`bg-card`, `border-border`, `text-muted`),
  never hardcoded hex; `bg-warning` pairs with `text-foreground` (warning deepens to amber in
  dark). `bg-success`/`bg-destructive` exist for green/red.
- 181 tests currently green (`npx vitest run`); tsc clean; `next build` clean.

## Open items needing Tarik (not code)

1. **Regenerate the exposed Meta token** — `META_ADS_ACCESS_TOKEN` (and the Google SA JSON)
   had non-secret lines printed to a transcript; the Meta token was fully exposed earlier and
   its "regenerate once it works" condition is long met. Re-`convex env set ... --prod`; the
   cron picks it up, no redeploy.
2. Work the ~715 unattributed ads via `/admin` as time allows — populates the for/against
   chart and (once this spec ships) the by-race panels.

## Memory

Durable notes in `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`
(`MEMORY.md` indexes them). Most relevant: `badgerbrief-moo309-adapter.md`,
`badgerbrief-dark-mode.md`, `badgerbrief-wec-ballot-truth.md`.
