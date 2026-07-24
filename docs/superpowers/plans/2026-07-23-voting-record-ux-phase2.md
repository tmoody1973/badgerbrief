# Voting-record UX — Phase 2 (Bill Enrichment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill each vote row's `summary` with the first sentence of the official Legislative Reference Bureau (LRB) analysis of the bill, fetched once per unique `(session, billNumber)` and joined into `votingRecordPage`.

**Architecture:** A new `bills` table caches per-bill `{billUrl, summary}`. A `"use node"` `enrich` action walks the distinct bills in `legislative_votes` (per session, so reads stay bounded), fetches each bill's LRB page, parses the first analysis sentence, and stores it (or `null` when the bill has no analysis — e.g. many resolutions). `votingRecordPage` looks up `bills` for its returned rows and replaces the current `summary: null` with the cached summary. A weekly cron keeps new bills enriched. **Backend-only** — Phase 1's client island already renders `summary` on row-expand, so no frontend change or Vercel deploy.

**Tech Stack:** Convex (queries + actions + convex-test), Vitest. External source: `docs.legis.wisconsin.gov` bill proposal pages.

## Global Constraints

- **Neutrality (load-bearing):** the summary is the LRB's OWN words, quoted verbatim — never AI-generated, never paraphrased. If a bill has no LRB analysis, the summary is `null` (the row shows title + "Full bill ↗" only). This mirrors the feature's "we don't rate or score votes" rule.
- **LRB source (verified):** `https://docs.legis.wisconsin.gov/{session}/related/proposals/{billnumber}` (billNumber lowercased, spaces stripped — reuse `billUrl` from `convex/lib/votingRecord.ts`). The analysis body is `<div class="qs_anal_text_">…</div>`; absent on bills/resolutions with no analysis. Verified: 2011 AB110 ✓, 2015 AB21 ✓, 2023 SJR1 ✓ (has analysis), 2013 AJR1 (no analysis → null).
- **First-sentence rule:** LRB double-spaces after a sentence-ending period; statutory cites (`s. 20.005`) use a single space and decimals have no space, so a period followed by **2+ whitespace** is the sentence boundary. Never split on a single-space period.
- **Convex read/write limit:** a single query/mutation/action step may touch at most **4096 documents**. `legislative_votes` already holds ~3,000+ rows and grows, so NEVER `.collect()` the whole table — read per session via `by_session_chamber` (bounded). (This exact limit already bit `backfillLegislatorSession` in Phase 1.)
- **`Date.now()`** is allowed in Convex functions (used by `storeRollCall`); use it for `fetchedAt`.
- **Bill-number format:** `legislative_votes.billNumber` is `"AB 388"` (with a space). Store that verbatim as the `bills.billNumber` join key; only the URL lowercases/strips it.
- **Tests:** `npx vitest run <file>`; `npx tsc --noEmit` separate. A NEW module or NEW table requires `npx convex codegen` (commit `convex/_generated`); adding a function to an existing module does not.
- **Do not** re-implement `billUrl` — it already lives in `convex/lib/votingRecord.ts`. Do not touch `api.votesQueries.votingRecord` (the chat tool).

---

### Task 1: LRB first-sentence parser (`parseLrbFirstSentence`)

Pure, tested extraction of the first LRB analysis sentence from a bill page's HTML. No network.

**Files:**
- Create: `convex/lib/billAnalysis.ts`
- Create: `convex/lib/billAnalysis.test.ts`

