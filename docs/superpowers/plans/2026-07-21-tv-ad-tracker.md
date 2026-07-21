# Broadcast TV Ad Tracker (FCC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily sync that pulls Wisconsin broadcast-TV political-ad orders from FCC public files (via Browserbase, since FCC blocks plain requests), extracts them with Sonnet, lands them as human-reviewed `ads` rows (`platform:"tv"`), and shows them on race pages linking to the source FCC PDF.

**Architecture:** Browserbase (hosted Chrome, driven from a Convex `"use node"` action via `playwright-core` over CDP) both enumerates folder listings (scrape DOM) and downloads order PDFs (CDP download → Browserbase REST retrieve). Sonnet extracts each PDF to structured fields. Ingest reuses the existing `ads` table + `adsMatch` + `review_tasks` trust posture. Exact TV spend (not ranges) flows into the MOO-309 by-race presentation.

**Tech Stack:** Convex (`"use node"` actions), `@browserbasehq/sdk` + `playwright-core`, Vercel AI SDK (`@ai-sdk/anthropic` + `generateObject`), Arize (manual spans via `convex/lib/agentTelemetry.ts`), Vitest + convex-test.

## Global Constraints

- **FCC access is Akamai-blocked to plain requests (verified 2026-07-21).** `/api/manager/*` (listings + downloads) returns 403 to curl / server `fetch()` / direct navigation / in-page `fetch()`. ALL FCC access goes through Browserbase. Downloads use the alternate host `https://files.fcc.gov/download/{fileManagerId}.pdf` as a browser navigation that fires a download event. Do NOT add a plain-`fetch()` FCC path.
- **Trust posture (inviolable):** only high-confidence, tracked-office name matches auto-attribute (`candidateSlug` set publicly); everything else → `review_tasks`, `candidateSlug` unset. Reuse `scoreAdMatch` (`convex/lib/adsMatch.ts`) and `openAdReviewTask` (`convex/ads.ts:174`). Nothing publishes without human approval.
- **TV spend is EXACT** (stated on the order): `spendLower = spendUpper = grossSpend`. UI frames it "reported on the FCC order," never "estimated" (opposite of Meta/Google midpoints).
- **Idempotency:** `platformAdId = fileManagerId` (FCC file UUID). Re-sync upserts via `by_platform_ad`; never duplicates; `upsertAd`'s existing `keepAttribution` preserves human attribution.
- **Scope:** curated full-power stations in 3 DMAs (seed `docs/superpowers/specs/fixtures/wi-tv-stations.csv`, `ad_relevant=yes` first). Ingest `State`+`Federal` folders filtered to tracked offices + ALL `Non-Candidate Issue Ads`. Skip `Local`, `Terms`.
- **Model:** Sonnet for extraction (`anthropic("claude-sonnet-5")`). Every LLM call wrapped in an Arize span (mirror `convex/qa.ts:149` / `convex/research.ts:287`).
- **Env (already set in prod):** `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`.
- **Styling (race module):** neo-brutalist semantic tokens only (`border-2 border-border`, `bg-card`, `shadow-[var(--shadow-brutal)]`, `text-muted-foreground`, `font-mono ... uppercase`); no hex, no `dark:`.
- **Deploy order:** `npx convex codegen` → `npx convex deploy -y` → `npx vercel deploy --prod --yes`. Keep the suite green (205 tests at plan time). Fixture: `docs/superpowers/specs/fixtures/2026-wisn-barnes-order.pdf`.

---

### Task 1: Browserbase-from-Convex de-risk spike (throwaway)

Prove the whole access mechanism works from a Convex prod action BEFORE building the adapter: create a Browserbase session, connect `playwright-core` over CDP, navigate a WISN folder, scrape doc rows, download one PDF, return its size + magic bytes. If this works, the rest is mechanical. If it doesn't, surface it now.

**Files:**
- Create: `convex/tvSpike.ts` (throwaway `internalAction`, deleted after Task 5 lands)
- Install: `pnpm add @browserbasehq/sdk playwright-core`

