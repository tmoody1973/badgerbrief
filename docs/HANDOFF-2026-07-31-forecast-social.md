# HANDOFF — /forecast page + social tracking (2026-07-31)

Pick up in a clean context. This carries the LIVE state, the **4 remaining tasks**
with enough spec to build without re-deriving, and the deploy mechanics + gotchas.
Read "Deploy + gotchas" BEFORE shipping anything.

---

## What's LIVE (done — don't redo)

- **`/forecast` page** — live at **https://badgerbrief.org/forecast** (commit `6f6c14f`).
  Interactive poll-aggregation view of the WI-GOV **Democratic primary**, framed
  explicitly **"not a prediction."** Verified rendering with real data.
  - `src/app/forecast/page.tsx` — server route + metadata + hero.
  - `src/components/forecast/forecast-experience.tsx` — `"use client"`; pulls **live**
    polls (`api.pollsQueries.forRace`) + social (`api.social.socialForRace`) via `useQuery`.
    Sections built: **standing** (recency + leftover sliders), **win probability**
    (Monte-Carlo, uncertainty slider), **social reach** (live).
  - `src/lib/forecast.ts` — pure, unit-tested logic (parse messy polls, recency-weighted
    aggregate, project leftover, Box-Muller `winProbability`). `src/lib/forecast.test.ts` (4 tests, green).
  - Active Dem field = **Hong, Crowley, Brennan, Roys** (`ACTIVE_DEM` in forecast.ts).
    Barnes + withdrawn removed.
  - Styled with the **site's** neo-brutalist system (integrates with header/footer/dark-mode),
    NOT the widebate-dark artifact look. (A restyle toward widebate is optional — see Task E note.)

- **SocialFetch follower tracking** — `convex/social.ts` + `social_snapshots` table +
  **daily cron 11:30 UTC** (`convex/crons.ts`). Tracks the 4 Dems **+ Tom Tiffany**,
  platforms **X / Instagram / Facebook / YouTube**, gated on `SOCIALFETCH_API_KEY`
  (already set in Convex **prod**). First real pull done. Growth accrues to Aug 11.
  - Latest reach: Hong 163k · Tiffany 79k · Roys 28k · Crowley 22k · Brennan 2.7k.
  - `social:socialForRace(raceId)` returns per candidate/platform: latest followers + growth + spanDays.
  - `social:clearSocialSnapshots` (prototype reset), `social:syncSocial` (the cron action).

- **Earlier this session (all live):** colored-bar + table fixes on the artifact; background
  fact corrections on prod (Barnes/Roys endorsement removed; Hong "single mother" kept — it's
  TRUE/current; Brennan date, Wied "Brown County Clerk", Pocan "co-chair", Xiong "only candidate",
  + 3 soft flags). `maintenance:setCandidateBackground` was added for those.

**Reference artifact (widebate-styled, has ALL sections coded incl. vs-Tiffany + debate + learn):**
https://claude.ai/code/artifact/92644f0b-69a1-4b01-8a01-428df54e9a39
Its logic also lives, persistently, in **`~/Documents/Projects/election-model-lesson/`**
(`app.py`, `head_to_head.json`, `debate_participation.json`, `embed_data.json`, `gov_polls_raw.json`).

---

## ⚠️ Deploy + gotchas (READ FIRST)

1. **No git auto-deploy.** Frontend ships via **clean-worktree `vercel --prod`**:
   ```
   git worktree add --detach /tmp/bb-deploy HEAD
   mkdir -p /tmp/bb-deploy/.vercel && cp .vercel/project.json /tmp/bb-deploy/.vercel/
   cd /tmp/bb-deploy && vercel --prod --yes      # aliases to badgerbrief.org (~45s)
   git worktree remove /tmp/bb-deploy --force
   ```
2. **Convex ships separately**, protecting the WIP:
   ```
   git stash push -q -m wip -- convex/voterHelp.ts
   npx convex deploy --yes        # prod = precious-axolotl-906
   git stash pop -q
   ```
3. **Dev Convex (`greedy-armadillo-714`) has NO data.** So a local `next dev` renders the
   forecast page empty. Verify against **prod** (deploy + load the live page), or temporarily
   point `.env.local` `NEXT_PUBLIC_CONVEX_URL` at `https://precious-axolotl-906.convex.cloud`
   (back it up + restore exactly). **`.env.local` overrides shell env** in Next.
4. **Comet browser blocks localhost/ws** — use Safari or Chrome to view local Streamlit/dev.
5. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
6. **Standalone learning project** (Streamlit lessons + the artifact source) lives in
   `~/Documents/Projects/election-model-lesson/` — NOT part of the badgerbrief repo.

---

## TASK A — Add "vs. Tom Tiffany" section to /forecast

General-election head-to-head margin per active Dem. **The margins are a CURATED constant**
(the raw poll values are messy text like "Hong trails by 3", so they were hand-read from the
polls — see `~/Documents/Projects/election-model-lesson/head_to_head.json`):

```
Hong:    +3 (Wedgewood 7/6), -3 (Marquette 7/16), -3 (TIPP 3/23)   → avg -1.0
Crowley: +1 (TIPP 3/23)                                            → avg +1.0
Roys:    -4 (Marquette 7/16)                                       → avg -4.0
Brennan: -3 (Marquette 7/16)                                       → avg -3.0
```
- Put a `HEAD_TO_HEAD` constant in `forecast.ts` (or the component). Render **diverging bars**
  centered at 0 (positive = leads Tiffany, e.g. green; negative = trails, muted/red).