**Interfaces:**
- Produces: `parseLrbFirstSentence(html: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/billAnalysis.test.ts
import { describe, expect, test } from "vitest";
import { parseLrbFirstSentence } from "./billAnalysis";

// The real markup: an analysis body div with <br/> line-wraps and LRB's
// double-space after each sentence-ending period.
const AB388 =
  '<div class="qs_anal_text_" data-path="/x">\n' +
  "This bill creates a child care center renovations revolving loan program, under <br/>" +
  "which the Wisconsin Economic Development Corporation must award loans to <br/>" +
  "licensed child care providers for the purpose of making renovations to their facilities.  <br/>" +
  "Under the bill, 60 percent of the loans must go to in-home licensed child care <br/>providers." +
  "</div>";

describe("parseLrbFirstSentence", () => {
  test("returns the first LRB analysis sentence, tags and line-wraps removed", () => {
    expect(parseLrbFirstSentence(AB388)).toBe(
      "This bill creates a child care center renovations revolving loan program, under which the Wisconsin Economic Development Corporation must award loans to licensed child care providers for the purpose of making renovations to their facilities.",
    );
  });

  test("returns null when there is no analysis section (e.g. a resolution)", () => {
    expect(parseLrbFirstSentence("<div class='qs_prefix_'>SESSION SCHEDULE</div>")).toBeNull();
    expect(parseLrbFirstSentence("")).toBeNull();
  });

  test("does not split on a single-space statutory cite or a decimal", () => {
    // "s. 20.005" (single space) and "20.005" (decimal) must not end the sentence;
    // only the double-space before "The Department" does.
    const html =
      '<div class="qs_anal_text_">This bill amends s. 20.005 (1) of the statutes to appropriate $1.5 million.  ' +
      "The Department administers the grant.</div>";
    expect(parseLrbFirstSentence(html)).toBe(
      "This bill amends s. 20.005 (1) of the statutes to appropriate $1.5 million.",
    );
  });

  test("caps a run-on first block that has no double-space boundary", () => {
    const long = "This bill does a thing " + "and another ".repeat(60); // >320 chars, no ". "
    expect(parseLrbFirstSentence(`<div class="qs_anal_text_">${long}</div>`)!.length).toBeLessThanOrEqual(305);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/lib/billAnalysis.test.ts`
Expected: FAIL — cannot resolve `./billAnalysis`.

- [ ] **Step 3: Implement**

```ts
// convex/lib/billAnalysis.ts
/**
 * Pure extraction of the first sentence of a bill's Legislative Reference
 * Bureau analysis from its docs.legis.wisconsin.gov proposal page. No network —
 * the fetching lives in the "use node" action; this is the tested core.
 *
 * The analysis body is a <div class="qs_anal_text_"> with <br/> line-wraps.
 * LRB double-spaces after a sentence-ending period, while statutory cites
 * ("s. 20.005") use a single space and decimals ("20.005", "$1.5") have none —
 * so a period followed by 2+ whitespace is the only reliable sentence boundary.
 */
export function parseLrbFirstSentence(html: string): string | null {
  const m = html.match(/<div class="qs_anal_text_"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  // Strip tags to nothing (not to a space) so the source spacing — including the
  // double-space after a sentence — survives; a <br/> mid-sentence just rejoins
  // the two halves with the single space that already sat before it.
  const text = m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const boundary = text.search(/\.\s{2,}/);
  const sentence = boundary === -1 ? text : text.slice(0, boundary + 1);
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return null;
  // Guard against a run-on block with no double-space boundary.
  if (clean.length > 305) return clean.slice(0, 300).replace(/\s+\S*$/, "") + "…";
  return clean;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/lib/billAnalysis.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/billAnalysis.ts convex/lib/billAnalysis.test.ts
git commit -m "feat(bills): parseLrbFirstSentence — first LRB analysis sentence"
```

---

### Task 2: `bills` table + `billsQueries.ts` (storeBill, unenrichedBillsForSession)

The cache table and its plain (non-node) storage/lookup functions.

**Files:**
- Modify: `convex/schema.ts` (add `bills` table)
- Create: `convex/billsQueries.ts`
- Create: `convex/billsQueries.test.ts`

**Interfaces:**
- Produces:
  - `bills` table: `{ session: string; billNumber: string; billUrl: string; summary: string | null; fetchedAt: number }`, index `by_session_bill` on `["session", "billNumber"]`.
  - `internal.billsQueries.storeBill({ session, billNumber, billUrl, summary })` — upsert by `(session, billNumber)`; returns `{ stored: "inserted" | "updated" }`.
  - `internal.billsQueries.unenrichedBillsForSession({ session }): string[]` — distinct `billNumber`s in that session's `legislative_votes` with no `bills` row yet.

