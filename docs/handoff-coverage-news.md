# Handoff — Coverage & Source Transparency (/news) + open work

**Written:** 2026-07-22 · **Branch:** `main` (all work merged, pushed, deployed)
**Live:** https://badgerbrief.org/news · **Convex prod:** `precious-axolotl-906`
**Clock:** 13 days to the MOO-314 launch target (Aug 4) · 20 days to the Aug 11 primary

---

## 0. Two questions answered first

### "How come we don't have any news about David Crowley re-entering the race?"

**We do.** It's live right now:

> `2026-07-17` — *"Milwaukee County Exec David Crowley getting back into governor's race"*

Five Crowley stories are on the hub (withdraws 7/08 → endorses Rodriguez 7/08 → calls on Democrats to clear the field 7/09 → **re-enters 7/17**). It reads as "missing" for two real reasons:

1. **It's buried in the river.** Newer stories (7/22, 7/21, 7/20) plus three Rodriguez-exit stories on the same day push it ~8th. It is not the lead and has no visual prominence.
2. **Coverage of it is thin — one article.** Rodriguez dropping out got 3 stories from 3 outlets; Crowley re-entering got 1. That is a *discovery* problem, not an editorial one: **we only track 4 outlets**, so a major development can land with a single source. This is exactly why the TV-outlet work below matters.

**Also found:** the page is showing **60 of 71** stories. `coverage.hubArticles` caps at `limit ?? 60` (`convex/coverage.ts:55`) and `/news` calls `getHubArticles()` with no limit — 11 stories are silently cut. And the masthead I wrote says `60 STORIES TRACKED`, which is **wrong**: that's the displayed count, not the tracked count. Both need fixing (see §2, P1).

### "We should include the local TV outlets including Wisconsin PBS"

Agreed, and there's a shortcut: **a WI TV station list already exists** at
`docs/superpowers/specs/fixtures/wi-tv-stations.csv` (from the MOO-318 TV ad tracker) — call sign, city, DMA, network, FCC public-file URL, incl. PBS (WMVS/WMVT Milwaukee).

Critical thing to understand: **adding rows to the `outlets` table does NOT make the scout find their articles.** `outlets` is the *transparency* layer (ownership/funding shown under a headline). Discovery is a separate pipeline — the scout asks Perplexity for coverage, and TV station sites simply aren't surfacing today. So this is two workstreams, not one (§2, P2).

---

## 1. What shipped (all live)

**Coverage & Source Transparency v1** — spec `docs/superpowers/specs/2026-07-22-coverage-source-transparency-design.md`, plan `docs/superpowers/plans/2026-07-22-coverage-source-transparency.md`. Built via subagent-driven development, 12 tasks + whole-branch review + fix wave. Merged `66c2672`, deployed.

- **`/news`** — front page (Hallmark *Ecosystem Index*): lead → 2 secondary → river. Race + Outlet filters. `/news/about` methodology page.
- **"In the news"** on candidate + race pages (editor-approved articles only).
- **Tiered gating (the core invariant, locked by test):** an article shows on `/news` iff `hubStatus === "auto"`; shows on an entity page iff `status === "approved"`. **Neither implies the other.**
- **Source transparency** — `outlets` table (ownership/funding/type), compact mono stamp on `/news` with detail in a `<details>`, full card on entity pages. **No bias/factuality badges in v1** — `outlets.thirdPartyRatings` exists in the schema, data-ready for v2, never rendered.
- **Verified dates only** — a date is displayed/sorted on only if read from the article's own metadata (OpenGraph / schema.org / the publisher's permalink). The scout's LLM guess is never shown.
- **Thumbnails** — publisher `og:image` only, via `next/image` against a `remotePatterns` allowlist.

**Current data state:** 71 hub-eligible articles · 85/101 with verified dates · 63 with images · **4 outlets, all approved** (Urban Milwaukee, WPR, WUWM, Milwaukee Journal Sentinel).

---

## 2. Open work, prioritized

### P0 — Launch blocker (not coverage-related, but it outranks everything here)

**MOO-393 — promote Clerk to a production instance.** Auth still runs on a *development* instance (`amazed-hyena-57.accounts.dev`, "Development mode" banner, dev rate limits). The FB graphics + launch video will drive signup traffic into it. Steps in `docs/launch-runbook.md` item 4b.

