# Voting Record by Issue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an incumbent's raw roll-call votes into an issue-grouped, direction-translated ("Voted for/against [plain outcome]"), source-linked view — v1 for Hong + Roys before the Aug 11 primary.

**Architecture:** Add a reviewed bill→issue classification (issueSlug + neutral "what a YES vote does" outcome) onto the existing `bills` LRB cache. A new public query groups a candidate's substantive, approved-classified votes by issue with for/against counts and pairs each issue with their published position. A UI section extends `voting-record.tsx`. Classifier mirrors `newsToneClassify` (LLM + human-review gate).

**Tech Stack:** Convex, `ai` + `@ai-sdk/anthropic` (`generateObject`), vitest + `convex-test`, Next.js/React, Tailwind (site tokens).

## Global Constraints

- **Describe the bill, never label the member.** No scores, ratings, ideology %, or "pro-/anti-" language. The `outcome` describes what a YES vote does (from the nonpartisan LRB), factually.
- **Counts are complete:** every substantive vote on an issue is included (not a curated subset), so `for N, against M` can't be selective.
- **No motive inference:** a "nay" renders as "Voted against [outcome]", never "opposes [issue]".
- **Human-review gate:** only bills with `classifyStatus === "approved"` appear publicly. `confidence < 0.6` or `summary === null` → `needs_review`, never auto-published.
- **Substantive votes only** in the issue view (reuse `isFinal(voteType)`); procedural votes stay in the existing accordion.
- **Issue taxonomy is the fixed 11:** `healthcare, education, public-safety, taxes-budget, abortion, housing, immigration, environment-energy, economy-jobs, elections-democracy, agriculture`.
- Classifier model: `anthropic("claude-sonnet-5")` (matches `newsToneClassify`/`tvExtractAgent`).
- `"use node"` files may export ONLY actions; queries/mutations/pure helpers live in the non-node file (Convex runtime rule).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Confirm data availability (gate)

