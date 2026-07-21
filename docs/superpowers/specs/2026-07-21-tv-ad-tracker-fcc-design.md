# Broadcast TV Ad Tracker (FCC Political Files) — design spec

**Status:** approved design, pre-implementation
**Date:** 2026-07-21
**Issue:** MOO-318 (M1 ad tracker — broadcast TV channel)
**Depends on:** shipped Meta/Google adapters (`convex/ads.ts`, `convex/lib/adsMatch.ts`), the `ads` table + `stance`, the `review_tasks` human-review pipeline, Arize tracing (MOO-304/313). Adds a Browserbase dependency.

## Intent

Show voters who is buying **broadcast TV ads** in Wisconsin races — the only ad channel that reaches state/local races and the one with a universal, legally-required public record: FCC online public inspection files (political files). This is the accountability complement to the Meta/Google digital trackers already live. Records are order/invoice PDFs; the extraction agent + review gates (built for exactly this) turn them into structured, human-verified `ads` rows joined to the money picture.

**Honesty constraint (BadgerBrief ethos):** TV spend is **exact** (stated on the FCC order), not a disclosed range — so unlike Meta/Google midpoints, TV rows are framed "reported on the FCC order," linking to the source PDF. Sponsor→candidate attribution stays human-gated (trust posture, [[badgerbrief-wec-ballot-truth]]).

## Scope

**In (v1):**
- Curated full-power TV stations in the **3 WI DMAs** (Milwaukee, Madison, Green Bay–Appleton).
- **Candidate ads** for our tracked offices — the `State` folder (Governor, Supreme Court, state leg) and `Federal` folder (U.S. House/Senate), filtered to offices in our guide.
- **Non-candidate issue ads** — the `Non-Candidate Issue Ads` folder in full (outside groups / PACs — the sharpest "who's influencing" signal; the largest spenders). Attributed to a race by human review when the PDF references a tracked candidate/race; otherwise stored unattributed (same pattern as Meta/Google issue ads already in the table).
- Daily sync; LLM extraction (Sonnet); land as `ads` (`platform:"tv"`) drafts + `review_tasks`; human approval before public; race-page TV-activity module linking each row to its FCC source PDF.