**Steps:**

- [ ] **Step 1: Install deps** — `pnpm add @browserbasehq/sdk playwright-core`
- [ ] **Step 2: Write the spike action**

```ts
// convex/tvSpike.ts
"use node";
import { internalAction } from "./_generated/server";
import { Browserbase } from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

export const tvSpike = internalAction({
  args: {},
  handler: async () => {
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
    const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    try {
      const ctx = browser.contexts()[0];
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow", downloadPath: "downloads", eventsEnabled: true,
      });

      // Enumerate: WISN 2026 State candidate folder — scrape doc rows from the DOM.
      await page.goto("https://publicfiles.fcc.gov/tv-profile/WISN-TV/political-files/2026/state/barnes-for-governor/b27dca30-a82d-1020-be71-f8f1e5aab4d4", { waitUntil: "networkidle" });
      const docs = await page.evaluate(() =>
        [...document.querySelectorAll("a")]
          .map((a) => ({ text: (a.textContent || "").replace(/\s+/g, " ").trim(), href: (a as HTMLAnchorElement).href }))
          .filter((l) => /\/api\/manager\/download\//.test(l.href)),
      );

      // Download one PDF via the alternate host (fires a download event).
      const fileManagerId = docs[0].href.split("/").pop()!.replace(".pdf", "");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.goto(`https://files.fcc.gov/download/${fileManagerId}.pdf`).catch(() => null),
      ]);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(Buffer.from(c));
      const buf = Buffer.concat(chunks);
      return { docCount: docs.length, firstDoc: docs[0]?.text, pdfBytes: buf.length, magic: buf.subarray(0, 5).toString("latin1") };
    } finally {
      await browser.close();
    }
  },
});
```

- [ ] **Step 3: codegen + run on prod**

Run: `npx convex codegen && npx convex deploy -y && npx convex run tvSpike:tvSpike --prod`
Expected: `{ docCount: >=1, firstDoc: "Barnes...", pdfBytes: ~110000, magic: "%PDF-" }`.

**If `page.waitForEvent("download")` doesn't fire** (Browserbase may not stream the file to the client): fall back to the REST retrieval — after the navigation, `GET https://api.browserbase.com/v1/downloads?sessionId=${session.id}` (header `x-bb-api-key`), then `GET /v1/downloads/{id}` with `Accept: application/octet-stream` → bytes. Record which mechanism worked in the report; Task 5 uses that one.

- [ ] **Step 4: Commit** (spike, kept until Task 5 replaces it)

```bash
git add convex/tvSpike.ts convex/_generated package.json pnpm-lock.yaml
git commit -m "spike: prove Browserbase FCC access from Convex (MOO-318)"
```

**BLOCKED handling:** if Browserbase-from-Convex fails (deps too heavy for `"use node"`, CDP connect fails, downloads unreachable), STOP and report — the plan's approach needs revisiting before proceeding.

---

### Task 2: Schema — `platform:"tv"` + TV fields

**Files:**
- Modify: `convex/schema.ts` (ads table + platform validators), `convex/ads.ts` (`platformValidator`, `adWriteFields`)
- Test: `convex/adsTv.test.ts` (created here, extended in Task 5)

**Interfaces produced:** `ads` rows accept `platform:"tv"` + optional `station`, `dma`, `spotCount`, `flightStart`, `flightEnd`, `fccDocUrl`, `orderRef`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/adsTv.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