**Files:** none (investigation; record the result in the plan's ledger / a comment).

**Interfaces:** Produces the go/no-go for Roys in v1.

- [ ] **Step 1: Check Roys's Senate record + LRB coverage**

Run:
```bash
npx convex run votesQueries:votingRecordSummary '{"candidateSlug":"kelda-roys"}' --prod
npx convex run votesQueries:votingRecordSummary '{"candidateSlug":"francesca-hong"}' --prod
```
Expected: Hong `total` ≈ 500. Record Roys's `total` and `sessions`.

- [ ] **Step 2: Decide scope**

If Roys `total` is healthy (say ≥ 40 substantive votes), keep both in v1. If thin/absent, ship **Hong only** in v1 and note Roys pending a Senate backfill. Record the decision. (No code — this gates Task 6's candidate list.)

---

### Task 2: bill classification storage (schema + mutation)

**Files:**
- Modify: `convex/schema.ts` (`bills` table)
- Create: `convex/billClassify.ts` (`setBillClassification` internalMutation + `pendingBillsForCandidates` internalQuery)
- Test: `convex/billClassify.test.ts`

**Interfaces:**
- Produces: `internal.billClassify.setBillClassification({ session, billNumber, issueSlugs, outcome, confidence, status })`; `internal.billClassify.pendingBillsForCandidates({ candidateSlugs }): Array<{ session, billNumber, billTitle, summary }>`.

- [ ] **Step 1: Add schema fields** (`convex/schema.ts`, inside the `bills` table, after `summary`)

```ts
    // Bill → issue classification (voting-record-by-issue). Neutral, LRB-anchored.
    issueSlugs: v.optional(v.array(v.string())),
    outcome: v.optional(v.string()), // "a YES vote would […]", ≤ ~12 words
    classifyConfidence: v.optional(v.number()),
    classifyStatus: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("needs_review")),
    ),
    classifiedAt: v.optional(v.number()),
```

- [ ] **Step 2: Write the failing test**

```ts
// convex/billClassify.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

describe("bill classification storage", () => {
  test("setBillClassification patches the bills row by session+billNumber", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 100", billUrl: "u", summary: "This bill would expand BadgerCare.", fetchedAt: 0 });
    });
    await t.mutation(internal.billClassify.setBillClassification, {
      session: "2025", billNumber: "AB 100", issueSlugs: ["healthcare"], outcome: "expand BadgerCare eligibility", confidence: 0.9, status: "approved",
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("bills").withIndex("by_session_bill", (q) => q.eq("session", "2025").eq("billNumber", "AB 100")).unique());
    expect(row?.issueSlugs).toEqual(["healthcare"]);
    expect(row?.outcome).toBe("expand BadgerCare eligibility");
    expect(row?.classifyStatus).toBe("approved");
  });

  test("pendingBillsForCandidates returns unclassified bills those candidates voted on (substantive only)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // a substantive vote Hong cast on AB 100 (has LRB summary, unclassified)
      await ctx.db.insert("legislative_votes", { voteKey: "2025-assembly-av1", session: "2025", chamber: "assembly", voteId: "av1", billNumber: "AB 100", billTitle: "t", voteType: "PASSAGE", votedOn: "2025-01-01", ayes: 50, nays: 40, notVoting: 0, sourceUrl: "s", ingestedAt: 0 } as any);
      await ctx.db.insert("legislator_votes", { voteKey: "2025-assembly-av1", candidateSlug: "francesca-hong", position: "aye", session: "2025" } as any);
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 100", billUrl: "u", summary: "This bill would expand BadgerCare.", fetchedAt: 0 });
      // a procedural vote → excluded
      await ctx.db.insert("legislative_votes", { voteKey: "2025-assembly-av2", session: "2025", chamber: "assembly", voteId: "av2", billNumber: "AB 200", billTitle: "t", voteType: "MOTION", votedOn: "2025-01-02", ayes: 1, nays: 1, notVoting: 0, sourceUrl: "s", ingestedAt: 0 } as any);
      await ctx.db.insert("legislator_votes", { voteKey: "2025-assembly-av2", candidateSlug: "francesca-hong", position: "nay", session: "2025" } as any);
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 200", billUrl: "u", summary: "x", fetchedAt: 0 });
    });
    const pending = await t.query(internal.billClassify.pendingBillsForCandidates, { candidateSlugs: ["francesca-hong"] });
    expect(pending.map((p) => p.billNumber)).toEqual(["AB 100"]); // AB 200 excluded (procedural)
    expect(pending[0].summary).toBe("This bill would expand BadgerCare.");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/billClassify.test.ts` — FAIL (module missing).

- [ ] **Step 4: Implement** (`convex/billClassify.ts`)

```ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Final-passage vote types (mirror of votesQueries.isFinal — kept in sync).
const FINAL_TYPES = ["PASSAGE", "CONCURRENCE", "ADOPTION"];
const isFinal = (voteType: string) => {
  const t = voteType.toUpperCase();
  return FINAL_TYPES.some((f) => t.includes(f)) || t.includes("ON PASSAGE");
};

export const setBillClassification = internalMutation({
  args: {
    session: v.string(),
    billNumber: v.string(),
    issueSlugs: v.array(v.string()),
    outcome: v.string(),
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("needs_review")),
  },
  handler: async (ctx, { session, billNumber, issueSlugs, outcome, confidence, status }) => {
    const row = await ctx.db
      .query("bills")
      .withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber))
      .unique();
    if (!row) return { patched: false };
    await ctx.db.patch(row._id, {
      issueSlugs, outcome, classifyConfidence: confidence, classifyStatus: status, classifiedAt: Date.now(),
    });
    return { patched: true };
  },
});

export const pendingBillsForCandidates = internalQuery({
  args: { candidateSlugs: v.array(v.string()) },
  handler: async (ctx, { candidateSlugs }) => {
    // distinct (session, billNumber) from these candidates' SUBSTANTIVE votes
    const wanted = new Map<string, { session: string; billNumber: string }>();
    for (const slug of candidateSlugs) {
      const lv = await ctx.db.query("legislator_votes").withIndex("by_candidate", (q) => q.eq("candidateSlug", slug)).collect();
      for (const p of lv) {
        const vote = await ctx.db.query("legislative_votes").withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey)).unique();
        if (!vote || !isFinal(vote.voteType)) continue;
        wanted.set(`${vote.session}-${vote.billNumber}`, { session: vote.session, billNumber: vote.billNumber });
      }
    }
    const out: Array<{ session: string; billNumber: string; billTitle: string; summary: string }> = [];
    for (const { session, billNumber } of wanted.values()) {
      const bill = await ctx.db.query("bills").withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber)).unique();
      if (!bill || bill.classifyStatus || bill.summary === null) continue; // already classified or no LRB text to anchor
      const anyVote = await ctx.db.query("legislative_votes").withIndex("by_bill", (q) => q.eq("billNumber", billNumber)).first();
      out.push({ session, billNumber, billTitle: anyVote?.billTitle ?? billNumber, summary: bill.summary });
    }
    return out;
  },
});
```

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run convex/billClassify.test.ts` — PASS.
```bash
git add convex/schema.ts convex/billClassify.ts convex/billClassify.test.ts convex/_generated/api.d.ts
git commit -m "feat(votes): bill→issue classification storage + pending-bills query

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
> Run `npx convex codegen` before the test if `internal.billClassify` isn't in `_generated` yet.

---

### Task 3: the classifier (prompt + action)

**Files:**
- Modify: `convex/billClassify.ts` (add pure `buildBillClassifyPrompt`)
- Create: `convex/billClassifyRun.ts` (`"use node"`, `classifyPendingBills` action)
- Test: `convex/billClassify.test.ts` (append prompt-builder test)

**Interfaces:**
- Consumes: `internal.billClassify.pendingBillsForCandidates`, `internal.billClassify.setBillClassification`.
- Produces: `buildBillClassifyPrompt(title: string, lrbSummary: string): string`; `internal.billClassifyRun.classifyPendingBills({ candidateSlugs, limit? })`.

- [ ] **Step 1: Write the failing prompt-builder test** (append)

```ts
import { buildBillClassifyPrompt } from "./billClassify";

describe("bill classify prompt", () => {
  test("constrains to the 11 issues, demands a neutral YES-vote outcome, embeds the LRB summary", () => {
    const p = buildBillClassifyPrompt("AB 100 relating to health coverage", "This bill would expand BadgerCare eligibility.");
    expect(p).toContain("This bill would expand BadgerCare eligibility.");
    expect(p.toLowerCase()).toContain("yes vote"); // outcome is framed as what a YES does
    expect(p).toContain("healthcare");
    expect(p).toContain("public-safety"); // the fixed slug list is present
    expect(p.toLowerCase()).toContain("do not"); // neutrality guard present
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run convex/billClassify.test.ts` — FAIL (`buildBillClassifyPrompt` missing).

- [ ] **Step 3: Implement the pure builder** (append to `convex/billClassify.ts`)

```ts
export const ISSUE_SLUGS = [
  "healthcare", "education", "public-safety", "taxes-budget", "abortion", "housing",
  "immigration", "environment-energy", "economy-jobs", "elections-democracy", "agriculture",
] as const;

export function buildBillClassifyPrompt(title: string, lrbSummary: string): string {
  return [
    `Classify a Wisconsin bill into the voter issues it touches, and describe what a YES vote does.`,
    `Pick 1-2 issues from EXACTLY this list: ${ISSUE_SLUGS.join(", ")}.`,
    `Write "outcome": a neutral, factual phrase (≤ 12 words) completing "a YES vote would ___", taken from what the bill does.`,
    `Rules:`,
    `- Describe the BILL only. Do NOT judge it, and do NOT describe any legislator.`,
    `- Neutral wording — no "reform", "crack down", "protect", "attack" or other loaded verbs.`,
    `- If it fits no issue on the list, return an empty issueSlugs array.`,
    ``,
    `Bill: ${title}`,
    `Nonpartisan LRB summary: ${lrbSummary}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run convex/billClassify.test.ts` — PASS.

- [ ] **Step 5: Implement the action** (`convex/billClassifyRun.ts`)

```ts
"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { buildBillClassifyPrompt, ISSUE_SLUGS } from "./billClassify";

const MODEL = "claude-sonnet-5";
const schema = z.object({
  issueSlugs: z.array(z.enum(ISSUE_SLUGS)).max(2),
  outcome: z.string(),
  confidence: z.number().min(0).max(1),
});

export const classifyPendingBills = internalAction({
  args: { candidateSlugs: v.array(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { candidateSlugs, limit = 40 }) => {
    const pending = (await ctx.runQuery(internal.billClassify.pendingBillsForCandidates, { candidateSlugs })).slice(0, limit);
    let done = 0;
    for (const b of pending) {
      try {
        const { object } = await generateObject({ model: anthropic(MODEL), schema, prompt: buildBillClassifyPrompt(b.billTitle, b.summary) });
        // Neutral default: low confidence OR no issue → needs_review, never public.
        const status = object.confidence < 0.6 || object.issueSlugs.length === 0 ? "needs_review" : "pending";
        await ctx.runMutation(internal.billClassify.setBillClassification, {
          session: b.session, billNumber: b.billNumber, issueSlugs: object.issueSlugs, outcome: object.outcome, confidence: object.confidence, status,
        });
        done++;
      } catch (e) {
        console.error("bill classify failed", b.session, b.billNumber, (e as Error).message);
      }
    }
    return { classified: done };
  },
});
```

- [ ] **Step 6: codegen + commit.** `npx convex codegen && npx vitest run convex/billClassify.test.ts && npx tsc --noEmit`
```bash
git add convex/billClassify.ts convex/billClassifyRun.ts convex/billClassify.test.ts convex/_generated/api.d.ts
git commit -m "feat(votes): LLM bill→issue classifier (neutral, LRB-anchored, review-gated)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `votingRecordByIssue` read query

**Files:**
- Modify: `convex/votesQueries.ts` (add `votingRecordByIssue`)
- Test: `convex/votesQueries.test.ts` (append)

**Interfaces:**
- Consumes: `legislator_votes`, `legislative_votes`, `bills` (approved classifications), `candidate_positions_published`, `isFinal`.
- Produces: `api.votesQueries.votingRecordByIssue({ candidateSlug, raceId }): Array<{ issueSlug, label, forCount, againstCount, votes: Array<{ direction, outcome, votedOn, billNumber, session, sourceUrl }>, position?: { stance, summary, sources } }>`.

- [ ] **Step 1: Write the failing test** (append; seed 1 approved healthcare bill Hong voted aye, 1 approved bill she voted nay, plus a published healthcare position)

```ts
test("votingRecordByIssue groups approved substantive votes by issue with for/against + position", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const mkVote = async (av: string, bill: string, pos: "aye" | "nay") => {
      await ctx.db.insert("legislative_votes", { voteKey: `2025-assembly-${av}`, session: "2025", chamber: "assembly", voteId: av, billNumber: bill, billTitle: "t", voteType: "PASSAGE", votedOn: "2025-03-01", ayes: 1, nays: 1, notVoting: 0, sourceUrl: `https://s/${av}`, ingestedAt: 0 } as any);
      await ctx.db.insert("legislator_votes", { voteKey: `2025-assembly-${av}`, candidateSlug: "francesca-hong", position: pos, session: "2025" } as any);
    };
    await mkVote("av1", "AB 100", "aye");
    await mkVote("av2", "AB 200", "nay");
    await ctx.db.insert("bills", { session: "2025", billNumber: "AB 100", billUrl: "u", summary: "s", issueSlugs: ["healthcare"], outcome: "expand BadgerCare eligibility", classifyStatus: "approved", classifiedAt: 0, fetchedAt: 0 } as any);
    await ctx.db.insert("bills", { session: "2025", billNumber: "AB 200", billUrl: "u", summary: "s", issueSlugs: ["healthcare"], outcome: "add a Medicaid work requirement", classifyStatus: "approved", classifiedAt: 0, fetchedAt: 0 } as any);
    await ctx.db.insert("candidate_positions_published", { candidateSlug: "francesca-hong", raceId: "WI-GOV-2026", issueSlug: "healthcare", stance: "support", summary: "Supports expanding coverage.", confidence: 1, sources: [], draftId: "x" as any, publishedAt: 0, lastReviewedAt: 0 } as any);
  });
  const groups = await t.query(api.votesQueries.votingRecordByIssue, { candidateSlug: "francesca-hong", raceId: "WI-GOV-2026" });
  const hc = groups.find((g) => g.issueSlug === "healthcare")!;
  expect(hc.forCount).toBe(1);
  expect(hc.againstCount).toBe(1);
  expect(hc.votes).toHaveLength(2);
  expect(hc.votes.find((v) => v.billNumber === "AB 100")!.direction).toBe("for");
  expect(hc.position?.summary).toBe("Supports expanding coverage.");
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run convex/votesQueries.test.ts` — FAIL.

- [ ] **Step 3: Implement** (append to `convex/votesQueries.ts`; `isFinal` + `labelForSlug` already available — import `labelForSlug` from `../src/lib/candidate-order`? NO — Convex cannot import from `src`. Re-declare the label map here or read from a shared convex module. Use a local `ISSUE_LABEL` map to avoid a cross-root import.)

```ts
const ISSUE_LABEL: Record<string, string> = {
  healthcare: "Healthcare", education: "Education", "public-safety": "Public safety",
  "taxes-budget": "Taxes & budget", abortion: "Abortion", housing: "Housing", immigration: "Immigration",
  "environment-energy": "Environment & energy", "economy-jobs": "Economy & jobs",
  "elections-democracy": "Elections & democracy", agriculture: "Agriculture",
};

