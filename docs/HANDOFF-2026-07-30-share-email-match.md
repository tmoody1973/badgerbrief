# HANDOFF — BadgerBrief remaining work (2026-07-30)

Pick up in a clean context. This carries the LIVE state, the 3 remaining tasks with
enough spec to build without re-deriving, and the deploy mechanics + gotchas that bit
this session. Read the "Deploy + gotchas" section BEFORE shipping anything.

---

## What's already LIVE (done this session — don't redo)
- **SEO:** `/races` + `/candidates` hub pages, sitemap `<lastmod>` on all 597 URLs, superseded
  legislative races 301→`/races`, EN-footer "Browse the ballot" links. (commit `5b35abd`)
- **GA4:** wired via `@next/third-parties` `<GoogleAnalytics>` in `src/app/layout.tsx`, gated on
  `NEXT_PUBLIC_GA_ID` (**`G-VS7D391TLH`**, set in Vercel Production env). `track()` in
  `src/lib/analytics.ts` now fans out to **3 sinks** (Vercel + PostHog + GA4). New decision-support
  events already added + fire: `match_start`, `match_complete {answered}`, `share {surface}`,
  `guided_path {step}`. (commits `ca996ef`, `efa2c02`)
- **Feedback fix:** `convex/feedback.ts` validations now throw `ConvexError` (not plain `Error`, which
  Convex redacts to a generic "Server Error" in prod); `feedback-form.tsx` reads `err.data`. (commit `bdc73ea`)
- **Mandela Barnes withdrawal (2026-07-30):** status → `Withdrawn (July 30, 2026)` on prod +
  seed doc; site-wide announcement bar, `/news` notice w/ FOX 11 source; `StatusBadge` pill shows
  everywhere. (commit `6ac0ad6`) Remaining active Dem gov field: Brennan, Crowley, Hong, Roys.

GA4 realtime is flowing; the "no data in 48h" data-stream banner is just the lagging aggregate — ignore.

---

## ⚠️ Deploy + gotchas (READ FIRST)
See also memory `badgerbrief-deploy-mechanism`.

1. **No git auto-deploy.** `git push` does NOT deploy. Prod ships via **manual `vercel --prod`**.
   Convex ships via **separate `npx convex deploy`** (no `convex deploy` in the build pipeline).
2. **Both deploy the working tree from disk, not the git commit.** The repo carries uncommitted WIP —
   `convex/voterHelp.ts` (+142 lines, unfinished `getDebate`/`getExplainer`, failed eval gate) and
   untracked `src/lib/label-glossary.ts` — plus 100MB+ untracked videos under `docs/video/`.
   **Never ship that WIP.** Use the isolation pattern below.
3. **Clean Vercel deploy (committed HEAD only):**
   ```
   git worktree add --detach /tmp/bb-deploy HEAD
   mkdir -p /tmp/bb-deploy/.vercel && cp .vercel/project.json /tmp/bb-deploy/.vercel/
   cd /tmp/bb-deploy && vercel --prod --yes      # cloud build; env from Vercel project settings
   git worktree remove /tmp/bb-deploy --force
   ```
   Aliases to badgerbrief.org automatically. Build ~45s.
4. **Clean Convex deploy (protect voterHelp WIP):**
   ```
   git stash push -m wip -- convex/voterHelp.ts
   npx convex deploy --yes        # prod = precious-axolotl-906
   git stash pop
   ```
   `NEXT_PUBLIC_*` are baked at build time → after changing a Vercel env var you MUST redeploy.
5. **Convex env ≠ Vercel env.** Convex actions/functions read the **Convex** deployment env
   (`npx convex env set NAME value` / `--prod`), NOT `.env.local` or Vercel. Matters for Resend below.
6. `.env.example` is gitignored in this repo (edits to it stay local — fine).
7. Commit trailer convention in this repo: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## TASK 1 — Social share enhancement (approved, NOT built)
Goal: enhance the existing `ShareButton` (do NOT add a third-party widget — AddThis is dead, Meta kills
FB share plugins 2026-02-10, ShareThis/AddToAny are trackers. NYT et al. hand-roll Web Share API +
intent links + copy. Research already done.)

**Files:**
- `src/lib/analytics.ts` — extend the `share` event: `share: { surface: "race"|"candidate"|"compare"|"brief"|"match"; method: "web_share"|"copy"|"x"|"facebook"|"email"|"bluesky" }`. (Currently `{ surface }` only; the only caller is ShareButton, so safe to change.)
- `src/components/contribute/share-button.tsx` — rewrite. Requirements:
  - **Always show a "Copy link" button** (today it shows EITHER native "Share" OR the copy/X/FB fallback — never both; on macOS Chrome/Safari `navigator.share` exists so the copy link is hidden → this is the "I don't see a copy link" complaint).
  - Keep native "Share" (Web Share API) when available, **in addition to** copy.
  - Intent links: X, Facebook (sharer.php still works), **Email** (`mailto:`), **Bluesky**
    (`https://bsky.app/intent/compose?text=<title>%20<url>`).
  - **UTM on every shared URL:** helper `taggedUrl(url, medium)` → append
    `utm_source=share&utm_medium=<method>&utm_campaign=voter_guide` (use `new URL()`; the `url` prop is
    absolute — callers pass `${SITE_URL}/...`). This gives GA4 inbound attribution (PostHog/GA4
    `beforeSend` strip query strings for their OWN events, but GA4 page_view captures UTMs first).
  - Fire `track("share", { surface, method })` on each method.
  - `shareSurface(url)` — extend to detect `/match` → `"match"` (already handles compare/candidate/race/brief).