- [ ] **Step 1: Write the failing tests**

```ts
// convex/billsQueries.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

/** Minimal legislative_votes row for a given session/bill. */
async function seedRoll(t: ReturnType<typeof convexTest>, session: string, chamber: "assembly" | "senate", voteId: string, billNumber: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("legislative_votes", {
      voteKey: `${session}-${chamber}-${voteId}`,
      session, chamber, voteId, billNumber,
      billTitle: "X", voteType: "PASSAGE", votedOn: `${session}-01-01`,
      ayes: 1, nays: 0, notVoting: 0, sourceUrl: "http://x", ingestedAt: 0,
    });
  });
}

describe("storeBill", () => {
  test("inserts then updates the same (session, billNumber) without duplicating", async () => {
    const t = convexTest(schema, modules);
    const args = { session: "2023", billNumber: "AB 388", billUrl: "http://u", summary: null as string | null };
    expect(await t.mutation(internal.billsQueries.storeBill, args)).toEqual({ stored: "inserted" });
    expect(await t.mutation(internal.billsQueries.storeBill, { ...args, summary: "This bill…" })).toEqual({ stored: "updated" });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("bills").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0].summary).toBe("This bill…");
    });
  });
});

describe("unenrichedBillsForSession", () => {
  test("returns each distinct billNumber in the session not yet in bills", async () => {
    const t = convexTest(schema, modules);
    // Two roll calls on AB 1 (same bill), one on AB 2, all in 2013.
    await seedRoll(t, "2013", "assembly", "av1", "AB 1");
    await seedRoll(t, "2013", "assembly", "av2", "AB 1");
    await seedRoll(t, "2013", "assembly", "av3", "AB 2");
    // A different session must not leak in.
    await seedRoll(t, "2015", "assembly", "av9", "AB 9");
    // AB 1 is already enriched.
    await t.mutation(internal.billsQueries.storeBill, { session: "2013", billNumber: "AB 1", billUrl: "http://u", summary: "x" });

    const out = await t.query(internal.billsQueries.unenrichedBillsForSession, { session: "2013" });
    expect(out.sort()).toEqual(["AB 2"]); // AB 1 already enriched; AB 9 is 2015
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/billsQueries.test.ts`
Expected: FAIL — `bills` table / `billsQueries` not defined.

- [ ] **Step 3: Add the `bills` table to the schema**

In `convex/schema.ts`, add (alongside the other tables, e.g. after `legislator_votes`):

```ts
  // Per-bill LRB analysis cache. summary is the first analysis sentence, or null
  // when the bill/resolution has no LRB analysis. Keyed by session+billNumber
  // (bill numbers reset each biennium, so session is part of the key).
  bills: defineTable({
    session: v.string(),
    billNumber: v.string(),
    billUrl: v.string(),
    summary: v.union(v.string(), v.null()),
    fetchedAt: v.number(),
  }).index("by_session_bill", ["session", "billNumber"]),
```

- [ ] **Step 4: Implement `billsQueries.ts`**