export const votingRecordByIssue = query({
  args: { candidateSlug: v.string(), raceId: v.string() },
  handler: async (ctx, { candidateSlug, raceId }) => {
    const lv = await ctx.db.query("legislator_votes").withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug)).collect();
    type Entry = { direction: "for" | "against"; outcome: string; votedOn: string; billNumber: string; session: string; sourceUrl: string };
    const byIssue = new Map<string, Entry[]>();
    for (const p of lv) {
      if (p.position !== "aye" && p.position !== "nay") continue;
      const vote = await ctx.db.query("legislative_votes").withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey)).unique();
      if (!vote || !isFinal(vote.voteType)) continue;
      const bill = await ctx.db.query("bills").withIndex("by_session_bill", (q) => q.eq("session", vote.session).eq("billNumber", vote.billNumber)).unique();
      if (!bill || bill.classifyStatus !== "approved" || !bill.issueSlugs?.length || !bill.outcome) continue;
      const entry: Entry = { direction: p.position === "aye" ? "for" : "against", outcome: bill.outcome, votedOn: vote.votedOn, billNumber: vote.billNumber, session: vote.session, sourceUrl: vote.sourceUrl };
      for (const slug of bill.issueSlugs) {
        const arr = byIssue.get(slug) ?? [];
        arr.push(entry);
        byIssue.set(slug, arr);
      }
    }
    const positions = await ctx.db.query("candidate_positions_published").withIndex("by_candidate_issue", (q) => q.eq("raceId", raceId).eq("candidateSlug", candidateSlug)).collect();
    const posBySlug = new Map(positions.map((p) => [p.issueSlug, p]));
    return [...byIssue.entries()]
      .map(([issueSlug, votes]) => {
        votes.sort((a, b) => b.votedOn.localeCompare(a.votedOn));
        const pos = posBySlug.get(issueSlug);
        return {
          issueSlug,
          label: ISSUE_LABEL[issueSlug] ?? issueSlug,
          forCount: votes.filter((v) => v.direction === "for").length,
          againstCount: votes.filter((v) => v.direction === "against").length,
          votes,
          position: pos ? { stance: pos.stance, summary: pos.summary, sources: pos.sources } : undefined,
        };
      })
      .sort((a, b) => b.votes.length - a.votes.length);
  },
});
```

- [ ] **Step 4: Run → pass + commit.** `npx vitest run convex/votesQueries.test.ts && npx tsc --noEmit`
```bash
git add convex/votesQueries.ts convex/votesQueries.test.ts
git commit -m "feat(votes): votingRecordByIssue query (grouped, for/against, position-paired)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: UI — `VotingRecordByIssue` + wire into the record view