**Out (M2, explicitly deferred):** cable (Comcast archive), remaining/border DMAs, radio (also in FCC files — decide after TV works), Wesleyan/Vivvix licensed data, `Local` folder (county/municipal offices we don't track). Ad-message clustering is MOO-316.

## FCC access — the load-bearing engineering fact

`/api/manager/*` (folder listings AND PDF downloads) is **Akamai-blocked** ("Access Denied" 403) to plain server requests, curl, direct browser navigation, and in-page `fetch()`. Verified 2026-07-21. Only the `/api/service/*` namespace answers plain requests. **What works:** a real browser session (Browserbase) that navigates the folder pages (scrape the rendered DOM for subfolders + document metadata) and downloads PDFs via the alternate host **`https://files.fcc.gov/download/{fileManagerId}.pdf`** triggered as a browser navigation (fires a download event). The spike downloaded a genuine 110 KB WISN order this way.

**Decision:** all FCC access — enumeration and download — goes through **Browserbase** (hosted headless Chrome) driven from a Convex action. A plain `fetch()` will 403; do not attempt it in the sync path.

## Folder taxonomy (verified on WISN-TV, 2026)

```
political-files/2026/
  ├─ Federal              (U.S. House/Senate candidates)      → filter to tracked offices
  ├─ Local                (county/municipal)                  → OUT (v1)
  ├─ State  (44 files)    (Gov, Supreme Court, state leg)     → filter to tracked offices
  │     └─ {candidate-slug}/{folderId}/  → order/invoice PDFs
  ├─ Non-Candidate Issue Ads (33 files)  (outside groups)     → ALL (issue ads)
  │     └─ {org}/[{candidate-ref}/]{folderId}/  → PDFs
  └─ Terms and Disclosures                                    → OUT (boilerplate)
```
Each leaf document row carries: display name (often encodes flight dates, e.g. "Barnes Gov 7.21-7.27"), size, upload date, and a `fileManagerId` in its download URL.

## Architecture / data flow

```
Daily Convex cron (internalAction, Browserbase-driven)
  → for each curated station:
      navigate political-files/2026 → walk Federal/State/Non-Candidate Issue Ads
      → scrape subfolders + doc rows (name, size, uploadDate, folderId, fileManagerId)
      → filter: candidate folders to tracked offices; issue-ads folder in full
      → for each NEW/changed doc (fileManagerId unseen, or uploadDate newer):
          download PDF via files.fcc.gov/download/{fileManagerId}.pdf (Browserbase)
          → Sonnet extract (AI SDK document input) → fields + per-field confidence
          → scoreAdMatch(sponsor → candidate) [reuse adsMatch]
          → upsertAd({platform:"tv", platformAdId: fileManagerId, ...}) 
             + openAdReviewTask when below public threshold
  → logSync; failures → alerts (never crash), Arize-traced
Human approves in /admin → race-page "TV ad activity" module (public)
```

## Data model — extend `ads`, no new table

Reuse `ads` with `platform: "tv"` (widen the platform validator: `"meta" | "google" | "tv"`). TV spend is exact → `spendLower = spendUpper = grossSpend`. Add optional TV-only fields to the `ads` table (all `v.optional`, so existing rows stay valid):

```ts
station: v.optional(v.string()),        // call sign, e.g. "WISN-TV"
dma: v.optional(v.string()),            // "Milwaukee" | "Madison" | "Green Bay-Appleton"
spotCount: v.optional(v.number()),
flightStart: v.optional(v.string()),    // YYYY-MM-DD
flightEnd: v.optional(v.string()),
fccDocUrl: v.optional(v.string()),      // https://publicfiles.fcc.gov/.../{fileManagerId}.pdf (source link)
orderRef: v.optional(v.string()),       // station contract/order #
```

- **Idempotency:** `platformAdId = fileManagerId` (FCC file UUID, globally unique). Re-sync upserts by `by_platform_ad` index — no duplicates. Attribution preserved across re-syncs (existing `keepAttribution` logic in `upsertAd`).
- New/changed detection: a station folder's current doc list vs. stored `platformAdId`s + `uploadDate`.
- Curated station seed (new small config — station call sign, DMA, `political-files/2026` folder URL/id). Seed WISN-TV + WTMJ-TV; grow the list as URLs are gathered.

## Extraction (`convex/lib/tvExtract.ts` + agent)

Pure normalize/validate helpers in `convex/lib/tvExtract.ts` (unit-tested). The LLM call (Sonnet, AI SDK document input, Arize-traced) returns:

```ts
type TvAdExtraction = {
  advertiser: string;        // "Barnes/D/Governor" or issue-group name
  party?: string;            // "D" | "R" | ...
  office?: string;           // "Governor", "U.S. House", ...
  candidateName?: string;    // parsed candidate, for matching
  station: string;
  dma?: string;
  flightStart?: string; flightEnd?: string;
  spotCount?: number;
  grossSpend?: number; netSpend?: number;
  agency?: string;           // media buyer
  orderRef?: string;
  confidence: Record<string, number>;  // per-field 0..1
};
```
The spike proved every field extracts cleanly from the WideOrbit text PDFs (Barnes order: advertiser "Barnes/D/Governor", station WISN, flight 07/14–07/20, 18 spots, gross $24,550). Orders are machine-readable text, not scans → reliable + cheap; edge cases (revisions, invoices vs. orders, multi-candidate issue PDFs) are caught by per-field confidence + the review gate.

## Matching + review (reuse the trust posture)

- Sponsor→candidate via existing `scoreAdMatch`/`adsMatch` name heuristic; **only** high-confidence, tracked-office matches auto-attribute publicly. Everything else → `review_tasks` with a suggested slug, `candidateSlug` unset. Same gate as Meta/Google.
- Issue ads: sponsor is the outside group; the referenced candidate/race (if any) is a human call in `/admin` (candidate + `stance` support/oppose). Pure-issue with no tracked race → stored unattributed (surfaces in the /ads statewide/outside-money view, not a race page).
- Sponsor→committee (Sunshine/FEC) best-effort to join the money picture (nice-to-have; not a gate).

## Display

- **Race page:** a "TV ad activity" module (new `src/components/guide/race-tv-ads.tsx` or fold into the ad-money panel) — per sponsor: exact spend, stations/markets, flight window, spot count; every row links to its FCC PDF. Framed "reported on FCC orders" (exact, not estimated).
- **/ads:** TV rows flow into the existing browser/analytics + the by-race overview (MOO-309 presentation) automatically once they're `ads` rows with `raceId`/`stance`.

## Error handling & edge cases

- Browserbase/FCC failure → `logSync` error + `alerts` row, skip the station, never crash (mirrors Meta/Google adapters). Per-session cap + retry/backoff.
- Akamai block on a download → retry via Browserbase; persistent failure → alert, leave the doc unfetched (re-tried next sync).
- Revised orders (same buy, new PDF) → new `fileManagerId` → new row; the review/UI shows both (station files supersede via revision, human resolves). Do not auto-merge in v1.
- No new/changed docs → no-op (idempotent).

## Testing

- **Unit (`convex/lib/tvExtract.test.ts`, node):** normalize/validate (date parsing "7.21-7.27" → flightStart/End; money parsing "$24,550.00"; office/party parsing "Barnes/D/Governor"); dedup by `fileManagerId`. **Fixture = the real Barnes order PDF text from the spike** (committed as a fixture) so extraction-normalize is tested against a genuine document.
- **Convex (`convex/adsTv.test.ts`, convex-test):** ingest an extracted TV ad → `ads` row with `platform:"tv"`, exact spend, `fccDocUrl`; re-ingest same `fileManagerId` → no duplicate; low-confidence → `review_tasks`, `candidateSlug` unset.
- **No new e2e.** Verify live on prod: sync ≥3 WI stations, show real `ads` rows with FCC URLs; open one PDF and confirm fields; approve one through review and see it on a race page; show one low-confidence held in review; re-run → counts unchanged.

## Success criteria (from the issue)

Daily sync enumerates political-file folders for the 3 DMAs' curated stations; new/changed docs fetched + stored with FCC URL; extraction into structured fields with per-field confidence; lands as `ads` (`platform:"tv"`) drafts + `review_tasks`, nothing public without approval; sponsor matched to committees where possible; race pages show TV activity (who/how much/stations/when) linking to the source doc; idempotent re-sync; Arize-traced.

## Open items for the build

- **Browserbase-in-Convex integration:** confirm the SDK/API usage from a Convex `"use node"` action (session create → navigate → scrape DOM → download PDF bytes → return). Key in Convex env (`BROWSERBASE_API_KEY`). This is the first thing the plan should de-risk (a tiny proving step) since the whole sync rides on it.
- **Curated station list:** complete the 3-DMA full-power TV station seed (have WISN-TV, WTMJ-TV). Milwaukee: WISN, WTMJ, WITI, WDJT; Madison: WMTV, WKOW, WISC, WMSN; Green Bay–Appleton: WBAY, WLUK, WGBA, WFRV (confirm call signs + folder URLs).
- **Volume/cost check:** measure docs-per-station-per-cycle in the tracked scope to size the daily Sonnet spend + review-queue load.