describe("ads schema — tv", () => {
  test("accepts a platform:tv row with TV fields", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert("ads", {
      platform: "tv", platformAdId: "fm-uuid-1", pageOrCommittee: "Barnes/D/Governor",
      spendLower: 24550, spendUpper: 24550, station: "WISN-TV", dma: "Milwaukee",
      spotCount: 18, flightStart: "2026-07-14", flightEnd: "2026-07-20",
      fccDocUrl: "https://publicfiles.fcc.gov/x.pdf", orderRef: "4443972",
      firstSeenAt: 0, lastSeenAt: 0,
    } as any));
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.platform).toBe("tv");
    expect(row?.station).toBe("WISN-TV");
  });
});
```

- [ ] **Step 2: Run — fails** (`platform` union rejects `"tv"`): `npx vitest run convex/adsTv.test.ts` → FAIL.
- [ ] **Step 3: Widen the schema.** In `convex/schema.ts` ads table, change `platform: v.union(v.literal("meta"), v.literal("google"))` → add `v.literal("tv")`, and add the optional fields (per Global Constraints). In `convex/ads.ts`, update the `platformValidator`/`adWriteFields` (grep both) to include `"tv"` and the new optional fields. Run `npx convex codegen`.
- [ ] **Step 4: Run — passes.** `npx vitest run convex/adsTv.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: ads schema supports platform:tv + TV order fields (MOO-318)` (include `convex/_generated`).

---

### Task 3: Pure extraction/normalize lib (`convex/lib/tvExtract.ts`)

Pure functions to normalize the LLM's raw output into `ads`-ready values, plus the extraction result type. Unit-tested against the real Barnes order.

**Files:** Create `convex/lib/tvExtract.ts`, `convex/lib/tvExtract.test.ts`.

**Interfaces produced:**
```ts
export type TvAdExtraction = {
  advertiser: string; party?: string; office?: string; candidateName?: string;
  station: string; dma?: string; flightStart?: string; flightEnd?: string;
  spotCount?: number; grossSpend?: number; netSpend?: number;
  agency?: string; orderRef?: string; confidence: Record<string, number>;
};
export function parseFlightDates(name: string): { start?: string; end?: string }; // "Barnes Gov 7.21-7.27" (year from folder) → ISO
export function parseMoney(s: string): number | undefined; // "$24,550.00" → 24550
export function toAdWrite(x: TvAdExtraction, meta: { fileManagerId: string; fccDocUrl: string; year: number }): {
  platform: "tv"; platformAdId: string; pageOrCommittee: string;
  spendLower?: number; spendUpper?: number; station: string; dma?: string;
  spotCount?: number; flightStart?: string; flightEnd?: string; fccDocUrl: string; orderRef?: string;
}; // exact spend → spendLower=spendUpper=grossSpend
```

- [ ] **Step 1: Write failing tests** — `parseMoney("$24,550.00") === 24550`; `parseFlightDates("Barnes Gov 7.21-7.27", 2026)` → `{start:"2026-07-21", end:"2026-07-27"}`; `toAdWrite` sets `spendLower===spendUpper===grossSpend` and passes `fileManagerId` as `platformAdId`. Run → FAIL.
- [ ] **Step 2: Implement** the three pure functions (no Convex imports).
- [ ] **Step 3: Run — pass.** `npx vitest run convex/lib/tvExtract.test.ts`.
- [ ] **Step 4: Commit** `feat: tvExtract pure normalize lib (MOO-318)`.

---

### Task 4: Sonnet PDF extraction (`convex/tvExtractAgent.ts`)

An internal action that takes PDF bytes → `TvAdExtraction` via the AI SDK (Sonnet, document input), wrapped in an Arize span. No unit test (LLM); verified against the committed fixture in this task, and live in Task 7.

**Files:** Create `convex/tvExtractAgent.ts`. Reference: `convex/qa.ts:133-160` (generateObject + span pattern), `convex/lib/agentTelemetry.ts` (`tracer()`).

**Interface produced:** `internal.tvExtractAgent.extractTvAd({ pdfBase64, hintName })` → `TvAdExtraction`.

- [ ] **Step 1: Implement** — `generateObject({ model: anthropic("claude-sonnet-5"), schema: <zod for TvAdExtraction>, messages: [{ role:"user", content: [{ type:"text", text: PROMPT }, { type:"file", data: Buffer.from(pdfBase64,"base64"), mediaType:"application/pdf" }] }] })`. PROMPT: extract advertiser/party/office/candidate/station/dma/flight dates/spots/gross+net/agency/orderRef, with a per-field 0..1 confidence; instruct "transcribe only what the order states; leave unknowns null." Wrap in `tracer().startSpan("claude.tvExtract")` recording model + token usage (mirror qa.ts).
- [ ] **Step 2: Verify against the fixture (manual, live).** Add a temporary `internalAction tvExtractFixture` that reads `docs/superpowers/specs/fixtures/2026-wisn-barnes-order.pdf`, base64s it, calls `extractTvAd`. Run `npx convex run tvExtractAgent:tvExtractFixture --prod`. Expected: advertiser≈"Barnes/D/Governor", station "WISN", grossSpend 24550, spotCount 18, flight 2026-07-14/2026-07-20. Remove the temp action after confirming.
- [ ] **Step 3: Commit** `feat: Sonnet TV-order PDF extraction, Arize-traced (MOO-318)`.

---

### Task 5: Enumeration + ingest sync (`convex/adsTv.ts`) — replaces the spike

The real daily sync. For each seeded station: Browserbase-navigate `political-files/2026`, walk the in-scope category folders, scrape candidate/sponsor subfolders + doc rows, filter, download each NEW/changed doc, extract (Task 4), `upsertAd({platform:"tv", ...})` + review task. Idempotent.

**Files:** Create `convex/adsTv.ts` (`"use node"` internalAction `syncTvAds` + helpers); delete `convex/tvSpike.ts`. Modify: `convex/ads.ts` if reusing `upsertAd`/`openAdReviewTask`/`listCandidatesForMatching`/`ingest` scoring (import them). Extend `convex/adsTv.test.ts`.

**Interfaces consumed:** `internal.tvExtractAgent.extractTvAd`, `toAdWrite`/`parseFlightDates` (Task 3), `internal.ads.upsertAd` + `openAdReviewTask` + `listCandidatesForMatching`, `scoreAdMatch` (`convex/lib/adsMatch.ts`), the station seed CSV (embed as a typed const `TV_STATIONS` generated from the CSV — 16 `ad_relevant` stations).

- [ ] **Step 1: Write the ingest convex-test first** (the testable core, isolating Browserbase). Factor ingest into a pure-ish `ingestTvDoc(ctx, extraction, meta, candidates)` that does match→upsert→review (no network). Test: seed a Governor race + `mandela-barnes` candidate; call `ingestTvDoc` with a Barnes extraction → one `ads` row `platform:"tv"`, `spendLower===spendUpper===24550`, `fccDocUrl` set; re-call same `fileManagerId` → still ONE row (dedup); a low-confidence/unmatched sponsor → `candidateSlug` unset + a `review_tasks` row. Run → FAIL, then implement `ingestTvDoc`, then PASS.
- [ ] **Step 2: Implement the Browserbase enumeration + download** (`"use node"`): a `withBrowserbase(fn)` helper (session create → connectOverCDP → CDP download behavior → `fn(page)` → close, mirrors Task 1, using the download mechanism Task 1 proved). `enumerateStation(page, station)` navigates `/tv-profile/{callSign}/political-files/2026`, follows the in-scope category folders (State/Federal filtered to tracked offices, all Non-Candidate Issue Ads), scrapes `{name, uploadDate, folderId, fileManagerId, fccDocUrl}` for each doc. `downloadPdf(page, fileManagerId)` returns base64.
- [ ] **Step 3: Implement `syncTvAds`** — load candidates (`listCandidatesForMatching`), for each station enumerate; for each doc whose `fileManagerId` is unseen (query `ads` `by_platform_ad`) or `uploadDate` newer, download → `extractTvAd` → `ingestTvDoc`. `logSync` per station; wrap failures so one station's error alerts + continues (mirror `syncMetaAds`). Cap docs/session; Arize-trace the run.
- [ ] **Step 4: Run tests + verify.** `npx vitest run convex/adsTv.test.ts` PASS; `npx tsc --noEmit` clean. Delete `convex/tvSpike.ts`.
- [ ] **Step 5: Commit** `feat: TV ad sync — Browserbase enumerate+download, extract, ingest (MOO-318)`.

---

### Task 6: Race-page TV module (`src/components/guide/race-tv-ads.tsx`)

Server component listing a race's TV ads: per sponsor, exact spend, stations/markets, flight window, spot count, link to the FCC PDF. Wire into the race page. No unit test (spec: verify visually); tsc + build gate.

**Files:** Create `src/components/guide/race-tv-ads.tsx`; Modify `src/lib/data.ts` (fetcher `getTvAdsForRace` via a new public query `api.adsTv.tvAdsForRace` or reuse `adsForCandidate` filtered to `platform:"tv"`), `src/app/races/[slug]/page.tsx` (render + SectionNav entry).

- [ ] **Step 1:** Add a public query `tvAdsForRace(raceId)` (attributed `platform:"tv"` ads for the race, via `by_candidate`), and the `src/lib/data.ts` fetcher.
- [ ] **Step 2:** Build `RaceTvAds` — neo-brutalist cards/rows; each links to `fccDocUrl` (target=_blank rel=noopener); copy frames spend as "reported on FCC orders." Empty state: quiet "No TV ads tracked in this race yet."
- [ ] **Step 3:** Render on the race page after the ad-money panel; add `{ id: "tv-ads", label: "TV ads" }` to `navSections` when present.
- [ ] **Step 4:** `npx tsc --noEmit && npx next build` clean.
- [ ] **Step 5: Commit** `feat: race-page TV ad activity module (MOO-318)`.

---

### Task 7: Cron + deploy + live verification

**Files:** Modify `convex/crons.ts` (add `crons.daily("sync TV ads", { hourUTC: 13, minuteUTC: 30 }, internal.adsTv.syncTvAds, {})`).

- [ ] **Step 1:** Full gate — `npx vitest run && npx tsc --noEmit && npx next build` all clean.
- [ ] **Step 2:** Add the cron; deploy: `npx convex deploy -y && npx vercel deploy --prod --yes`.
- [ ] **Step 3:** Live sync — `npx convex run adsTv:syncTvAds --prod` (or a curated 3-station subset first). Confirm real `ads` rows `platform:"tv"` with `fccDocUrl`, and `review_tasks` for unmatched.
- [ ] **Step 4:** Prove the acceptance checklist: open one row's FCC PDF, confirm fields; approve one via `/admin`, see it on the race page; show one low-confidence held in review; re-run sync → row counts unchanged (idempotent).
- [ ] **Step 5:** Post evidence to MOO-318, mark Done. Commit any final chore.

---

## Self-Review

**Spec coverage:** daily enumeration (T5) ✓; extraction w/ per-field confidence (T4) ✓; `ads(platform:tv)` drafts + review, human-gated (T5) ✓; sponsor→committee is best-effort (noted, not a task — acceptable per spec "where possible"); race-page display linking to source (T6) ✓; idempotent (T5 test) ✓; Arize-traced (T4/T5) ✓; candidate + issue ads (T5 enumeration scope) ✓; Browserbase-only access (T1 constraint) ✓.

**Placeholder scan:** the Browserbase download mechanism has a documented fork (download-event vs REST) resolved live in T1 — not a placeholder but an explicit de-risk, per the "spike first" decision. No TBD/TODO.

**Type consistency:** `TvAdExtraction`, `toAdWrite`, `fileManagerId`-as-`platformAdId`, `spendLower===spendUpper===grossSpend` consistent T3→T4→T5. `platform:"tv"` widened once (T2), used throughout.

**Note:** sponsor→committee matching (Sunshine/FEC join) is intentionally minimal in v1 (best-effort, no dedicated task) — if the build wants it richer, add a task; the spec marks it "where possible."