**Files:**
- Create: `src/components/guide/voting-record-by-issue.tsx`
- Modify: the candidate/voting-record surface that renders `VotingRecord` (find via `grep -rl "VotingRecord" src/app src/components`) to fetch + render the new section above the session accordion.

**Interfaces:** Consumes `api.votesQueries.votingRecordByIssue`.

- [ ] **Step 1: Build the component**

```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function VotingRecordByIssue({ candidateSlug, raceId }: { candidateSlug: string; raceId: string }) {
  const groups = useQuery(api.votesQueries.votingRecordByIssue, { candidateSlug, raceId });
  if (!groups || groups.length === 0) return null;
  return (
    <section className="mt-8">
      <h3 className="font-display text-lg">How they voted, by issue</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Every final-passage vote, grouped by issue. Each line is their vote plus what a YES did — drawn from the nonpartisan
        Legislative Reference Bureau. The bill is one click away; nothing here rates the candidate.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.issueSlug} className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <div className="flex items-baseline justify-between">
              <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">{g.label}</h4>
              <span className="font-mono text-xs text-muted-foreground">voted for {g.forCount}, against {g.againstCount}</span>
            </div>
            {g.position && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">They said:</span> {g.position.summary}
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1.5">
              {g.votes.map((v) => (
                <li key={`${v.session}-${v.billNumber}-${v.votedOn}`} className="grid grid-cols-[1.2rem_1fr_auto] items-baseline gap-2 text-sm">
                  <span className={v.direction === "for" ? "text-success" : "text-destructive"}>{v.direction === "for" ? "✓" : "✗"}</span>
                  <span>Voted {v.direction} {v.outcome}</span>
                  <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
                    {v.votedOn.slice(0, 4)} · bill ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it in** — render `<VotingRecordByIssue candidateSlug={…} raceId={…} />` next to the existing `VotingRecord`. Pass the candidate's `raceId` (available on the candidate page).

- [ ] **Step 3: Verify.** `npx tsc --noEmit && npx eslint src/components/guide/voting-record-by-issue.tsx && npx next build` (`/…candidate` route compiles). No component-test harness in this repo — visual verification is Task 7.

- [ ] **Step 4: Commit.**
```bash
git add src/components/guide/voting-record-by-issue.tsx <the wired file>
git commit -m "feat(votes): How-they-voted-by-issue UI section

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: review surface + run the classifier + verify live (operational)