- Strong caveat text (already written in the artifact / `app.py`): *"Barely a signal — every
  matchup is within the margin of error, most have one poll, some are months old. November looks
  close no matter the nominee."*
- Port the exact logic from `~/Documents/Projects/election-model-lesson/app.py` (the `hh_agg`
  block) or the artifact HTML.

## TASK B — Add "debate airtime" section to /forecast

Source: **`src/data/debates/wi-gov-dem-primary-debate.json`** → `tone` dict, keyed by topic;
each topic has per-candidate `{score, words, turns}`. Sum `words` across all 10 topics per
candidate; `est_minutes = words / 130`. Precomputed result
(`~/Documents/Projects/election-model-lesson/debate_participation.json`):
```
Brennan 17.4min · Barnes 15.0 · Hong 14.4 · Roys 13.0 · Crowley 12.2   (+ tone score)
```
- **Best approach:** aggregate server-side in `page.tsx` (import the JSON, sum per candidate),
  pass as a prop to `ForecastExperience`. Render bars of `est_minutes`.
- Mark **Barnes** with `*` (withdrawn). Caveat (already written): *"Airtime ≠ support — Brennan
  spoke the most, but the poll leader is Hong."*

## TASK C — Nav link to /forecast

`src/components/guide/nav-links.tsx` → `NAV_LINKS` array. Add `{ href: "/forecast", label: "Forecast" }`.
- Check localized labels: `src/lib/i18n/chrome-en.ts` / `chrome-es.ts` `navLabels` may need a
  `/forecast` entry (mirror how other links are keyed).
- **Brand note:** a "Forecast" link on a no-prediction civic site. The page is framed "not a
  prediction," so it's defensible — but consider a softer label ("Poll Tracker") if Tarik prefers.

## TASK D — Engagement rate (SocialFetch posts endpoints)

Add real engagement: avg (likes + comments + shares) per recent post ÷ followers.
- **Endpoints** (verify each with curl + the key first, like followers were):
  - X: `GET /v1/twitter/profiles/posts/{handle}` (or `?handle=` — confirm via `/llms.json`)
  - Instagram: `GET /v1/instagram/profiles/posts/{handle}`
  - Facebook: `GET /v1/facebook/profiles/posts?url={full_url}`
  - YouTube: `GET /v1/youtube/channels/videos?handle={@handle}` (or `channelId`)
  - Machine-readable route inventory: `https://socialfetch.dev/llms.json` (follow the 307 with `-L`;
    it's ~377KB JSON; grep for `/posts` routes + their param names + the per-post metric fields).
  - Response envelope: `{ data: { ...posts[] with metrics... }, meta: { creditsCharged } }`.
- Store on `social_snapshots` (add optional `engagementRate`, `avgEngagement`, `postsSampled`) OR
  a sibling table. Update `syncSocial` (one extra lookup per candidate/platform/day) + `socialForRace`.
- **Cost:** doubles credit use. Current follower-only run is ~17 lookups/day × ~11 days ≈ 190 —
  already past the **free 100 credits** (~day 6). With engagement it's ~380. **Recommend Tarik buy
  a $14 pack (1,000 credits, never expires)** before enabling engagement or full follower tracking
  to Aug 11.

## (Optional) TASK E — widebate-dark restyle

The live page uses the site's neo-brutalist look. If Tarik wants it to match **widebate.vercel.app**
more closely (dark near-black + faint grid, editorial serif w/ italic emphasis, rust mono labels,
dotted rules), the artifact HTML is the exact reference — restyle the component's Tailwind/CSS.
Trade-off: a dark page must still coexist with the light site header/footer.

---

## SocialFetch reference (learned this session)

- Response: `{ data: { lookupStatus, profile, metrics: {...} }, meta: { creditsCharged } }`.
- **Follower field differs:** twitter/instagram/facebook → `metrics.followers`; youtube → `metrics.subscribers`.
- **Endpoint shape differs per platform:** twitter/instagram use `/{platform}/profiles/{handle}`
  (handle in path, strip leading `@`); facebook uses `/facebook/profiles?url={full_url}`; youtube
  uses `/youtube/channel?handle={@handle}` or `?channelId={id}` (parse `.../channel/{id}` from the URL).
- Handles come from `candidates.socialMedia` (Convex) — a `Record<string,string>` of URLs
  (`twitter_x`, `instagram`, `facebook`, `youtube`). Tiffany has no IG in Convex (in the dropped
  file `~/Downloads/wi_governor_2026_candidates.json` as `@reptiffany` — add via a maintenance
  mutation if you want his IG).
- The dropped JSON (`~/Downloads/wi_governor_2026_candidates.json`) has clean handles for **every**
  candidate both parties incl. TikTok — the source to expand tracking beyond the current 5.

## Quick file map
- Forecast: `src/app/forecast/page.tsx`, `src/components/forecast/forecast-experience.tsx`, `src/lib/forecast.ts` (+`.test.ts`)
- Social: `convex/social.ts`, `convex/schema.ts` (`social_snapshots`), `convex/crons.ts` (daily cron)
- Polls query: `api.pollsQueries.forRace` (raw docs — parsed by `parsePrimaryPolls`)
- Debate data: `src/data/debates/wi-gov-dem-primary-debate.json`
- Nav: `src/components/guide/nav-links.tsx`
- One-off prod fixes: `convex/maintenance.ts`

## Suggested order
Task C (nav link, trivial) → B (debate, data in-repo) → A (vs-Tiffany, curated constant) →
D (engagement — needs credit purchase + endpoint verification). Batch A/B/C into one clean-worktree
deploy. Leave `convex/voterHelp.ts` WIP untouched.
