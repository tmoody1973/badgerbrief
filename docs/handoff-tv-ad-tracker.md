# Handoff — Broadcast TV Ad Tracker (MOO-318)

**Next session's job:** turn the **approved** spec into an implementation plan
(superpowers `writing-plans`), then build it subagent-driven — same flow as the
ad-money feature. Repo `/Users/tarikmoody/Documents/Projects/badgerbrief`.

## Start here

1. Read the approved spec: **`docs/superpowers/specs/2026-07-21-tv-ad-tracker-fcc-design.md`** (committed `19ad4bf`). Design is locked; do NOT re-brainstorm.
2. Invoke **`superpowers:writing-plans`** on it → implementation plan.
3. Build. **De-risk Browserbase-in-Convex FIRST** (see below) — the whole sync rides on it.

## The one hard-won fact (do not relitigate)

FCC's `/api/manager/*` — both folder **listings** and PDF **downloads** — is **Akamai-blocked** ("Access Denied" 403) to plain server requests, curl, direct browser navigation, AND in-page `fetch()`. Verified live 2026-07-21 (Tarik hit it manually too). Only `/api/service/*` answers plain requests, and it doesn't serve political files.

**What works (spike-proven):** a real browser (Browserbase) that (a) navigates the folder pages and scrapes the rendered DOM for subfolders + doc metadata, and (b) downloads PDFs via the **alternate host `https://files.fcc.gov/download/{fileManagerId}.pdf`** as a navigation that fires a download event. The spike downloaded a genuine 110 KB WISN order this way and extracted every field cleanly. Tarik chose **Browserbase** as the download+enumeration path — don't try to make plain `fetch()` work.

## Extraction is the easy part (spike result)

Orders are **machine-readable text** (WideOrbit-generated), not scans. The real Barnes-for-Governor WISN order is committed at `docs/superpowers/specs/fixtures/2026-wisn-barnes-order.pdf` — use it as the extraction fixture. Fields extracted perfectly: advertiser "Barnes/D/Governor", station WISN, DMA Milwaukee, flight 07/14–07/20/26, 18 spots, **gross $24,550.00** (net $20,867.50). Sonnet will handle these reliably + cheaply; per-field confidence + the review gate catch edge cases.

## Folder taxonomy (verified WISN-TV 2026)

`political-files/2026/` → `Federal` | `Local` | `State` (44 files) | `Non-Candidate Issue Ads` (33) | `Terms`. Scope (per spec): **State + Federal filtered to our tracked offices, PLUS all Non-Candidate Issue Ads** (Tarik added issue ads — outside groups are the biggest spenders). `Local` + `Terms` are OUT. Candidate subfolders map directly to our slugs (Barnes/Brennan/Roys/Tiffany/Rodriguez for Governor; Taylor/Lazar for Supreme Court on WISN).

## Curated station list (full-power, provided by Tarik 2026-07-21)

**Seed the ad-relevant ones first — the Big-4 + CW affiliates carry ~all political
buys.** PBS / religious / Ion / shopping stations are full-power but almost never sell
candidate/issue ads (folders will be empty, like WISN's Federal=0) — include only if
cheap, deprioritize otherwise. Get each folder URL by navigating
`/tv-profile/{callSign}/political-files/2026` via Browserbase (the folder UUID differs
per station — WISN + WTMJ confirmed below).

**Milwaukee (DMA):** WISN-TV (ABC), WTMJ-TV (NBC), WITI (Fox), WDJT-TV (CBS), WVTV (CW/MyNet), WMLW-TV (ind) — *ad-relevant*. Likely-empty: WMVS/WMVT (PBS), WVCY-TV (religious), WWRS-TV (TBN), WPXE-TV (Ion), WIWN (Cozi).
**Madison (DMA):** WISC-TV (CBS), WMTV (NBC), WKOW (ABC), WMSN-TV (Fox) — *ad-relevant*. Likely-empty: WHA-TV (PBS), WIFS (Ion).
**Green Bay–Appleton (DMA):** WBAY-TV (ABC), WFRV-TV (CBS), WLUK-TV (Fox), WGBA-TV (NBC), WCWF (CW), WACY-TV (ind) — *ad-relevant*. Likely-empty: WPNE-TV (PBS), WMEI (MeTV).

**Station seed committed:** `docs/superpowers/specs/fixtures/wi-tv-stations.csv` — all
full-power TV across the 3 DMAs (26 stations), with `dma`, `network`, and an
`ad_relevant` flag (16 yes = Big-4+CW+independent affiliates that carry buys; 10 no =
PBS/religious/Ion/shopping, near-empty). URLs are base `/tv-profile/{callSign}` profiles;
the sync navigates from there into Political Files → 2026 (folder UUID differs per
station — discover it, don't hardcode). Low-power/translator/radio excluded (no political
buys). Confirmed 2026-folder UUIDs so far: WISN-TV `080b644a-…`, WTMJ-TV `36e1aa59-…`.

## Build shape (from the spec)

- `convex/lib/tvExtract.ts` (+ `.test.ts`): pure normalize/validate (date "7.21-7.27", money "$24,550.00", "Barnes/D/Governor" → office/party/name), dedup by `fileManagerId`. Fixture = the committed Barnes PDF text.
- Browserbase-driven `internalAction` in `convex/adsTv.ts` (or extend `convex/ads.ts`): enumerate → download → Sonnet extract → `upsertAd({platform:"tv", platformAdId: fileManagerId, ...})` + review task. `"use node"` (Browserbase SDK). Key `BROWSERBASE_API_KEY` in Convex env (Tarik to set).
- Schema: widen platform validator to `meta|google|tv`; add optional `station, dma, spotCount, flightStart, flightEnd, fccDocUrl, orderRef` to `ads`. Run `npx convex codegen`.
- Reuse `adsMatch`/`scoreAdMatch` + `review_tasks` (trust posture). TV spend is EXACT → `spendLower=spendUpper=gross`, framed "reported on FCC order" (not "estimated").
- Race-page TV module (`src/components/guide/race-tv-ads.tsx`); TV rows also flow into the MOO-309 by-race overview automatically once attributed.
- Daily cron; failures → alerts, never crash; Arize-traced.

## Gotchas / patterns (this repo)

- Deploy order: `npx convex codegen` → `npx convex deploy -y` → `npx vercel deploy --prod --yes`. Public pages ISR `revalidate=300`.
- `convex run` calls internal fns but NOT admin-gated mutations. Bulk ops = internalMutation.
- Neo-brutalist semantic tokens only (`bg-card`/`border-border`/`shadow-[var(--shadow-brutal)]`); no hex, no `dark:` classes.
- 205 tests green at spec time; keep the suite green (vitest + convex-test).
- Browser for the spike was Playwright MCP; the real sync uses Browserbase (hosted) since Convex can't run a browser itself.

## First plan task should be the Browserbase spike

Before building the full pipeline, prove a Convex `"use node"` action can: create a Browserbase session → navigate a WISN folder → scrape doc rows → download one PDF's bytes → return them. If that works end-to-end from Convex, the rest is mechanical. If Browserbase-from-Convex has friction, surface it before investing in the full adapter.

## Memory

Durable notes in `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`. Most relevant: `badgerbrief-moo309-adapter.md` (Meta/Google adapter patterns to mirror), `badgerbrief-wec-ballot-truth.md` (trust posture).