**Files:** Modify an existing admin surface (find via `grep -rl "reviewStatus\|admin" convex/adminQueue.ts src/app/admin`) OR use `npx convex run` for review in v1.

- [ ] **Step 1: Minimal review path.** For v1 (2 candidates), add two internal helpers to `convex/billClassify.ts`: `listForReview(): needs_review + pending bills with their proposed issueSlugs/outcome`, and reuse `setBillClassification` to set `approved`/`rejected`. (A full admin UI is deferred; `npx convex run` is acceptable for the v1 review of a bounded set.)

- [ ] **Step 2: Deploy backend + run the classifier (prod).**
```bash
git stash push -q -m wip -- convex/voterHelp.ts && npx convex deploy --yes && git stash pop -q
npx convex run billClassifyRun:classifyPendingBills '{"candidateSlugs":["francesca-hong","kelda-roys"],"limit":80}' --prod
```

- [ ] **Step 3: Human review.** List `pending`/`needs_review`, spot-check each `outcome` against the LRB summary + bill, and set `approved` (or fix/reject). This is the mandatory review gate — do NOT skip. Approve issue-by-issue; ship what's approved.

- [ ] **Step 4: Deploy frontend + browser-verify.** Clean-worktree `vercel --prod` (per `docs/HANDOFF-2026-07-31-forecast-social.md`). Load Hong's candidate page: confirm the "How they voted, by issue" section shows issues with for/against counts, "Voted for/against [outcome]" lines linking the bill, the paired position, and NO scores/labels. Repeat for Roys (if in scope per Task 1).