### P1 — /news accuracy bugs (small, do first)

1. **Show all tracked stories.** `/news/page.tsx` → `getHubArticles()` takes no limit, so `hubArticles` caps at 60 of 71. Either pass a higher limit or paginate.
2. **Fix the masthead count.** It says `N STORIES TRACKED` using the *displayed* array length. Either label it honestly (`N SHOWN`) or pass the true tracked count. This product's whole promise is not overstating — don't ship a count that means something other than what it says.
3. **Set real outlet types.** All 4 outlets are `type: "other"`, so every stamp reads `NEWS OUTLET`. Correct them in `/admin → Outlets`: WPR + WUWM = `public_media`, Urban Milwaukee = `nonprofit`, Milwaukee Journal Sentinel = `corporate_daily`. The taxonomy *is* the transparency layer; flat "other" wastes it.

### P2 — TV outlets incl. PBS Wisconsin (what you asked for)

Three separate pieces — do them in this order:

**(a) Discovery — the hard part.** TV articles aren't being found. `convex/scout.ts` asks Perplexity for coverage per candidate; station sites (tmj4.com, wisn.com, fox6now.com, cbs58.com, channel3000.com, pbswisconsin.org, wpt.org) aren't surfacing. Options: name preferred domains in the scout prompt, add a per-outlet sweep (search "site:tmj4.com <candidate>"), or add RSS/sitemap polling for the ~8 stations that publish feeds. **Verify by checking `article_sources.outlet` values after a run — if no TV outlet names appear, discovery didn't work, regardless of what the outlets table says.**

**(b) Transparency profiles.** Genuinely valuable — broadcast ownership is concentrated and mostly out-of-state:
| Station | Market | Net | Owner |
|---|---|---|---|
| WTMJ-TV | Milwaukee | NBC | Scripps |
| WISN-TV | Milwaukee | ABC | Hearst |
| WITI | Milwaukee | Fox | Fox Corp |
| WDJT-TV | Milwaukee | CBS | Weigel |
| WMVS / WMVT | Milwaukee | PBS | Milwaukee Area Technical College |
| **PBS Wisconsin (WHA-TV)** | Madison | PBS | **UW–Madison + WI Educational Communications Board** |
| WISC-TV | Madison | CBS | Morgan Murphy Media |
| WKOW | Madison | ABC | Allen Media |
| WBAY | Green Bay | ABC | Gray |
**Verify each owner before publishing** — ownership changes hands often. Use `outletEnrich.enrichOutlet` to draft, then review + approve. Note PBS Wisconsin ≠ the Milwaukee PBS stations; they're separate licensees.

**(c) Image hosts.** Add each station's CDN to `next.config.ts` `remotePatterns` or their thumbnails 400. **Gotcha already hit once: the image host is often NOT the article host** — WPR serves off `npr.brightspotcdn.com`. Most TV groups use `*.brightspotcdn.com` too (Scripps/Hearst/Gray). Audit actual `imageUrl` hosts after ingest.

### P3 — Scout rotation (root cause of staleness — the biggest structural issue)

`DEFAULT_LIMIT = 3` in `convex/scout.ts`, cron daily 11:00 UTC, **67 candidates** → a **22-day full rotation**, with the primary in 20 days. A candidate is checked ~once every three weeks, so a major development (Crowley re-entering) can sit undiscovered for weeks. Today's feed is only current because I hand-ran a catch-up.

- **A** — raise `DEFAULT_LIMIT` 3→12 (~6-day rotation, ~4× Perplexity spend)
- **C** ✅ recommended — **tier by salience**: Governor/Senate daily, down-ballot weekly. Targets spend at races people actually vote on. Cheaper than A and better. (Relevant to the MOO-356 cost-tuning ticket.)

### P4 — Deferred minors (logged in `.superpowers/sdd/progress.md`)

- Public coverage queries return the whole `article_sources` doc — including `traceId`, `whyRelevant`, `relevanceReason` (our own characterizations) — in the RSC payload. Not rendered, but project the payload.
- `/news` + `/news/about` missing from `sitemap.ts`.
- Duplicated row markup between `in-the-news.tsx` and `news-feed.tsx`.
- `publicOutlet` in `convex/outlets.ts` is dead code (`withOutlet` does its own approved-gated lookup).
- `article_sources.candidateSlug`/`raceId` were made optional to allow statewide coverage, but no writer produces such rows yet.
- Silent no-op when `FIRECRAWL_API_KEY` is absent — enrich reports success, changes nothing.