```ts
// convex/billsQueries.ts
/**
 * Storage + lookup for the per-bill LRB analysis cache. Plain functions only —
 * the fetching action lives in convex/bills.ts ("use node").
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const CHAMBERS = ["assembly", "senate"] as const;

/** Upsert one bill's analysis by (session, billNumber). */
export const storeBill = internalMutation({
  args: {
    session: v.string(),
    billNumber: v.string(),
    billUrl: v.string(),
    summary: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { session, billNumber, billUrl, summary }): Promise<{ stored: "inserted" | "updated" }> => {
    const existing = await ctx.db
      .query("bills")
      .withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { billUrl, summary, fetchedAt: Date.now() });
      return { stored: "updated" };
    }
    await ctx.db.insert("bills", { session, billNumber, billUrl, summary, fetchedAt: Date.now() });
    return { stored: "inserted" };
  },
});

/**
 * Distinct billNumbers voted on in this session that have no bills row yet.
 * Reads per session (both chambers) via by_session_chamber so a single
 * execution stays well under the 4096-document limit even as the corpus grows.
 */
export const unenrichedBillsForSession = internalQuery({
  args: { session: v.string() },
  handler: async (ctx, { session }): Promise<string[]> => {
    const billNumbers = new Set<string>();
    for (const chamber of CHAMBERS) {
      const rows = await ctx.db
        .query("legislative_votes")
        .withIndex("by_session_chamber", (q) => q.eq("session", session).eq("chamber", chamber))
        .collect();
      for (const r of rows) billNumbers.add(r.billNumber);
    }
    const out: string[] = [];
    for (const billNumber of billNumbers) {
      const existing = await ctx.db
        .query("bills")
        .withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber))
        .unique();
      if (!existing) out.push(billNumber);
    }
    return out;
  },
});
```

- [ ] **Step 5: Regenerate Convex types (new table + new module)**

Run: `npx convex codegen`
Expected: `convex/_generated` updates cleanly.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run convex/billsQueries.test.ts`
Expected: PASS (both describes).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/billsQueries.ts convex/billsQueries.test.ts convex/_generated
git commit -m "feat(bills): bills table + storeBill/unenrichedBillsForSession"
```

---

### Task 3: `enrich` action + weekly cron

The `"use node"` action that fetches each unenriched bill's LRB page, parses the first sentence, and stores it. Fetch failure → skip (retry next run); fetched-but-no-analysis → store `null` (don't retry forever).

**Files:**
- Create: `convex/bills.ts`
- Modify: `convex/crons.ts`

**Interfaces:**
- Consumes: `internal.billsQueries.unenrichedBillsForSession`, `internal.billsQueries.storeBill`, `billUrl` (`./lib/votingRecord`), `parseLrbFirstSentence` (`./lib/billAnalysis`).
- Produces: `internal.bills.enrich({ limit?: number }): { stored: number; storedNull: number; fetchFailed: number }`.

- [ ] **Step 1: Implement the action**

```ts
// convex/bills.ts
"use node";
/**
 * Enrich the bills cache with each bill's first LRB analysis sentence.
 *
 * Source is docs.legis.wisconsin.gov proposal pages, one fetch per unique
 * (session, billNumber). A fetch failure is NOT stored (so it retries next
 * run); a successful fetch with no analysis IS stored with summary=null (so it
 * is not retried forever). Bounded per run by `limit`.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { billUrl } from "./lib/votingRecord";
import { parseLrbFirstSentence } from "./lib/billAnalysis";

const SESSIONS = ["2025", "2023", "2019", "2017", "2015", "2013", "2011"];
const UA = "BadgerBrief/1.0 (nonpartisan voter guide; +https://badgerbrief.org)";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch (error) {
    return null;
  }
}

export const enrich = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 300 }): Promise<{ stored: number; storedNull: number; fetchFailed: number }> => {
    let stored = 0;
    let storedNull = 0;
    let fetchFailed = 0;
    for (const session of SESSIONS) {
      if (stored + storedNull + fetchFailed >= limit) break;
      const billNumbers: string[] = await ctx.runQuery(
        internal.billsQueries.unenrichedBillsForSession,
        { session },
      );
      for (const billNumber of billNumbers) {
        if (stored + storedNull + fetchFailed >= limit) break;
        const url = billUrl(session, billNumber);
        const html = await fetchText(url);
        if (html === null) {
          fetchFailed++;
          continue; // do not store — retry next run
        }
        const summary = parseLrbFirstSentence(html);
        await ctx.runMutation(internal.billsQueries.storeBill, {
          session, billNumber, billUrl: url, summary,
        });
        if (summary === null) storedNull++;
        else stored++;
      }
    }
    return { stored, storedNull, fetchFailed };
  },
});
```

- [ ] **Step 2: Add the weekly cron**

In `convex/crons.ts`, after the existing "ingest legislative roll calls" cron, add:

```ts
// Sundays 12:30 UTC — 30 min after the roll-call ingest, so bills from today's
// new roll calls get their LRB analysis in the same weekly pass. Already-enriched
// bills are skipped, so a full pass is cheap once the backfill has run.
crons.weekly(
  "enrich bill analyses",
  { dayOfWeek: "sunday", hourUTC: 12, minuteUTC: 30 },
  internal.bills.enrich,
  {},
);
```

- [ ] **Step 3: Regenerate Convex types (new module)**

Run: `npx convex codegen`
Expected: `convex/_generated` updates (adds `internal.bills.enrich`).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify on the dev deployment with a tiny live run**

```bash
npx convex dev --once
npx convex run bills:enrich '{"limit":3}'
```
Expected: returns `{ stored, storedNull, fetchFailed }` with `stored + storedNull + fetchFailed <= 3`. (Dev may have few/no roll calls; a `{0,0,0}` result is fine — the point is the action loads and runs without error.) If dev has roll-call data, confirm at least one `stored` bill has a real sentence:
```bash
npx convex run --help >/dev/null # (no-op; the check below reads via the query added in Task 4 on prod)
```

- [ ] **Step 6: Commit**

```bash
git add convex/bills.ts convex/crons.ts convex/_generated
git commit -m "feat(bills): enrich action (LRB fetch) + weekly cron"
```

---

### Task 4: Join `bills` into `votingRecordPage`

Replace the hard-coded `summary: null` with a per-row lookup against the `bills` cache.

**Files:**
- Modify: `convex/votesQueries.ts` (`votingRecordPage` rows-build block)
- Modify: `convex/votesQueries.test.ts`

**Interfaces:**
- Consumes: `bills` table + `by_session_bill` index (Task 2).
- Produces: `votingRecordPage` rows now carry the cached `summary` (string when the bill is enriched with an analysis, else `null`).

- [ ] **Step 1: Write the failing test**

Add to `convex/votesQueries.test.ts` (inside the existing `describe("votingRecordPage", ...)`; it already has `seedTwo`/`seedCandidate` helpers):

```ts
  test("attaches the bill summary from the bills cache", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL }); // 2023 AB 388
    // Enrich AB 388 in the bills cache.
    await t.mutation(internal.billsQueries.storeBill, {
      session: "2023", billNumber: "AB 388", billUrl: "http://u", summary: "This bill creates a program.",
    });
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023" });
    expect(res.rows[0].summary).toBe("This bill creates a program.");
  });

  test("summary is null when the bill is not in the cache", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023" });
    expect(res.rows[0].summary).toBeNull();
  });
```