- **Add `<ShareButton>` to surfaces that lack it:**
  - `/compare/[slug]` — `src/app/compare/[slug]/page.tsx` (currently NONE). url=`${SITE_URL}/compare/${slug}`, surface auto = compare.
  - `/match` — best in `src/components/match/match-experience.tsx` (it has `pathname`, `selected`, `params`).
    Share the personalized URL incl `?issues=...` so recipients see the same match. surface = "match".
    Import `SITE_URL` from `@/lib/site` (public const, client-safe).
- ShareButton is used today on: `races/[slug]/page.tsx`, `candidates/[slug]/page.tsx`,
  `contribute/page.tsx` (url=`SITE_URL` root → shareSurface returns null → no event; fine, or add a "site" surface).

**Verify:** load a race page → Copy link visible alongside Share; click each → GA4 Realtime shows
`share` with the method param; shared URL carries `utm_medium`.

---

## TASK 2 — Match "honesty fix" for legislative (approved, NOT built)
**Root cause (confirmed):** `/match` is positions-based (`buildIssueMatch` groups candidates by their
stance on the picked issues). Legislative candidates exist (99 Assembly races, 216 candidates — data is
COMPLETE) but have **`positions: []`** — no curated issue positions (only statewide + federal do). So they
can never appear in match. `relevantRaces()` (district mapping) is correct; not the bug.

**Fix:** in the match result, when the voter has an address (`districts` set) and their ballot includes
races with candidates but zero positions, render a section **"Also on your ballot — issue positions not
yet available"** listing those races (office) + candidate links (`/candidates/<slug>`), instead of silently
dropping them. Do NOT fabricate positions (site's no-fabrication ethos).

**Where:** `src/components/match/match-experience.tsx` — the `positionsForRaces` result (`data`) already
contains every active race with its `candidates[]` and `positions[]`. Races where `positions.length === 0`
are the ones to surface. Pass them to `MatchResults` (new prop) or render below it. Only when
`districts` is set (without an address, match is statewide-only by design).

---

## TASK 3 — Email feedback notifications via Resend (deferred; key half-set)
Today feedback only lands in the Convex `feedback` table (admin queue at `/admin`, `feedback-queue.tsx`).
No email. Tarik wants an email on every submit.

**Decisions already made:** destination = **tarikjmoody@gmail.com**. Subject = **`[badgerbrief] <Topic>`**
(map `kind` → label: correction→"Correction", question→"Question", suggest_candidate→"Suggest candidate",
suggest_source→"Suggest source", data_gap→"Data gap", volunteer→"Volunteer", other→"Other"). Body: message,
pageUrl, sourceUrl, contact. Keep the admin queue as system of record — email is just a notification.
**Recommended fix over replacing with Sleekplan** (Sleekplan is a public feature-request/roadmap board —
wrong for private, source-required journalistic corrections; adds 3rd-party tracking to a civic site).

**Approach (Convex):** mutations can't do external I/O. In `convex/feedback.ts` `submit`, after the insert,
`ctx.scheduler.runAfter(0, internal.feedback.notify, {...})`. Add an **internal action** `notify` that
POSTs to Resend (`https://api.resend.com/emails`, `Authorization: Bearer ${process.env.RESEND_API_KEY}`),
or use the `@convex-dev/resend` component. Gate on `RESEND_API_KEY` present (no-op if unset).

**Blockers to finish:**
- Tarik put the key in `.env.local` — but the action reads **Convex** env. Run
  `npx convex env set RESEND_API_KEY <key> --prod` (and dev). It will NOT work from `.env.local`.
- From address: `feedback@badgerbrief.org` requires verifying the domain in Resend; else use Resend's
  onboarding/test sender to start.

---

## Quick file map
- Analytics taxonomy + `track()`: `src/lib/analytics.ts` (closed PII-safe union; the one privacy-enforcement point)
- ShareButton: `src/components/contribute/share-button.tsx`
- Match: `src/components/match/match-experience.tsx`, `match-results.tsx`; positions via `api.public.positionsForRaces`
- Feedback: `convex/feedback.ts` (submit + admin), `src/components/guide/feedback-form.tsx`
- Announcement bar: `src/app/layout.tsx` + `src/components/guide/announcement-bar.tsx`
- Candidate status → pill/ballot: `src/components/guide/labels.tsx` (`StatusBadge`), `src/lib/ballot-status.ts` (`isOnBallot`)
- One-off prod data fixes: `convex/maintenance.ts` (`setCandidacyStatus` internalMutation; run via `npx convex run --prod`)

## Suggested order
Share (Tarik's stated next) → Match honesty fix (small, same area) → Resend email (needs Convex env + domain).
Batch each into one clean-worktree deploy. Leave `convex/voterHelp.ts` + `src/lib/label-glossary.ts` WIP untouched.