### P5 — Also still pending (pre-existing)

- **`convex/voterHelp.ts` is modified but UNCOMMITTED** — a Rule 0 chat scope guardrail ("only answer WI-2026 election questions") + prompt-injection clause. It must clear the golden eval gate before shipping: `node scripts/eval-gate.mjs` (see `docs/eval-gate.md`, 15 questions, 90% floor). **Do not commit/deploy it ungated.**
- **Justice Project narrative** — corrected version staged as a draft; needs `sponsors:approveNarrative` to publish. Profile currently shows facts only.
- Launch video: script + capture plan in `docs/launch-video/`, pre-flight verified. Needs a hands-on record session.
- FB graphics (3 sizes) on the Desktop.

---

## 3. Landmines (things that already bit)

1. **`scout.ts` is `"use node"`** — a Convex *mutation* cannot import from it. `decorateCoverageRow` lives in `convex/lib/outlets.ts` for exactly this reason.
2. **Same-file circular inference** — an action calling a query in the same file needs explicit return-type annotations (see `publishedDateSync.ts`), per `convex/_generated/ai/guidelines.md`.
3. **`Date.parse("2026-06-")` silently returns June 1st** — JS invents a day. `cleanPublishedAt` requires a strict `YYYY-MM-DD`. Never loosen it.
4. **Explicit `candidateSlugs` still gets sliced by `DEFAULT_LIMIT`** — pass `limit` too or you'll only scout 3.
5. **Campaign sites are not news** — `sourceKind: "campaign_site"` must be excluded from hub + entity queries and never minted as an `outlet`. This leaked once (5 campaign pages on the public hub, 14 campaigns as "outlets") and was repaired.
6. **`overflow-x: clip`, never `hidden`** on the root — `hidden` makes it a scroll container and breaks the sticky `SectionNav`.
7. **`convex/_generated/api.d.ts` is tracked** — regenerate and commit it when adding a Convex module, or a clean checkout won't typecheck.
8. **Test command is `npx vitest run <file>`** — this repo has NO `pnpm test` (it no-ops).
9. **`DESIGN.md` governs all UI** — neo-brutalist, 2px borders, `4px 4px 0` shadow, zero radius, semantic tokens only, no `dark:` classes, never nest a card in a card.

---

## 4. Command cheatsheet (prod)

```bash
# Discovery — catch up a race (MUST pass limit, else only 3 run)
npx convex run --prod scout:run '{"candidateSlugs":["david-crowley","kelda-roys"],"limit":10}'

# Verify dates + capture og:images for anything unchecked
npx convex run --prod publishedDateSync:syncPublishedDates '{"limit":60}'
#   add {"force":true} to re-check everything

# Backfill decoration for pre-feature rows (dryRun defaults TRUE)
npx convex run --prod coverageBackfill:backfillCoverage '{}'
npx convex run --prod coverageBackfill:backfillCoverage '{"dryRun":false}'

# Repair pass if campaign sites ever leak in again
npx convex run --prod coverageBackfill:cleanupCampaignSiteOutlets '{}'

# Inspect
npx convex run --prod coverage:hubArticles '{"limit":200}'
npx convex data outlets --prod --limit 20
npx convex run --prod outlets:listDraftOutlets '{}' --identity '{"metadata":{"role":"admin"}}'

# Outlet curation is in the UI: /admin → Outlets → Enrich (web) → review → Approve
```

**Deploy:** `npx convex deploy -y` (backend) then `npx vercel --prod` (frontend). Both are needed — deploying only Vercel while a new Convex function is missing returns a 500 (happened once with `/news`).

---

## 5. Suggested next session

1. **P1** — the three /news accuracy fixes (~30 min, high value, they're honesty bugs).
2. **P2(a)** — prove TV discovery works for ONE station before building all of it. If Perplexity won't surface tmj4.com, the whole approach needs rethinking and it's better to learn that on one station than nine.
3. **P3(C)** — salience-tiered scout cadence, so the feed stays current without a 4× bill.
4. **MOO-393** in parallel — it's the actual launch blocker.