- [ ] **Step 5: Commit any review helpers.**
```bash
git add convex/billClassify.ts convex/_generated/api.d.ts
git commit -m "feat(votes): classification review helpers + v1 run (Hong/Roys)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** core transformation → Task 4 (direction) + Task 3 (outcome) ✓ · issue grouping → Task 4 ✓ · factual counts → Task 4 (forCount/againstCount) ✓ · substantive-only → `isFinal` in Tasks 2/4 ✓ · human-review gate → Task 3 (needs_review default) + Task 6 (approve) + Task 4 (approved-only) ✓ · position pairing → Task 4 + Task 5 ✓ · no labels/scores → Task 3 prompt + Task 5 copy ✓ · v1 scope + Roys check → Task 1 ✓.

**Placeholder scan:** none — real code in every code step; the human-review and deploy steps are inherently manual and named as such.

**Type consistency:** `classifyStatus` union identical in schema (Task 2), mutation (Task 2), classifier default (Task 3), and query filter (Task 4). `issueSlugs`/`outcome` names consistent across storage, query, and UI. `votingRecordByIssue` return shape (Task 4) matches the UI's consumption (Task 5: `label`, `forCount`, `againstCount`, `votes[].direction/outcome/sourceUrl/votedOn`, `position.summary`).

**Known risk (flagged):** Convex functions can't import from `src/` — `ISSUE_LABEL` is re-declared in `votesQueries.ts` rather than importing `labelForSlug`; keep the 11 slugs in sync with the taxonomy.
