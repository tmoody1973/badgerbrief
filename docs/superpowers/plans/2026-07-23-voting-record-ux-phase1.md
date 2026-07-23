# Voting-record UX — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat "show all 2,043 votes" list with a summary + lazy per-session accordion (filter/search/load-more) and stop shipping the full vote list in the page payload.

**Architecture:** Two new Convex queries — `votingRecordSummary` (aggregates, computed from `legislator_votes` alone; session is the `voteKey` prefix, no join) and `votingRecordPage` (one session's rows, filtered/sorted/sliced server-side). `getCandidateBySlug` returns the small summary instead of the row array. A server shell renders SSR summary `StatTile`s; a `"use client"` island renders the accordion and fetches each session's rows on demand via `useQuery`. Full-bill links ship in Phase 1 (URL is deterministic from session + bill number); LRB summaries are Phase 2.

**Tech Stack:** Convex (queries + convex-test), Next.js App Router (server components + client island), React, Tailwind, Vitest.

## Global Constraints

- **Neutrality (load-bearing):** ordering is recency (stated in the copy); aggregates are arithmetic only (counts, participation %); no ranking of votes; no AI-generated text. Copy already reads "We don't rate or score votes." — keep it.
- **Design system:** neo-brutalist — `border-2 border-border`, `shadow-[var(--shadow-brutal)]`, mono uppercase labels (`font-mono text-[11px] uppercase tracking-[0.1em]`). Reuse `StatTile` (`src/components/guide/stat-tile.tsx`). Sections need `scroll-mt-16` to clear the sticky `SectionNav`.
- **Number formatting:** always `n.toLocaleString("en-US")` with the explicit `"en-US"` locale (SSR/client hydration must match — a locale-less `toLocaleString()` can differ between server and browser).
- **Tests:** `npx vitest run <file>` runs tests; `npx tsc --noEmit` type-checks separately (vitest does not type-check). `convex/_generated/api.d.ts` references modules by `typeof`, so adding a function to an existing module needs no regen; a NEW module or a NEW table does — run `npx convex codegen` after schema/module additions.
- **Do not touch** `api.votesQueries.votingRecord` — the Voter Help chat's `getVotingRecord` tool calls it directly. `getCandidateBySlug.votingRecord` (the array) is consumed only by the candidate page; removing it there is safe.

---

### Task 1: Shared voting-record helpers (`matchesQuery`, `summarize`, `billUrl`)

Extract the word-set search matcher (currently inline in `votingRecord`) into a pure, tested module, and add the summary + bill-URL helpers the new queries need. Refactor `votingRecord` to use the extracted matcher so behavior is unchanged.

**Files:**
- Create: `convex/lib/votingRecord.ts`
- Create: `convex/lib/votingRecord.test.ts`
- Modify: `convex/votesQueries.ts` (refactor the inline matcher in `votingRecord` to call `matchesQuery`)

**Interfaces:**
- Produces:
  - `matchesQuery(billTitle: string, billNumber: string, query: string): boolean`
  - `type VotingSummary = { total: number; byPosition: { aye: number; nay: number; not_voting: number }; participationRate: number; sessions: { session: string; count: number }[]; chamber: "assembly" | "senate" }`
  - `summarize(rows: { voteKey: string; position: "aye" | "nay" | "not_voting" }[]): VotingSummary`
  - `billUrl(session: string, billNumber: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/votingRecord.test.ts
import { describe, expect, test } from "vitest";
import { matchesQuery, summarize, billUrl } from "./votingRecord";

describe("matchesQuery", () => {
  test("matches every query word whole-word, any order, case-insensitively", () => {
    expect(matchesQuery("CHILD CARE CENTER RENOVATIONS LOAN PROGRAM", "AB 388", "child care loan")).toBe(true);
    expect(matchesQuery("CHILD CARE CENTER RENOVATIONS LOAN PROGRAM", "AB 388", "AB 388")).toBe(true);
    expect(matchesQuery("CHILD CARE CENTER RENOVATIONS LOAN PROGRAM", "AB 388", "transportation")).toBe(false);
    expect(matchesQuery("", "", "")).toBe(true); // empty query matches
  });
  test("boundary-anchored: 'aid' does not match 'paid'", () => {
    expect(matchesQuery("REQUIRING WAGES BE PAID PROMPTLY", "AB 1", "aid")).toBe(false);
  });
});

describe("summarize", () => {
  test("buckets by position and session (session = voteKey prefix), newest session first", () => {
    const s = summarize([
      { voteKey: "2015-assembly-av0001", position: "aye" },
      { voteKey: "2015-assembly-av0002", position: "nay" },
      { voteKey: "2013-assembly-av0001", position: "aye" },
      { voteKey: "2013-assembly-av0002", position: "not_voting" },
    ]);
    expect(s.total).toBe(4);
    expect(s.byPosition).toEqual({ aye: 2, nay: 1, not_voting: 1 });
    expect(s.chamber).toBe("assembly");
    expect(s.sessions).toEqual([
      { session: "2015", count: 2 },
      { session: "2013", count: 2 },
    ]);
    expect(s.participationRate).toBeCloseTo(0.75); // (2 aye + 1 nay) / 4
  });
});

describe("billUrl", () => {
  test("builds the canonical proposal URL, lowercased and space-stripped", () => {
    expect(billUrl("2013", "AB 181")).toBe("https://docs.legis.wisconsin.gov/2013/related/proposals/ab181");
    expect(billUrl("2023", "SJR 1")).toBe("https://docs.legis.wisconsin.gov/2023/related/proposals/sjr1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/lib/votingRecord.test.ts`
Expected: FAIL — cannot resolve `./votingRecord`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/votingRecord.ts
/**
 * Pure helpers for the voting-record UI. No Convex ctx, no network — the same
 * split as lib/rollCall.ts, so the queries in votesQueries.ts and the vitest
 * suite can both use them.
 */
export type Position = "aye" | "nay" | "not_voting";

/**
 * Whole-word, order-independent match of every query word against the title
 * and bill number. Lifted verbatim from votingRecord's inline matcher: an
 * agent-phrased "child care loan" is not a contiguous substring of "CHILD CARE
 * CENTER RENOVATIONS LOAN PROGRAM", so every word must appear (any order),
 * each boundary-anchored so "aid" cannot match inside "paid".
 */
export function matchesQuery(billTitle: string, billNumber: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${billTitle} ${billNumber}`.toLowerCase();
  return words.every((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
  });
}

export type VotingSummary = {
  total: number;
  byPosition: { aye: number; nay: number; not_voting: number };
  participationRate: number;
  sessions: { session: string; count: number }[];
  chamber: "assembly" | "senate";
};

/**
 * Per-candidate aggregate, computed from the lightweight legislator_votes rows
 * alone. voteKey is "{session}-{chamber}-{voteId}", so both session and chamber
 * come from the key with no join to legislative_votes. participationRate is
 * mechanical — (aye + nay) / total — never framed as good or bad.
 */
export function summarize(rows: { voteKey: string; position: Position }[]): VotingSummary {
  const byPosition = { aye: 0, nay: 0, not_voting: 0 };
  const sessionCounts = new Map<string, number>();
  let chamber: "assembly" | "senate" = "assembly";
  for (const r of rows) {
    byPosition[r.position]++;
    const [session, ch] = r.voteKey.split("-");
    if (ch === "assembly" || ch === "senate") chamber = ch;
    sessionCounts.set(session, (sessionCounts.get(session) ?? 0) + 1);
  }
  const total = rows.length;
  const sessions = [...sessionCounts.entries()]
    .map(([session, count]) => ({ session, count }))
    .sort((a, b) => b.session.localeCompare(a.session)); // newest first
  const participationRate = total === 0 ? 0 : (byPosition.aye + byPosition.nay) / total;
  return { total, byPosition, participationRate, sessions, chamber };
}

/**
 * Canonical Wisconsin Legislature bill page. "AB 388" -> ab388. Deterministic
 * from session + billNumber, so the "Full bill" link needs no fetch.
 */
export function billUrl(session: string, billNumber: string): string {
  const slug = billNumber.replace(/\s+/g, "").toLowerCase();
  return `https://docs.legis.wisconsin.gov/${session}/related/proposals/${slug}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run convex/lib/votingRecord.test.ts`
Expected: PASS (all 3 describe blocks).

- [ ] **Step 5: Refactor `votingRecord` to use the shared matcher (behavior unchanged)**

In `convex/votesQueries.ts`, add to the imports at the top:

```ts
import { matchesQuery } from "./lib/votingRecord";
```

Replace the inline `needleWords`/`matched` block inside `votingRecord`'s handler:

```ts
    const matched = search?.trim()
      ? rows.filter((r) => matchesQuery(r.vote.billTitle, r.vote.billNumber, search))
      : rows;
```

(Delete the old `needleWords` const and the `.filter(...)` that built `matched`; everything else in `votingRecord` stays.)

- [ ] **Step 6: Run the existing votesQueries suite to prove the refactor is behavior-preserving**

Run: `npx vitest run convex/votesQueries.test.ts`
Expected: PASS — all existing `votingRecord` search tests still green.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add convex/lib/votingRecord.ts convex/lib/votingRecord.test.ts convex/votesQueries.ts
git commit -m "refactor(votes): extract matchesQuery + add summarize/billUrl helpers"
```

---

### Task 2: `legislator_votes.session` — field, index, write, backfill

`legislator_votes` holds only `{voteKey, candidateSlug, position}`. Paging by session needs an indexable `session`. Add it optional (so the schema push doesn't reject existing rows), write it going forward in `storeRollCall`, and backfill existing rows by parsing the `voteKey` prefix.

**Files:**
- Modify: `convex/schema.ts` (legislator_votes: add `session`, add `by_candidate_session` index)
- Modify: `convex/votesQueries.ts` (`storeRollCall` writes `session`; add `backfillLegislatorSession`)
- Modify: `convex/votesQueries.test.ts` (add tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `internal.votesQueries.backfillLegislatorSession` (internalMutation, no args, returns `{ updated: number }`). `legislator_votes` rows gain `session?: string` and index `by_candidate_session` on `["candidateSlug", "session"]`.

- [ ] **Step 1: Write the failing tests**

Add to `convex/votesQueries.test.ts`:

```ts
describe("legislator_votes.session", () => {
  test("storeRollCall records the session on the legislator_votes row", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.run(async (ctx) => {
      const [p] = await ctx.db.query("legislator_votes").collect();
      expect(p.session).toBe("2023");
    });
  });

  test("backfillLegislatorSession fills rows missing a session from the voteKey prefix", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    // Simulate a pre-migration row: session omitted.
    await t.run(async (ctx) => {
      await ctx.db.insert("legislator_votes", {
        voteKey: "2013-assembly-av0100",
        candidateSlug: "francesca-hong",
        position: "aye",
      });
    });
    const res = await t.mutation(internal.votesQueries.backfillLegislatorSession, {});
    expect(res.updated).toBe(1);
    await t.run(async (ctx) => {
      const [p] = await ctx.db.query("legislator_votes").collect();
      expect(p.session).toBe("2013");
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/votesQueries.test.ts -t "legislator_votes.session"`
Expected: FAIL — `p.session` is undefined / `backfillLegislatorSession` not defined.

- [ ] **Step 3: Update the schema**

In `convex/schema.ts`, change the `legislator_votes` table to:

```ts
  legislator_votes: defineTable({
    voteKey: v.string(),
    candidateSlug: v.string(),
    position: v.union(v.literal("aye"), v.literal("nay"), v.literal("not_voting")),
    // session = voteKey prefix. Optional so the schema push accepts pre-migration
    // rows; backfillLegislatorSession + storeRollCall make it always-present in data.
    session: v.optional(v.string()),
  })
    .index("by_candidate", ["candidateSlug"])
    .index("by_vote", ["voteKey"])
    .index("by_candidate_session", ["candidateSlug", "session"]),
```

- [ ] **Step 4: Write `session` in `storeRollCall`**

In `convex/votesQueries.ts`, in the `legislator_votes` insert (currently `voteKey`/`candidateSlug`/`position`), add the session:

```ts
      await ctx.db.insert("legislator_votes", {
        voteKey: rollCall.voteKey,
        candidateSlug: c.slug,
        position: row.position,
        session: rollCall.session,
      });
```

- [ ] **Step 5: Add the backfill mutation**

Add to `convex/votesQueries.ts` (after `storeRollCall`):

```ts
/**
 * One-time (idempotent) fill of legislator_votes.session for rows written
 * before the field existed. session is the first "-"-delimited part of voteKey.
 */
export const backfillLegislatorSession = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ updated: number }> => {
    const rows = await ctx.db.query("legislator_votes").collect();
    let updated = 0;
    for (const r of rows) {
      if (r.session) continue;
      await ctx.db.patch(r._id, { session: r.voteKey.split("-")[0] });
      updated++;
    }
    return { updated };
  },
});
```

- [ ] **Step 6: Regenerate Convex types (new index + new function)**

Run: `npx convex codegen`
Expected: `convex/_generated/api.d.ts` updates; no errors.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run convex/votesQueries.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add convex/schema.ts convex/votesQueries.ts convex/votesQueries.test.ts convex/_generated
git commit -m "feat(votes): add legislator_votes.session + backfill for per-session paging"
```

---

### Task 3: `votingRecordSummary` query

Aggregate for the summary tiles and the SectionNav count. Reads `legislator_votes` by candidate and calls `summarize` — no join.

**Files:**
- Modify: `convex/votesQueries.ts` (add query + import)
- Modify: `convex/votesQueries.test.ts`

**Interfaces:**
- Consumes: `summarize`, `VotingSummary` from `./lib/votingRecord`.
- Produces: `api.votesQueries.votingRecordSummary({ candidateSlug: string }): VotingSummary | null` (null when the candidate has no votes).

- [ ] **Step 1: Write the failing test**

Add to `convex/votesQueries.test.ts`:

```ts
describe("votingRecordSummary", () => {
  test("returns null for a candidate with no votes", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    expect(await t.query(api.votesQueries.votingRecordSummary, { candidateSlug: "francesca-hong" })).toBeNull();
  });

  test("totals, per-position and per-session counts reconcile", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL }); // 2023, HONG nay
    const summary = await t.query(api.votesQueries.votingRecordSummary, { candidateSlug: "francesca-hong" });
    expect(summary).toMatchObject({
      total: 1,
      byPosition: { aye: 0, nay: 1, not_voting: 0 },
      chamber: "assembly",
      sessions: [{ session: "2023", count: 1 }],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/votesQueries.test.ts -t votingRecordSummary`
Expected: FAIL — `votingRecordSummary` not defined.

- [ ] **Step 3: Implement the query**

Add the import at the top of `convex/votesQueries.ts` (extend the existing `./lib/votingRecord` import):

```ts
import { matchesQuery, summarize, billUrl, type VotingSummary } from "./lib/votingRecord";
```

Add the query:

```ts
/**
 * Aggregate for the summary tiles and the SectionNav count. Computed from the
 * lightweight legislator_votes rows alone (session is the voteKey prefix), so
 * the candidate page never ships the full vote list. Explicit return type works
 * around the api-circularity TS quirk (same reason votingRecord annotates its).
 */
export const votingRecordSummary = query({
  args: { candidateSlug: v.string() },
  handler: async (ctx, { candidateSlug }): Promise<VotingSummary | null> => {
    const rows = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug))
      .collect();
    if (rows.length === 0) return null;
    return summarize(rows.map((r) => ({ voteKey: r.voteKey, position: r.position })));
  },
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run convex/votesQueries.test.ts -t votingRecordSummary`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/votesQueries.ts convex/votesQueries.test.ts
git commit -m "feat(votes): votingRecordSummary aggregate query"
```

---

### Task 4: `votingRecordPage` query

One session's rows, joined to `legislative_votes`, with `position` filter and `query` search applied server-side over the whole session, sorted (final votes first, then newest), sliced to `limit`. Includes the deterministic `billUrl`; `summary` is `null` in Phase 1.

**Files:**
- Modify: `convex/votesQueries.ts` (add query)
- Modify: `convex/votesQueries.test.ts`

**Interfaces:**
- Consumes: `matchesQuery`, `billUrl` (Task 1); `isFinal`, `positionValidator` (already module-scoped in votesQueries.ts); `by_candidate_session` index (Task 2).
- Produces:
  ```ts
  api.votesQueries.votingRecordPage({
    candidateSlug: string; session: string;
    limit?: number; position?: "aye"|"nay"|"not_voting"; query?: string;
  }): {
    rows: Array<{
      billNumber: string; billTitle: string; voteType: string; votedOn: string;
      chamber: "assembly"|"senate"; session: string;
      position: "aye"|"nay"|"not_voting"; ayes: number; nays: number;
      sourceUrl: string; otherVotesOnBill: number;
      billUrl: string; summary: string | null;
    }>;
    total: number;   // filtered count
    hasMore: boolean;
  }
  ```

- [ ] **Step 1: Write the failing tests**

Add to `convex/votesQueries.test.ts`:

```ts
describe("votingRecordPage", () => {
  // Two 2023 votes for HONG: a passage (nay) and a procedural TABLE (aye) on the same bill.
  async function seedTwo(t: ReturnType<typeof convexTest>) {
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL }); // PASSAGE, nay
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: { ...ROLL_CALL, voteKey: "2023-assembly-av0082", voteId: "av0082", voteType: "TABLE",
        votes: [{ name: "HONG", party: "D", position: "aye" as const }] },
    });
  }

  test("returns a session's rows, final votes first, with billUrl and null summary", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023" });
    expect(res.total).toBe(2);
    expect(res.hasMore).toBe(false);
    expect(res.rows[0].voteType).toBe("PASSAGE"); // final first
    expect(res.rows[0].billUrl).toBe("https://docs.legis.wisconsin.gov/2023/related/proposals/ab388");
    expect(res.rows[0].summary).toBeNull();
    expect(res.rows[0].otherVotesOnBill).toBe(1); // the TABLE vote on the same bill
  });

  test("limit slices and reports hasMore without changing total", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", limit: 1 });
    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(2);
    expect(res.hasMore).toBe(true);
  });

  test("position filter narrows the rows but leaves otherVotesOnBill intact", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", position: "aye" });
    expect(res.total).toBe(1);
    expect(res.rows[0].voteType).toBe("TABLE");
    expect(res.rows[0].otherVotesOnBill).toBe(1); // still counts the passage vote
  });

  test("query search matches title/number whole-word", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    expect((await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", query: "child care" })).total).toBe(2);
    expect((await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", query: "transportation" })).total).toBe(0);
  });

  test("only returns the requested session", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    expect((await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2025" })).total).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/votesQueries.test.ts -t votingRecordPage`
Expected: FAIL — `votingRecordPage` not defined.

- [ ] **Step 3: Implement the query**

Add to `convex/votesQueries.ts` (near the other queries). `PAGE_DEFAULT` sits with the other module constants:

```ts
const PAGE_DEFAULT = 25;

/**
 * One session's rows for the accordion. The whole session is read (indexed and
 * bounded — ≤705 rows), joined to legislative_votes for metadata, then position
 * + search filtered and sliced to `limit`. otherVotesOnBill is computed over the
 * UNFILTERED session so a filter never changes it. billUrl is deterministic;
 * summary is null until Phase 2 joins the bills table.
 */
export const votingRecordPage = query({
  args: {
    candidateSlug: v.string(),
    session: v.string(),
    limit: v.optional(v.number()),
    position: v.optional(positionValidator),
    query: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { candidateSlug, session, limit, position, query: search },
  ): Promise<{
    rows: Array<{
      billNumber: string; billTitle: string; voteType: string; votedOn: string;
      chamber: "assembly" | "senate"; session: string;
      position: "aye" | "nay" | "not_voting"; ayes: number; nays: number;
      sourceUrl: string; otherVotesOnBill: number; billUrl: string; summary: string | null;
    }>;
    total: number;
    hasMore: boolean;
  }> => {
    const cap = limit ?? PAGE_DEFAULT;
    const positions = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate_session", (q) =>
        q.eq("candidateSlug", candidateSlug).eq("session", session),
      )
      .collect();

    const all = [];
    for (const p of positions) {
      const vote = await ctx.db
        .query("legislative_votes")
        .withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey))
        .unique();
      if (vote) all.push({ vote, position: p.position });
    }

    const perBill = new Map<string, number>();
    for (const r of all) perBill.set(r.vote.billNumber, (perBill.get(r.vote.billNumber) ?? 0) + 1);

    const filtered = all.filter(
      (r) =>
        (!position || r.position === position) &&
        (!search?.trim() || matchesQuery(r.vote.billTitle, r.vote.billNumber, search)),
    );
    filtered.sort((a, b) => {
      const fa = isFinal(a.vote.voteType) ? 1 : 0;
      const fb = isFinal(b.vote.voteType) ? 1 : 0;
      return fb - fa || b.vote.votedOn.localeCompare(a.vote.votedOn);
    });

    const total = filtered.length;
    const rows = filtered.slice(0, cap).map((r) => ({
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
      summary: null as string | null,
    }));

    return { rows, total, hasMore: cap < total };
  },
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run convex/votesQueries.test.ts -t votingRecordPage`
Expected: PASS (all 5).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/votesQueries.ts convex/votesQueries.test.ts
git commit -m "feat(votes): votingRecordPage — paged per-session rows w/ filter+search"
```

---

### Task 5: The client island `VotingRecordSessions`

The interactive accordion. All sessions mounted; only the open one fetches (via `useQuery("skip")` when closed, so we never load all sessions at once). Newest session open by default. Filter chips + bill search + "load more" (grow `limit`; `useQuery` re-runs and returns rows `0..limit`, so no manual accumulation). Per-row summary expander is wired but only renders when `summary` is non-null (always null in Phase 1 → hidden; Phase 2 lights it up with zero further UI work).

**Files:**
- Create: `src/components/guide/voting-record-sessions.tsx`

**Interfaces:**
- Consumes: `api.votesQueries.votingRecordPage` (Task 4).
- Produces: `<VotingRecordSessions candidateSlug={string} sessions={{ session: string; count: number }[]} />`

- [ ] **Step 1: Write the component**

```tsx
// src/components/guide/voting-record-sessions.tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type SessionCount = { session: string; count: number };
type PageRow = {
  billNumber: string; billTitle: string; voteType: string; votedOn: string;
  chamber: string; session: string;
  position: "aye" | "nay" | "not_voting";
  ayes: number; nays: number; sourceUrl: string; otherVotesOnBill: number;
  billUrl: string; summary: string | null;
};

const POSITION_LABEL: Record<PageRow["position"], string> = {
  aye: "Voted yes", nay: "Voted no", not_voting: "Did not vote",
};
const FILTERS: { key: PageRow["position"] | null; label: string }[] = [
  { key: null, label: "All" }, { key: "aye", label: "Yes" },
  { key: "nay", label: "No" }, { key: "not_voting", label: "Didn't vote" },
];
const STEP = 25;
const nf = new Intl.NumberFormat("en-US");

const chip = (active: boolean) =>
  `shrink-0 whitespace-nowrap border-2 border-border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${
    active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
  }`;

const linkCls =
  "font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-2 underline-offset-2";

export function VotingRecordSessions({
  candidateSlug, sessions,
}: { candidateSlug: string; sessions: SessionCount[] }) {
  const [openSession, setOpenSession] = useState<string | null>(sessions[0]?.session ?? null);
  return (
    <ol className="mt-3 divide-y-2 divide-border border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      {sessions.map((s) => (
        <SessionGroup
          key={s.session}
          candidateSlug={candidateSlug}
          session={s.session}
          count={s.count}
          open={openSession === s.session}
          onToggle={() => setOpenSession((cur) => (cur === s.session ? null : s.session))}
        />
      ))}
    </ol>
  );
}

function SessionGroup({
  candidateSlug, session, count, open, onToggle,
}: {
  candidateSlug: string; session: string; count: number; open: boolean; onToggle: () => void;
}) {
  const [position, setPosition] = useState<PageRow["position"] | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(STEP);

  const data = useQuery(
    api.votesQueries.votingRecordPage,
    open
      ? { candidateSlug, session, limit, position: position ?? undefined, query: search || undefined }
      : "skip",
  );

  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/40"
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
          {open ? "▾" : "▸"} {session} session
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{nf.format(count)} votes</span>
      </button>

      {open && (
        <div className="border-t-2 border-dashed border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => { setPosition(f.key); setLimit(STEP); }}
                className={chip(position === f.key)}
              >
                {f.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLimit(STEP); }}
              placeholder="Find a bill"
              aria-label={`Find a bill in the ${session} session`}
              className="ml-1 min-w-[8rem] flex-1 border-2 border-border bg-card px-2 py-1.5 text-sm"
            />
          </div>

          {data === undefined ? (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Loading…</p>
          ) : data.rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No votes match.</p>
          ) : (
            <>
              <ol className="mt-3 divide-y-2 divide-dashed divide-border">
                {data.rows.map((v) => <Row key={v.sourceUrl} v={v} />)}
              </ol>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Showing {nf.format(data.rows.length)} of {nf.format(data.total)}
                </span>
                {data.hasMore && (
                  <button
                    onClick={() => setLimit((l) => l + STEP)}
                    className="border-2 border-border px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-secondary/40"
                  >
                    Load {Math.min(STEP, data.total - data.rows.length)} more
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Row({ v }: { v: PageRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {v.billNumber} · {v.voteType} · {v.votedOn}
      </p>
      <p className="mt-1 max-w-[62ch] text-sm">{v.billTitle}</p>
      <p className="mt-1 text-sm">
        <span className="font-bold">{POSITION_LABEL[v.position]}</span>
        <span className="text-muted-foreground">
          {" "}· {v.ayes} ayes, {v.nays} nays
          {v.otherVotesOnBill > 0
            ? ` · ${v.otherVotesOnBill} other recorded vote${v.otherVotesOnBill === 1 ? "" : "s"} on this bill`
            : ""}
        </span>
      </p>
      {v.summary && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground underline decoration-dotted underline-offset-2"
          >
            {expanded ? "Hide summary" : "What this bill does"}
          </button>
          {expanded && (
            <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
              &ldquo;{v.summary}&rdquo;{" "}
              <span className="font-mono text-[10px] uppercase tracking-[0.1em]">— LRB analysis</span>
            </p>
          )}
        </div>
      )}
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <a href={v.billUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>Full bill ↗</a>
        <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>Official roll call ↗</a>
      </p>
    </li>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The component is unused until Task 6 wires it, but must compile.)

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/voting-record-sessions.tsx
git commit -m "feat(votes): VotingRecordSessions accordion island (filter/search/load-more)"
```

---

### Task 6: Swap the candidate page to the summary + island (atomic UI switch)

Rewrite the `VotingRecord` server shell to render summary `StatTile`s and the island; change `getCandidateBySlug` to return `votingRecordSummary`; wire `page.tsx`. One commit so the app compiles and renders correctly after it.

**Files:**
- Modify: `convex/public.ts` (replace the `votingRecord` array with `votingRecordSummary`)
- Modify: `src/components/guide/voting-record.tsx` (server shell rewrite)
- Modify: `src/app/candidates/[slug]/page.tsx` (destructure + SectionNav count + props)

**Interfaces:**
- Consumes: `api.votesQueries.votingRecordSummary` (Task 3), `VotingRecordSessions` (Task 5), `StatTile`.
- Produces: `getCandidateBySlug(...).votingRecordSummary: VotingSummary | null` (replaces `.votingRecord`). `<VotingRecord summary={VotingSummary} candidateSlug={string} candidateName={string} />`.

- [ ] **Step 1: Change `getCandidateBySlug`**

In `convex/public.ts`, replace the `votingRecord` block (the `const votingRecord: Array<{...}> = await ctx.runQuery(api.votesQueries.votingRecord, ...)`) with:

```ts
    // Aggregate only — the full per-session rows load client-side via
    // votingRecordPage, so a candidate with 2,000+ votes no longer ships them
    // all in the page payload. Explicit annotation for the api-circularity quirk.
    const votingRecordSummary: {
      total: number;
      byPosition: { aye: number; nay: number; not_voting: number };
      participationRate: number;
      sessions: { session: string; count: number }[];
      chamber: "assembly" | "senate";
    } | null = await ctx.runQuery(api.votesQueries.votingRecordSummary, {
      candidateSlug: slug,
    });
```

And in the returned object, replace `votingRecord,` with `votingRecordSummary,`.

- [ ] **Step 2: Rewrite the server shell**

Replace the entire contents of `src/components/guide/voting-record.tsx` with:

```tsx
import { StatTile } from "./stat-tile";
import { VotingRecordSessions } from "./voting-record-sessions";

type VotingSummary = {
  total: number;
  byPosition: { aye: number; nay: number; not_voting: number };
  participationRate: number;
  sessions: { session: string; count: number }[];
  chamber: "assembly" | "senate";
};

const nf = new Intl.NumberFormat("en-US");

/**
 * A legislator's floor votes: an aggregate summary + a lazy per-session
 * accordion (VotingRecordSessions). The candidate page ships only this summary;
 * the rows load on demand, so a 2,000-vote record is navigable and cheap.
 *
 * SELECTION IS RECENCY, AND THE PAGE SAYS SO. We don't rate or score votes; the
 * aggregates here are arithmetic only.
 */
export function VotingRecord({
  summary, candidateSlug, candidateName,
}: {
  summary: VotingSummary;
  candidateSlug: string;
  candidateName: string;
}) {
  const sessionLabels = summary.sessions.map((s) => s.session).sort();
  return (
    <section id="votes" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Voting record</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Recorded floor votes {candidateName} cast in the Wisconsin Legislature, newest
        first, across the {sessionLabels.join(", ")} session
        {sessionLabels.length > 1 ? "s" : ""}. Every entry links to its official roll call
        and the full bill. We don&rsquo;t rate or score votes.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Recorded votes" value={nf.format(summary.total)} />
        <StatTile label="Voted yes" value={nf.format(summary.byPosition.aye)} />
        <StatTile label="Voted no" value={nf.format(summary.byPosition.nay)} />
        <StatTile
          label="Participation"
          value={`${Math.round(summary.participationRate * 100)}%`}
          note={`${nf.format(summary.byPosition.not_voting)} did not vote`}
        />
      </div>

      <VotingRecordSessions candidateSlug={candidateSlug} sessions={summary.sessions} />
    </section>
  );
}
```

- [ ] **Step 3: Wire `page.tsx`**

In `src/app/candidates/[slug]/page.tsx`:

- Change the destructure (line ~83): replace `votingRecord` with `votingRecordSummary`.
- Change the SectionNav entry (line ~114-115):

```tsx
    ...(votingRecordSummary
      ? [{ id: "votes", label: "Voting record", count: votingRecordSummary.total }]
      : []),
```

- Change the render (line ~226):

```tsx
        {votingRecordSummary && (
          <VotingRecord
            summary={votingRecordSummary}
            candidateSlug={candidate.slug}
            candidateName={candidate.name}
          />
        )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Full test suite (nothing regressed)**

Run: `npx vitest run`
Expected: PASS (existing + all new voting-record tests).

- [ ] **Step 6: Verify live**

```bash
npx convex dev --once   # push schema + functions to the dev deployment
```

The dev deployment may hold no ingested votes, so the authoritative live check runs against **prod after Task 7** (deploy + backfill). Either against a dev deployment that has data, or against prod after Task 7, open a high-volume candidate (e.g. `/candidates/jocasta-zamarripa`) and confirm:
- Summary tiles show total / yes / no / participation.
- Newest session is open with its first 25 rows; older sessions collapsed with counts.
- Filter chips (All/Yes/No/Didn't vote) and "Find a bill" narrow the open session.
- "Load 25 more" grows the list; "Showing X of N" updates.
- Each row has "Full bill ↗" (resolves to the bill page) and "Official roll call ↗". No "What this bill does" yet (Phase 2).
- Confirm the payload shrank: the page's RSC/HTML no longer contains 2,000 bill titles (`view-source` / network payload is small; rows arrive via a separate `votingRecordPage` request).

- [ ] **Step 7: Commit**

```bash
git add convex/public.ts src/components/guide/voting-record.tsx "src/app/candidates/[slug]/page.tsx"
git commit -m "feat(votes): candidate page renders summary + lazy session accordion"
```

---

### Task 7: Deploy Phase 1 + backfill prod

**Files:** none (operational).

- [ ] **Step 1: Deploy Convex (schema + queries)**

Run: `npx convex deploy -y`
Expected: schema push accepts (session is optional); functions deployed.

- [ ] **Step 2: Backfill `session` on existing prod `legislator_votes`**

Run: `npx convex run --prod votesQueries:backfillLegislatorSession '{}'`
Expected: `{ "updated": N }` where N = current legislator_votes row count (all pre-existing rows). Re-running returns `{ "updated": 0 }` (idempotent).

- [ ] **Step 3: Verify a paged query on prod**

```bash
npx convex run --prod votesQueries:votingRecordPage '{"candidateSlug":"jocasta-zamarripa","session":"2013","limit":3}'
```
Expected: 3 rows, each with `billUrl`, `summary: null`, correct `session: "2013"`; `total: 420`, `hasMore: true`.

- [ ] **Step 4: Deploy the frontend**

Run: `npx vercel --prod --yes`
Expected: deploy succeeds; `/candidates/jocasta-zamarripa` renders the new accordion.

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Scannability → session accordion + filter chips + in-session search (Tasks 4, 5). ✓
- Neutral signal → `votingRecordSummary` tiles: total / yes / no / participation (Tasks 3, 6). ✓
- Payload/perf → summary replaces the row array in `getCandidateBySlug`; rows lazy-load per session (Tasks 3–6). ✓
- Default view = newest session open, first 25 (Task 5, `openSession` initial + `STEP`). ✓
- Compact rows, "Full bill" link now, summary slot for Phase 2 (Task 5 `Row`). ✓
- Neutrality preserved: recency copy kept, arithmetic-only tiles, no ranking (Tasks 3, 6). ✓
- Phase 2 (LRB summaries, `bills` table/enrich/cron) → **out of scope here; its own plan.** The `summary` field already flows through as `null` so Phase 2 is additive.

**Placeholder scan:** none — every step has runnable code/commands.

**Type consistency:** `VotingSummary` shape is identical in `lib/votingRecord.ts` (Task 1), the `votingRecordSummary` annotation (Task 3), the `public.ts` annotation (Task 6), and the shell's local type (Task 6). `votingRecordPage`'s row shape (Task 4) matches `PageRow` in the island (Task 5), including `billUrl` and `summary: string | null`. Load-more uses `limit`/`hasMore` consistently across Task 4 and Task 5.

## Out of scope (Phase 2 — separate plan)
`bills` table, `billAnalysis.ts` (LRB first-sentence parser + fixtures), `billsQueries.ts` (`storeBill`, `unenrichedBills`), `bills.ts` enrich action, the weekly enrich cron, and joining `bills` into `votingRecordPage` to fill `summary`. The island's per-row "What this bill does" expander is already built and hidden while `summary` is null, so Phase 2 is purely data + a one-line join.