(Add `import { internal } from "./_generated/api";` at the top of the test file if it is not already imported — it is, since other tests use `internal.votesQueries.*`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/votesQueries.test.ts -t "bill summary from the bills cache"`
Expected: FAIL — `res.rows[0].summary` is `null`, not `"This bill creates a program."`.

- [ ] **Step 3: Implement the join**

In `convex/votesQueries.ts`, replace the `const rows = filtered.slice(0, cap).map((r) => ({ ... summary: null as string | null, }));` block with an async lookup:

```ts
    const total = filtered.length;
    const rows = await Promise.all(
      filtered.slice(0, cap).map(async (r) => {
        const bill = await ctx.db
          .query("bills")
          .withIndex("by_session_bill", (q) =>
            q.eq("session", r.vote.session).eq("billNumber", r.vote.billNumber),
          )
          .unique();
        return {
          billNumber: r.vote.billNumber,
          billTitle: r.vote.billTitle,
          voteType: r.vote.voteType,
          votedOn: r.vote.votedOn,
          chamber: r.vote.chamber,
          session: r.vote.session,
          position: r.position,
          ayes: r.vote.ayes,
          nays: r.vote.nays,
          sourceUrl: r.vote.sourceUrl,
          otherVotesOnBill: (perBill.get(r.vote.billNumber) ?? 1) - 1,
          billUrl: billUrl(r.vote.session, r.vote.billNumber),
          summary: bill?.summary ?? null,
        };
      }),
    );
```

(Only the sliced page — ≤ `cap` (25) rows — does a `bills` lookup, so the added reads are bounded.)

- [ ] **Step 4: Run the votingRecordPage tests**

Run: `npx vitest run convex/votesQueries.test.ts -t votingRecordPage`
Expected: PASS — both new summary tests plus all existing votingRecordPage tests.

- [ ] **Step 5: Full suite + type-check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add convex/votesQueries.ts convex/votesQueries.test.ts
git commit -m "feat(votes): join bills cache into votingRecordPage summary"
```

---

### Task 5: Deploy + backfill enrichment (prod, ops)

**Files:** none (operational). Backend-only — the Phase 1 island already renders `summary` on expand, so NO Vercel deploy.

- [ ] **Step 1: Deploy Convex**

Run: `npx convex deploy -y`
Expected: schema push adds the `bills` table + `by_session_bill` index; functions deploy.

- [ ] **Step 2: Drain the enrichment backfill**

The corpus is ~1,000–1,500 unique bills; each `enrich` run is capped (default 300) and fetches ~300 external pages, so run it repeatedly until nothing new is stored:

```bash
while true; do
  out=$(npx convex run --prod bills:enrich '{"limit":300}' 2>/dev/null)
  echo "$out"
  echo "$out" | grep -q '"stored": 0' && echo "$out" | grep -q '"storedNull": 0' && break
done
```
Expected: successive `{ stored, storedNull, fetchFailed }` lines; stop when a run stores nothing new (`stored:0, storedNull:0`). `fetchFailed` may be non-zero transiently (network) — those bills retry on the next run/cron.

- [ ] **Step 3: Verify a real summary flows through the public query path**

```bash
npx convex run --prod votesQueries:votingRecordPage '{"candidateSlug":"francesca-hong","session":"2025","limit":5}'
```
Expected: at least one row has a non-null `summary` that reads as the LRB's first sentence (e.g. "This bill …"). Rows for resolutions with no analysis stay `summary: null`.

- [ ] **Step 4: Confirm live rendering (no deploy needed)**

Open a candidate page (e.g. `/candidates/francesca-hong`), expand the newest session, and confirm at least one vote row shows the "What this bill does" expander with the LRB sentence + "— LRB analysis", and "Full bill ↗". Resolution rows without analysis show no expander (title + links only).

---

## Self-Review

**Spec coverage (Phase 2 — Bill Enrichment):**
- `bills` table `{session, billNumber, billUrl, summary, fetchedAt}` + `by_session_bill` → Task 2. ✓
- `enrich` action fetches LRB analysis once per unique (session, billNumber), deduped, incremental + weekly cron → Task 3. ✓
- First-sentence LRB parse, resolution/no-analysis → null fallback → Task 1. ✓
- Neutrality: LRB verbatim, never AI-generated → Task 1 (quotes the source div) + Global Constraints. ✓
- `votingRecordPage` fills `summary` from cache; graceful null when un-enriched → Task 4. ✓
- Backend-only (Phase 1 island renders it) → no frontend task; Task 5 notes no Vercel deploy. ✓

**Placeholder scan:** none — every step has runnable code/commands.

**Type consistency:** `storeBill` args `{session, billNumber, billUrl, summary: string|null}` match the `bills` table shape (Task 2) and the `enrich` action's call (Task 3). `unenrichedBillsForSession` returns `string[]` (Task 2), consumed as `string[]` in Task 3. `parseLrbFirstSentence(html): string|null` (Task 1) feeds `storeBill.summary` (Task 3). `votingRecordPage`'s `summary` field type (`string | null`) is unchanged from Phase 1 (Task 4) — the island already handles it.

## Out of scope
- Storing the full LRB analysis (we link to it via `billUrl`, store only the first sentence).
- Re-fetching / refreshing already-enriched bills (a bill's analysis is fixed once introduced; `fetchedAt` is recorded if a manual refresh is ever wanted).
- Any frontend change — Phase 1 already ships the per-row summary expander.
