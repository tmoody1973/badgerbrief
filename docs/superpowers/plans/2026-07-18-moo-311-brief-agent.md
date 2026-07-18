# MOO-311 Brief Agent + Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users set preferences and generate a personal, source-linked voter brief — composed by a durable workflow as OpenUI Lang over the MOO-305 registry, streamed progressively to `/brief`.

**Architecture:** A `@convex-dev/workflow` workflow (kicked off by `briefs.generate`) runs up to 3 compose attempts. Each attempt: deterministic context assembly (internalQuery over published tables), one `streamText` call (`claude-opus-4-8`, no tools) whose deltas flush to the `voter_briefs` row (~250ms), then parse-validation against the registry JSON schema. Parse errors feed back into the next attempt. The client's `useQuery` reactivity delivers streaming. Spec: `docs/superpowers/specs/2026-07-18-moo-311-brief-agent-design.md`.

**Tech Stack:** Convex (workflow + node actions), AI SDK v6 (`ai` + `@ai-sdk/anthropic`), `@openuidev/lang-core` (server-side parser), OpenTelemetry→Arize (manual spans), Next.js App Router, vitest + convex-test.

## Global Constraints

- **pnpm, not npm.** Dev server usually already on :3001.
- Model: `anthropic("claude-opus-4-8")` (repo precedent, `convex/helloAgent.ts:97`).
- System prompt: `briefPrompt` from `src/lib/brief/prompt.ts` — NEVER raw `library.prompt()` (fabrication rule is stripped there; `src/lib/brief/library.test.ts` guards it).
- `"use node"` Convex modules may only export actions; queries/mutations live in non-node siblings.
- Annotate return types on same-file/`ctx.runQuery` call sites (TS circularity, handoff gotcha 7).
- Convex bundler does NOT resolve `@/` tsconfig aliases — convex/ code never imports `src/lib/brief/library.tsx` or `prompt.ts` directly; it imports the generated `convex/lib/briefContract.json`.
- Agents get READ-ONLY data; no publish mutations anywhere near the workflow; free text only via `AssistantNote`; no endorsement language.
- detailLevel affects composition only (which components), never per-component density.
- vitest: default env edge-runtime; node-only tests start with `// @vitest-environment node`. Suite must stay green: 47 tests passing before this work.
- Commits: `feat|fix|test|chore: … (MOO-311)`, straight to main.
- zod 4, imported from `"zod"`; `ai` pinned ^6.

## File Structure

- `scripts/generate-brief-contract.ts` — create: regenerates the contract artifact (run via `tsx`)
- `convex/lib/briefContract.json` — create: generated `{prompt, schema}` artifact (checked in)
- `src/lib/brief/contract.test.ts` — create: sync guard artifact ↔ registry
- `convex/schema.ts` — modify: `voter_briefs` gains `status`/`attempt`/`error`
- `convex/briefs.ts` — modify: public `getLatest`/`listMine`/`generate` + internal `assembleContext`/`beginAttempt`/`setSource`/`finalize` (replaces `getMine`)
- `convex/lib/briefContext.ts` — create: `BriefContext` type + context→message builders (pure)
- `convex/lib/briefCompose.test.ts` — create: builder + validation tests
- `convex/lib/briefValidate.ts` — create: parse-validation wrapper (pure)
- `convex/briefs.test.ts` — create: convex-test coverage for queries/mutations
- `convex/briefAgent.ts` — create: `"use node"` `composeAttempt` action (streamText + telemetry + validation)
- `convex/briefWorkflow.ts` — create: WorkflowManager + `generateBriefWorkflow` (3-attempt loop)
- `convex/preferences.ts` — modify: add `savePrefs`
- `convex/public.ts` — modify: add `listIssueSlugs`
- `convex/preferences.test.ts` — create: savePrefs + listIssueSlugs tests
- `src/components/brief/preferences-panel.tsx` — create: prefs UI + Generate CTA
- `src/components/brief/loader.tsx` — modify: status-aware loading, history list, retry
- `src/app/brief/page.tsx` — modify: add panel

---

### Task 1: Brief contract artifact (server-usable prompt + schema)

**Files:**
- Create: `scripts/generate-brief-contract.ts`
- Create: `convex/lib/briefContract.json` (generated)
- Create: `src/lib/brief/contract.test.ts`
- Modify: `package.json` (devDep `tsx`, dep `@openuidev/lang-core`, script)

**Interfaces:**
- Consumes: `briefPrompt` (`src/lib/brief/prompt.ts`), `briefLibrary` (`src/lib/brief/library.tsx`)
- Produces: `convex/lib/briefContract.json` with shape `{ "prompt": string, "schema": <JSON schema object from briefLibrary.toJSONSchema()> }` — Tasks 3/4 import it.

- [ ] **Step 1: Install deps**

```bash
pnpm add @openuidev/lang-core
pnpm add -D tsx
```

(`@openuidev/lang-core` is the React-free core `@openuidev/react-lang@^0.2.8` re-exports `createParser` from — check the lockfile version with `pnpm why @openuidev/lang-core` and match it. Direct dep needed because pnpm's strict layout hides transitive deps from convex code.)

- [ ] **Step 2: Write the generator script**

```ts
// scripts/generate-brief-contract.ts
/**
 * Regenerates convex/lib/briefContract.json — the server-usable form of the
 * MOO-305 registry. Convex can't bundle src/lib/brief (React + "@/" aliases),
 * so the Brief Agent consumes this artifact instead.
 * Run: pnpm generate:brief-contract  (guarded by src/lib/brief/contract.test.ts)
 */
import { writeFileSync } from "node:fs";
import { briefPrompt } from "../src/lib/brief/prompt";
import { briefLibrary } from "../src/lib/brief/library";

const artifact = {
  prompt: briefPrompt,
  schema: briefLibrary.toJSONSchema(),
};
writeFileSync(
  new URL("../convex/lib/briefContract.json", import.meta.url),
  JSON.stringify(artifact, null, 2) + "\n",
);
console.error("wrote convex/lib/briefContract.json");
```

Add to `package.json` scripts: `"generate:brief-contract": "tsx scripts/generate-brief-contract.ts"`.

- [ ] **Step 3: Run it**

Run: `pnpm generate:brief-contract`
Expected: `wrote convex/lib/briefContract.json`; file exists, `prompt` is a non-empty string NOT containing "generate realistic/plausible data", `schema` is an object.
(If tsx trips on the `@/` aliases inside library.tsx, its esbuild honors tsconfig `paths` — confirm the repo root tsconfig is picked up; run with `--tsconfig tsconfig.json` if needed.)

- [ ] **Step 4: Write the sync-guard test (fails if registry drifts from artifact)**

```ts
// src/lib/brief/contract.test.ts
import { describe, expect, test } from "vitest";
import { briefPrompt } from "./prompt";
import { briefLibrary } from "./library";
import artifact from "../../../convex/lib/briefContract.json";

describe("brief contract artifact (convex/lib/briefContract.json)", () => {
  test("prompt matches briefPrompt — regenerate with `pnpm generate:brief-contract`", () => {
    expect(artifact.prompt).toBe(briefPrompt);
  });
  test("schema matches briefLibrary.toJSONSchema()", () => {
    expect(artifact.schema).toEqual(JSON.parse(JSON.stringify(briefLibrary.toJSONSchema())));
  });
  test("artifact carries no fabrication rule", () => {
    expect(artifact.prompt).not.toMatch(/generate realistic\/plausible data/);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/brief/contract.test.ts`
Expected: PASS (3 tests). Then `npx vitest run` — 50 passing, none broken.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-brief-contract.ts convex/lib/briefContract.json src/lib/brief/contract.test.ts package.json pnpm-lock.yaml
git commit -m "feat: server-usable brief contract artifact + sync guard (MOO-311)"
```

---

### Task 2: Schema + brief queries/mutations

**Files:**
- Modify: `convex/schema.ts:54-60` (voter_briefs)
- Create: `convex/lib/briefContext.ts` (type only in this task; builders arrive in Task 3)
- Modify: `convex/briefs.ts` (replace contents)
- Create: `convex/briefs.test.ts`
- Modify: `src/components/brief/loader.tsx:12` — only the query name `getMine`→`getLatest` so tsc stays green (full rewrite is Task 6)

**Interfaces:**
- Consumes: `relevantRaces`, `type Districts` from `src/lib/districts.ts` (imported relatively: `../src/lib/districts` — React-free, alias-free, Convex bundles it)
- Produces (Tasks 3/4/6 rely on these exact names):
  - `api.briefs.getLatest` `{}` → brief doc with `status` defaulted to `"ready"` | null
  - `api.briefs.listMine` `{}` → ready briefs, newest first
  - `api.briefs.generate` `{}` → `Id<"voter_briefs">` (throws without districts)
  - `internal.briefs.assembleContext` `{userId}` → `BriefContext`
  - `internal.briefs.beginAttempt` `{briefId, attempt}` — resets source
  - `internal.briefs.setSource` `{briefId, source}` — full-text overwrite (streaming flush)
  - `internal.briefs.finalize` `{briefId, traceId?, error?}` — `error` present ⇒ `"failed"`, else `"ready"` + fresh `generatedAt`
  - `type BriefContext` from `convex/lib/briefContext.ts`

- [ ] **Step 1: Schema change**

In `convex/schema.ts`, extend `voter_briefs`:

```ts
  voter_briefs: defineTable({
    userId: v.id("users"),
    electionSlug: v.string(),
    openuiSource: v.string(), // OpenUI Lang — components reference entity IDs
    generatedAt: v.number(),
    traceId: v.optional(v.string()), // Arize trace for provenance
    // MOO-311: generation lifecycle. Optional so pre-existing rows stay valid;
    // readers treat missing as "ready".
    status: v.optional(
      v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    ),
    attempt: v.optional(v.number()),
    error: v.optional(v.string()), // user-safe terminal failure reason
  }).index("by_user", ["userId"]),
```

- [ ] **Step 2: BriefContext type**

```ts
// convex/lib/briefContext.ts
/** Deterministic prefetch handed to the compose LLM — entity IDs + availability flags only. */
export type BriefContext = {
  electionSlug: string;
  districts: { congressional: number; senate: number; assembly: number };
  votingInfo: { primaryDate: string; available: boolean };
  races: Array<{
    raceId: string;
    office: string;
    level: string;
    candidates: Array<{
      slug: string;
      name: string;
      party?: string;
      publishedIssueSlugs: string[]; // issues with a published position
      quoteCount: number;
      hasFinance: boolean;
    }>;
  }>;
  preferences: {
    savedRaceIds: string[];
    savedIssues: string[];
    detailLevel: "short" | "standard" | "deep";
  };
};
```

- [ ] **Step 3: Write failing tests**

```ts
// convex/briefs.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const USER = { subject: "clerk_brief_user" };
const setup = () => convexTest(schema, modules);

async function seedUser(t: ReturnType<typeof setup>) {
  return await t.run((ctx) =>
    ctx.db.insert("users", { clerkId: "clerk_brief_user", email: "b@x.com" }),
  );
} // match the users table's actual required fields — read convex/schema.ts users table before writing this helper

const raceBase = { electionSlug: "wi-2026", sources: [], dataAsOf: "2026-07-01" };
async function seedBallotWorld(t: ReturnType<typeof setup>, userId: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-GOV-2026", office: "Governor", level: "State Executive" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-US-HOUSE-D4-2026", office: "U.S. House WI-4", level: "Federal" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-US-HOUSE-D5-2026", office: "U.S. House WI-5", level: "Federal" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-STATE-SENATE-2026", office: "State Senate", level: "State Legislative", districts: [{ district: 3 }, { district: 5 }] });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-STATE-ASSEMBLY-2026", office: "State Assembly", level: "State Legislative", districts: [{ district: 8 }] });
    await ctx.db.insert("candidates", { ...raceBase, slug: "kelda-roys", raceId: "WI-GOV-2026", name: "Kelda Roys" });
    await ctx.db.insert("voting_info", { electionSlug: "wi-2026", primaryDate: "2026-08-11", officialVoterInfoUrl: "https://myvote.wi.gov", sources: [], lastCheckedAt: Date.now() });
    await ctx.db.insert("user_preferences", {
      userId,
      address: "200 E Wells St, Milwaukee, WI 53202",
      congressionalDistrict: "4",
      stateSenateDistrict: "3",
      stateAssemblyDistrict: "8",
      savedRaceIds: ["WI-GOV-2026"],
      savedIssues: ["housing"],
      detailLevel: "standard",
    });
  });
}

describe("briefs lifecycle", () => {
  test("getLatest null when signed out", async () => {
    expect(await setup().query(api.briefs.getLatest, {})).toBeNull();
  });

  test("assembleContext returns exactly the district-correct races", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedBallotWorld(t, userId);
    const ctxBlock = await t.query(internal.briefs.assembleContext, { userId });
    expect(ctxBlock.races.map((r) => r.raceId).sort()).toEqual([
      "WI-GOV-2026",
      "WI-STATE-ASSEMBLY-2026",
      "WI-STATE-SENATE-2026", // senate 3 is odd → up in 2026
      "WI-US-HOUSE-D4-2026", // D5 excluded
    ]);
    expect(ctxBlock.preferences.detailLevel).toBe("standard");
    expect(ctxBlock.races.find((r) => r.raceId === "WI-GOV-2026")!.candidates[0].slug).toBe("kelda-roys");
  });

  test("generate throws without districts", async () => {
    const t = setup();
    await seedUser(t);
    await expect(t.withIdentity(USER).mutation(api.briefs.generate, {})).rejects.toThrow(/address/i);
  });

  test("beginAttempt/setSource/finalize lifecycle; getLatest defaults legacy rows to ready", async () => {
    const t = setup();
    const userId = await seedUser(t);
    const briefId = await t.run((ctx) =>
      ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "old", generatedAt: 1, status: "generating", attempt: 1 }),
    );
    await t.mutation(internal.briefs.beginAttempt, { briefId, attempt: 2 });
    await t.mutation(internal.briefs.setSource, { briefId, source: "root = Stack([])" });
    await t.mutation(internal.briefs.finalize, { briefId, traceId: "trace-1" });
    const row = await t.run((ctx) => ctx.db.get(briefId));
    expect(row).toMatchObject({ status: "ready", attempt: 2, traceId: "trace-1", openuiSource: "root = Stack([])" });
    expect(row!.generatedAt).toBeGreaterThan(1);

    await t.mutation(internal.briefs.finalize, { briefId, error: "failed after 3 attempts" });
    expect((await t.run((ctx) => ctx.db.get(briefId)))!.status).toBe("failed");

    // legacy row without status reads as ready
    await t.run((ctx) => ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "x", generatedAt: 2 }));
    const latest = await t.withIdentity(USER).query(api.briefs.getLatest, {});
    expect(latest!.status).toBe("ready");
  });

  test("listMine returns only ready briefs, newest first", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "a", generatedAt: 1, status: "ready" });
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "b", generatedAt: 2, status: "failed" });
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "c", generatedAt: 3, status: "ready" });
    });
    const list = await t.withIdentity(USER).query(api.briefs.listMine, {});
    expect(list.map((b) => b.openuiSource)).toEqual(["c", "a"]);
  });
});
```

Adjust the `users` insert to the table's actual required fields (read the `users` table in `convex/schema.ts` first — `by_clerk_id` index exists, other fields may be required).

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run convex/briefs.test.ts`
Expected: FAIL — `getLatest`/`assembleContext`/etc. don't exist yet.

- [ ] **Step 5: Implement `convex/briefs.ts`**

```ts
import { v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { relevantRaces, type Districts } from "../src/lib/districts";
import type { BriefContext } from "./lib/briefContext";

const STALE_GENERATING_MS = 10 * 60_000; // ponytail: crashed-workflow escape hatch; onComplete handler if it ever matters

async function currentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

const withStatus = (b: Doc<"voter_briefs">) => ({ ...b, status: b.status ?? ("ready" as const) });

/** Newest brief for the signed-in user (any status) — the /brief page's main subscription. */
export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const brief = await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    return brief ? withStatus(brief) : null;
  },
});

/** Ready briefs, newest first — the saved-briefs history list. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    const briefs = await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return briefs.map(withStatus).filter((b) => b.status === "ready");
  },
});

/** Kick off brief generation. Requires saved districts. Idempotent while one is running. */
export const generate = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"voter_briefs">> => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Sign in to generate a brief.");
    const prefs = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!prefs?.congressionalDistrict || !prefs.stateSenateDistrict || !prefs.stateAssemblyDistrict) {
      throw new Error("Set your address first — a brief needs your districts.");
    }
    const latest = await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (latest?.status === "generating" && Date.now() - latest.generatedAt < STALE_GENERATING_MS) {
      return latest._id;
    }
    const briefId = await ctx.db.insert("voter_briefs", {
      userId: user._id,
      electionSlug: "wi-2026",
      openuiSource: "",
      generatedAt: Date.now(),
      status: "generating",
      attempt: 1,
    });
    await start(ctx, internal.briefWorkflow.generateBriefWorkflow, { briefId, userId: user._id });
    return briefId;
  },
});

/** Deterministic prefetch: everything the compose LLM may reference, IDs + availability only. */
export const assembleContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<BriefContext> => {
    const prefs = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!prefs?.congressionalDistrict) throw new Error("assembleContext: user has no districts");
    const districts: Districts = {
      congressional: Number(prefs.congressionalDistrict),
      senate: Number(prefs.stateSenateDistrict),
      assembly: Number(prefs.stateAssemblyDistrict),
    };
    const allRaces = await ctx.db.query("races").collect();
    const ballot = relevantRaces(districts, allRaces);
    const races: BriefContext["races"] = [];
    for (const race of ballot) {
      const candidates = await ctx.db
        .query("candidates")
        .withIndex("by_race", (q) => q.eq("raceId", race.raceId))
        .collect();
      const enriched = [];
      for (const c of candidates) {
        const [positions, quotes, finance] = await Promise.all([
          ctx.db.query("candidate_positions_published").withIndex("by_candidate_issue", (q) => q.eq("raceId", race.raceId).eq("candidateSlug", c.slug)).collect(),
          ctx.db.query("quote_published").withIndex("by_candidate", (q) => q.eq("raceId", race.raceId).eq("candidateSlug", c.slug)).collect(),
          ctx.db.query("finance_totals").withIndex("by_candidate", (q) => q.eq("raceId", race.raceId).eq("candidateSlug", c.slug)).collect(),
        ]);
        enriched.push({
          slug: c.slug,
          name: c.name,
          party: c.party ?? c.primaryParty,
          publishedIssueSlugs: [...new Set(positions.map((p) => p.issueSlug))],
          quoteCount: quotes.length,
          hasFinance: finance.length > 0,
        });
      }
      races.push({ raceId: race.raceId, office: race.office, level: race.level, candidates: enriched });
    }
    const votingInfo = await ctx.db
      .query("voting_info")
      .withIndex("by_election", (q) => q.eq("electionSlug", "wi-2026"))
      .unique();
    return {
      electionSlug: "wi-2026",
      districts,
      votingInfo: { primaryDate: votingInfo?.primaryDate ?? "2026-08-11", available: votingInfo !== null },
      races,
      preferences: {
        savedRaceIds: prefs.savedRaceIds,
        savedIssues: prefs.savedIssues,
        detailLevel: prefs.detailLevel,
      },
    };
  },
});

export const beginAttempt = internalMutation({
  args: { briefId: v.id("voter_briefs"), attempt: v.number() },
  handler: async (ctx, { briefId, attempt }) => {
    await ctx.db.patch(briefId, { openuiSource: "", attempt, status: "generating" });
  },
});

/** Streaming flush: full accumulated source each time (idempotent, no ordering hazard). */
export const setSource = internalMutation({
  args: { briefId: v.id("voter_briefs"), source: v.string() },
  handler: async (ctx, { briefId, source }) => {
    await ctx.db.patch(briefId, { openuiSource: source });
  },
});

export const finalize = internalMutation({
  args: { briefId: v.id("voter_briefs"), traceId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { briefId, traceId, error }) => {
    if (error) {
      await ctx.db.patch(briefId, { status: "failed", error });
      return;
    }
    await ctx.db.patch(briefId, { status: "ready", traceId, error: undefined, generatedAt: Date.now() });
  },
});
```

Note: `internal.briefWorkflow.generateBriefWorkflow` doesn't exist until Task 4. To keep this task self-contained and green, create a minimal placeholder now — Task 4 replaces its handler body:

```ts
// convex/briefWorkflow.ts (placeholder — Task 4 fills in the real 3-attempt loop)
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const briefWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
    retryActionsByDefault: true,
    maxParallelism: 1,
  },
});

export const generateBriefWorkflow = briefWorkflow.define({
  args: { briefId: v.id("voter_briefs"), userId: v.id("users") },
  handler: async (step, { briefId }): Promise<void> => {
    await step.runMutation(internal.briefs.finalize, { briefId, error: "Brief Agent not wired yet (MOO-311 Task 4)." });
  },
});
```

Also update `src/components/brief/loader.tsx:12` from `api.briefs.getMine` to `api.briefs.getLatest` and line 42's `saved.openuiSource` usage stays valid (full loader rewrite is Task 6 — here just keep tsc green: `getLatest` returns the same fields plus `status`).

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run convex/briefs.test.ts` → PASS (5 tests).
Run: `npx tsc --noEmit` → clean. `npx vitest run` → all green.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/briefs.ts convex/briefWorkflow.ts convex/lib/briefContext.ts convex/briefs.test.ts src/components/brief/loader.tsx
git commit -m "feat: voter_briefs lifecycle, context assembly, workflow scaffold (MOO-311)"
```

---

### Task 3: Compose message builders + parse validation (pure)

**Files:**
- Modify: `convex/lib/briefContext.ts` (add builders)
- Create: `convex/lib/briefValidate.ts`
- Create: `convex/lib/briefCompose.test.ts`

**Interfaces:**
- Consumes: `BriefContext` (Task 2), `createParser` from `@openuidev/lang-core` (Task 1 dep), `convex/lib/briefContract.json` (Task 1)
- Produces:
  - `buildBriefUserMessage(context: BriefContext): string`
  - `buildCorrectiveMessage(summary: string): string`
  - `validateBriefSource(source: string, schema: unknown): { ok: true } | { ok: false; summary: string }` (summary serializes `meta.errors` + `meta.unresolved`)

- [ ] **Step 1: Write failing tests**

```ts
// convex/lib/briefCompose.test.ts
import { describe, expect, test } from "vitest";
import { buildBriefUserMessage, buildCorrectiveMessage, type BriefContext } from "./briefContext";
import { validateBriefSource } from "./briefValidate";
import contract from "./briefContract.json";

const context: BriefContext = {
  electionSlug: "wi-2026",
  districts: { congressional: 4, senate: 3, assembly: 8 },
  votingInfo: { primaryDate: "2026-08-11", available: true },
  races: [
    {
      raceId: "WI-GOV-2026",
      office: "Governor",
      level: "State Executive",
      candidates: [
        { slug: "kelda-roys", name: "Kelda Roys", party: "Democratic", publishedIssueSlugs: ["immigration"], quoteCount: 1, hasFinance: true },
        { slug: "joel-brennan", name: "Joel Brennan", party: "Democratic", publishedIssueSlugs: [], quoteCount: 0, hasFinance: false },
      ],
    },
  ],
  preferences: { savedRaceIds: ["WI-GOV-2026"], savedIssues: ["immigration"], detailLevel: "deep" },
};

describe("buildBriefUserMessage", () => {
  test("carries entity IDs, preferences, and data-availability guardrails", () => {
    const msg = buildBriefUserMessage(context);
    expect(msg).toContain("WI-GOV-2026");
    expect(msg).toContain("kelda-roys");
    expect(msg).toContain("deep");
    // sparse-data guardrail: components only for candidates that list the data
    expect(msg).toMatch(/only.*IssueStanceCard.*publishedIssueSlugs/is);
    expect(msg).toMatch(/never invent/i);
  });
  test("detailLevel maps to composition-only directives", () => {
    const short = buildBriefUserMessage({ ...context, preferences: { ...context.preferences, detailLevel: "short" } });
    expect(short).toMatch(/skip QuoteCard/i);
    expect(short).not.toMatch(/density/i);
  });
});

describe("validateBriefSource", () => {
  test("valid source over the real schema passes", () => {
    const src = ['root = Stack([h, c])', 'h = BriefHeader()', 'c = VotingChecklist()'].join("\n");
    expect(validateBriefSource(src, contract.schema)).toEqual({ ok: true });
  });
  test("off-registry component fails with a summary naming it", () => {
    const res = validateBriefSource('root = Stack([x])\nx = MadeUpWidget()', contract.schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.summary).toMatch(/MadeUpWidget/);
  });
  test("unresolved reference fails", () => {
    const res = validateBriefSource("root = Stack([missing])", contract.schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.summary).toMatch(/missing/);
  });
});

describe("buildCorrectiveMessage", () => {
  test("embeds the failure summary and re-states the contract", () => {
    const msg = buildCorrectiveMessage('component "MadeUpWidget" not in registry');
    expect(msg).toContain("MadeUpWidget");
    expect(msg).toMatch(/only.*registry/i);
  });
});
```

Mirror the exact `createParser(...).parse(...)` call signature used in `src/lib/brief/library.test.ts` (the MOO-305 precedent) when implementing `validateBriefSource`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/lib/briefCompose.test.ts`
Expected: FAIL — builders don't exist.

- [ ] **Step 3: Implement**

Append to `convex/lib/briefContext.ts`:

```ts
const DETAIL_DIRECTIVES: Record<BriefContext["preferences"]["detailLevel"], string> = {
  short:
    "Detail level SHORT: BriefHeader, VotingChecklist, DeadlineBanner if a deadline is near, and one RaceCard per race. Skip QuoteCard, IssueStanceCard, FinanceSnapshot, and CandidateCompareCard.",
  standard:
    "Detail level STANDARD: RaceCard per race, CandidateCompareCard for contested races (max 4 slugs), IssueStanceCard for the user's saved issues where a candidate lists that issue.",
  deep:
    "Detail level DEEP: everything in STANDARD, plus QuoteCard and FinanceSnapshot for candidates in starred races — but only where the candidate lists quotes/finance data.",
};

/** The compose call's single user message: context JSON + composition directives. */
export function buildBriefUserMessage(context: BriefContext): string {
  return [
    "Compose a personal voter brief from this ballot data. Use ONLY the entity IDs listed here — never invent a raceId, candidateSlug, or issueSlug.",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    `Preferences: starred races ${JSON.stringify(context.preferences.savedRaceIds)} come first (after header/checklist); saved issues ${JSON.stringify(context.preferences.savedIssues)}.`,
    DETAIL_DIRECTIVES[context.preferences.detailLevel],
    "Data availability is authoritative: only emit IssueStanceCard for (candidateSlug, issueSlug) pairs present in that candidate's publishedIssueSlugs; only emit QuoteCard where quoteCount > 0; only emit FinanceSnapshot where hasFinance is true. Where coverage is sparse, a brief AssistantNote may say published coverage is limited.",
  ].join("\n");
}

/** Retry feedback: the parser's structured failure, re-anchored to the contract. */
export function buildCorrectiveMessage(summary: string): string {
  return [
    "Your previous output failed OpenUI Lang validation:",
    summary,
    "Regenerate the FULL brief from the same ballot data. Output only components from the registry, resolve every reference, and follow the component arg shapes exactly.",
  ].join("\n");
}
```

```ts
// convex/lib/briefValidate.ts
import { createParser } from "@openuidev/lang-core";

/** End-of-generation gate: a brief saves as ready only when this returns ok. */
export function validateBriefSource(
  source: string,
  schema: unknown,
): { ok: true } | { ok: false; summary: string } {
  const result = createParser(schema).parse(source); // match src/lib/brief/library.test.ts's exact call shape
  const errors = result.meta.errors ?? [];
  const unresolved = result.meta.unresolved ?? [];
  if (errors.length === 0 && unresolved.length === 0) return { ok: true };
  const parts = [
    ...errors.map((e: unknown) => (typeof e === "string" ? e : JSON.stringify(e))),
    ...unresolved.map((name: string) => `unresolved reference: "${name}"`),
  ];
  return { ok: false, summary: parts.slice(0, 10).join("\n") };
}
```

(If `createParser`'s argument type or `parse` options differ, defer to `src/lib/brief/library.test.ts` — it is the working precedent; adjust the wrapper, not the tests' intent.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/lib/briefCompose.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/briefContext.ts convex/lib/briefValidate.ts convex/lib/briefCompose.test.ts
git commit -m "feat: brief compose message builders + parse validation gate (MOO-311)"
```

---

### Task 4: Compose action + durable workflow

**Files:**
- Create: `convex/briefAgent.ts` (`"use node"` — actions only)
- Modify: `convex/briefWorkflow.ts` (replace placeholder handler)

**Interfaces:**
- Consumes: `internal.briefs.*` (Task 2), builders/validator (Task 3), `convex/lib/briefContract.json` (Task 1), telemetry pattern from `convex/helloAgent.ts:29-58,119-152`
- Produces: `internal.briefAgent.composeAttempt` `{briefId, userId, attempt, priorFailure?}` → `{ok: boolean, failureSummary?: string, traceId?: string}`; `internal.briefWorkflow.generateBriefWorkflow` (real 3-attempt loop)

- [ ] **Step 1: Load reference material**

Read `convex/helloAgent.ts` in full (telemetry singleton + AGENT/LLM span pattern), and the `claude-api` skill if not already loaded this session. The compose call uses plain AI SDK `streamText` — no `@convex-dev/agent` `Agent` class (no thread/history needed for one-shot composition).

- [ ] **Step 2: Implement `convex/briefAgent.ts`**

```ts
"use node";
/**
 * MOO-311 Brief Agent compose step. One streamText call over the prefetched
 * context — no tools, no publish mutations; the LLM only arranges entity IDs
 * it was handed (spec §3/§7 governance). Telemetry mirrors helloAgent.ts:
 * @convex-dev/agent-era caveat still applies — the AI SDK call is recorded
 * with manual AGENT/LLM spans.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from "@arizeai/openinference-vercel";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import contract from "./lib/briefContract.json";
import { buildBriefUserMessage, buildCorrectiveMessage, type BriefContext } from "./lib/briefContext";
import { validateBriefSource } from "./lib/briefValidate";

const AGENT_NAME = "brief-agent";
const MODEL = "claude-opus-4-8";
const FLUSH_MS = 250;

// Lazy singleton, env read at call time (copy of helloAgent.ts pattern).
let provider: NodeTracerProvider | null = null;
function ensureTelemetry(): NodeTracerProvider | null {
  if (provider) return provider;
  const spaceId = process.env.ARIZE_SPACE_ID;
  const apiKey = process.env.ARIZE_API_KEY;
  if (!spaceId || !apiKey) {
    console.warn("Arize telemetry disabled: ARIZE_SPACE_ID / ARIZE_API_KEY not set");
    return null;
  }
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_PROJECT_NAME]: process.env.ARIZE_PROJECT_NAME ?? "badgerbrief",
      model_version: "m1",
    }),
    spanProcessors: [
      new OpenInferenceSimpleSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: "https://otlp.arize.com/v1/traces",
          headers: { "arize-space-id": spaceId, "arize-api-key": apiKey },
        }),
        spanFilter: isOpenInferenceSpan,
        reparentOrphanedSpans: true,
      }),
    ],
  });
  provider.register();
  return provider;
}
const tracer = () => trace.getTracer("badgerbrief-agents");

export const composeAttempt = internalAction({
  args: {
    briefId: v.id("voter_briefs"),
    userId: v.id("users"),
    attempt: v.number(),
    priorFailure: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    failureSummary: v.optional(v.string()),
    traceId: v.optional(v.string()),
  }),
  handler: async (ctx, { briefId, userId, attempt, priorFailure }) => {
    const telemetry = ensureTelemetry();
    const context: BriefContext = await ctx.runQuery(internal.briefs.assembleContext, { userId });
    const messages: Array<{ role: "user"; content: string }> = [
      { role: "user", content: buildBriefUserMessage(context) },
    ];
    if (priorFailure) messages.push({ role: "user", content: buildCorrectiveMessage(priorFailure) });

    const run = async (): Promise<{ ok: boolean; failureSummary?: string; text: string }> => {
      const result = streamText({
        model: anthropic(MODEL),
        system: contract.prompt,
        messages,
      });
      let acc = "";
      let lastFlush = 0;
      for await (const delta of result.textStream) {
        acc += delta;
        const now = Date.now();
        if (now - lastFlush >= FLUSH_MS) {
          lastFlush = now;
          await ctx.runMutation(internal.briefs.setSource, { briefId, source: acc });
        }
      }
      await ctx.runMutation(internal.briefs.setSource, { briefId, source: acc });
      const usage = await result.usage;
      const verdict = validateBriefSource(acc, contract.schema);
      // manual LLM span (agent-substrate caveat: nothing forwards telemetry for us)
      if (telemetry) {
        const llmSpan = tracer().startSpan("claude.streamText");
        llmSpan.setAttribute("openinference.span.kind", "LLM");
        llmSpan.setAttribute("llm.model_name", MODEL);
        llmSpan.setAttribute("input.value", messages[messages.length - 1].content.slice(0, 4000));
        llmSpan.setAttribute("output.value", acc.slice(0, 4000));
        if (usage?.inputTokens !== undefined) llmSpan.setAttribute("llm.token_count.prompt", usage.inputTokens);
        if (usage?.outputTokens !== undefined) llmSpan.setAttribute("llm.token_count.completion", usage.outputTokens);
        llmSpan.end();
      }
      return verdict.ok ? { ok: true, text: acc } : { ok: false, failureSummary: verdict.summary, text: acc };
    };

    if (!telemetry) {
      const out = await run();
      return { ok: out.ok, failureSummary: out.failureSummary, traceId: undefined };
    }
    const out = await tracer().startActiveSpan(`${AGENT_NAME}.compose`, async (span) => {
      span.setAttribute("openinference.span.kind", "AGENT");
      span.setAttribute("agent.name", AGENT_NAME);
      span.setAttribute("session.id", String(briefId));
      span.setAttribute("brief.attempt", attempt);
      span.setAttribute("input.value", `districts=${JSON.stringify(context.districts)} detail=${context.preferences.detailLevel}`);
      try {
        const r = await run();
        span.setAttribute("output.value", r.ok ? "ok" : `parse_failed: ${r.failureSummary ?? ""}`.slice(0, 2000));
        return { ...r, traceId: span.spanContext().traceId };
      } finally {
        span.end();
      }
    });
    await telemetry.forceFlush();
    return { ok: out.ok, failureSummary: out.failureSummary, traceId: out.traceId };
  },
});
```

(AI SDK v6: `result.usage` is a promise on stream results; if tsc disagrees, check `node_modules/ai`'s `StreamTextResult` type and adapt — do not guess.)

- [ ] **Step 3: Replace the workflow placeholder handler**

```ts
// convex/briefWorkflow.ts — full file
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const briefWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
    retryActionsByDefault: true, // transient LLM/network failures — separate from parse retries
    maxParallelism: 1,
  },
});

const MAX_COMPOSE_ATTEMPTS = 3; // spec decision (c): parse-failure retries with error feedback

export const generateBriefWorkflow = briefWorkflow.define({
  args: { briefId: v.id("voter_briefs"), userId: v.id("users") },
  handler: async (step, { briefId, userId }): Promise<void> => {
    let priorFailure: string | undefined;
    for (let attempt = 1; attempt <= MAX_COMPOSE_ATTEMPTS; attempt++) {
      await step.runMutation(internal.briefs.beginAttempt, { briefId, attempt });
      const result: { ok: boolean; failureSummary?: string; traceId?: string } =
        await step.runAction(
          internal.briefAgent.composeAttempt,
          { briefId, userId, attempt, priorFailure },
          { retry: true },
        );
      if (result.ok) {
        await step.runMutation(internal.briefs.finalize, { briefId, traceId: result.traceId });
        return;
      }
      priorFailure = result.failureSummary;
    }
    await step.runMutation(internal.briefs.finalize, {
      briefId,
      error: "We couldn't produce a valid brief after 3 attempts. Try again.",
    });
  },
});
```

- [ ] **Step 4: Typecheck + suite + deploy to dev**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → all green (workflow/agent have no unit tests — LLM-dependent; they're verified live in Step 5).
Run: `npx convex dev --once` (or confirm `npx convex dev` picked it up) → deploys without bundling errors. **This is the moment the `briefContract.json` import and `../src/lib/districts` import are proven bundle-safe** — if bundling fails here, fix before proceeding.

- [ ] **Step 5: Live smoke test on dev deployment (`greedy-armadillo-714`)**

`api.briefs.generate` needs an authed identity, so drive the internals directly (the CLI can run internal functions on dev):

1. In the dashboard (or via a throwaway internal mutation), insert a `user_preferences` row with real districts (CD 4 / Senate 3 / Assembly 8) for an existing dev user, and a `voter_briefs` row `{userId, electionSlug: "wi-2026", openuiSource: "", generatedAt: <now>, status: "generating", attempt: 1}`.
2. Run: `npx convex run briefAgent:composeAttempt '{"briefId":"<id>","userId":"<id>","attempt":1}'`
3. Expect `{ok: true, traceId: "..."}`; the row's `openuiSource` must hold OpenUI Lang that `validateBriefSource` accepts, referencing only real raceIds/candidateSlugs.

Record the output — it is MOO-311 evidence.

- [ ] **Step 6: Commit**

```bash
git add convex/briefAgent.ts convex/briefWorkflow.ts
git commit -m "feat: Brief Agent compose action + durable 3-attempt workflow (MOO-311)"
```

---

### Task 5: Preferences mutations + issue list

**Files:**
- Modify: `convex/preferences.ts` (add `savePrefs`)
- Modify: `convex/public.ts` (add `listIssueSlugs`)
- Create: `convex/preferences.test.ts`

**Interfaces:**
- Produces: `api.preferences.savePrefs` `{savedRaceIds: string[], savedIssues: string[], detailLevel: "short"|"standard"|"deep"}`; `api.public.listIssueSlugs` `{}` → `string[]` (distinct, sorted)

- [ ] **Step 1: Write failing tests**

```ts
// convex/preferences.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const USER = { subject: "clerk_pref_user" };
const setup = () => convexTest(schema, modules);

describe("savePrefs", () => {
  test("patches existing prefs row, preserving districts", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { clerkId: "clerk_pref_user", email: "p@x.com" }));
    await t.run((ctx) =>
      ctx.db.insert("user_preferences", {
        userId, address: "a", congressionalDistrict: "4", stateSenateDistrict: "3", stateAssemblyDistrict: "8",
        savedRaceIds: [], savedIssues: [], detailLevel: "standard",
      }),
    );
    await t.withIdentity(USER).mutation(api.preferences.savePrefs, {
      savedRaceIds: ["WI-GOV-2026"], savedIssues: ["housing"], detailLevel: "deep",
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("user_preferences").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    );
    expect(row).toMatchObject({ savedRaceIds: ["WI-GOV-2026"], savedIssues: ["housing"], detailLevel: "deep", congressionalDistrict: "4" });
  });

  test("creates a prefs row when none exists (districts come later)", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { clerkId: "clerk_pref_user", email: "p@x.com" }));
    await t.withIdentity(USER).mutation(api.preferences.savePrefs, { savedRaceIds: [], savedIssues: ["schools"], detailLevel: "short" });
    const row = await t.run(async (ctx) =>
      ctx.db.query("user_preferences").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    );
    expect(row).toMatchObject({ savedIssues: ["schools"], detailLevel: "short" });
  });
});

describe("listIssueSlugs", () => {
  test("distinct sorted slugs from published positions", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const base = { raceId: "WI-GOV-2026", candidateSlug: "kelda-roys", summary: "s", sourceUrl: "u", publishedAt: 1 };
      await ctx.db.insert("candidate_positions_published", { ...base, issueSlug: "housing" } as never);
      await ctx.db.insert("candidate_positions_published", { ...base, issueSlug: "immigration" } as never);
      await ctx.db.insert("candidate_positions_published", { ...base, candidateSlug: "joel-brennan", issueSlug: "housing" } as never);
    });
    expect(await t.query(api.public.listIssueSlugs, {})).toEqual(["housing", "immigration"]);
  });
});
```

Fix the `candidate_positions_published` insert fields to the table's actual required schema (read it in `convex/schema.ts:244-254` first — drop the `as never` once fields are correct; same for `users`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/preferences.test.ts` → FAIL (functions missing).

- [ ] **Step 3: Implement**

Append to `convex/preferences.ts`:

```ts
export const savePrefs = mutation({
  args: {
    savedRaceIds: v.array(v.string()),
    savedIssues: v.array(v.string()),
    detailLevel: v.union(v.literal("short"), v.literal("standard"), v.literal("deep")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    const existing = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("user_preferences", { userId: user._id, ...args });
  },
});
```

Append to `convex/public.ts`:

```ts
export const listIssueSlugs = query({
  args: {},
  handler: async (ctx) => {
    const positions = await ctx.db.query("candidate_positions_published").collect();
    return [...new Set(positions.map((p) => p.issueSlug))].sort();
  },
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/preferences.test.ts` → PASS. Full suite + `npx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add convex/preferences.ts convex/public.ts convex/preferences.test.ts
git commit -m "feat: savePrefs mutation + listIssueSlugs query (MOO-311)"
```

---

### Task 6: /brief surface — preferences panel + status-aware loader

**Files:**
- Create: `src/components/brief/preferences-panel.tsx`
- Modify: `src/components/brief/loader.tsx` (rewrite)
- Modify: `src/app/brief/page.tsx`

**Interfaces:**
- Consumes: `api.preferences.getMine`/`savePrefs`, `api.public.listRaces`/`listIssueSlugs`, `api.briefs.generate`/`getLatest`/`listMine`, `BallotFinder` (`src/components/guide/ballot-finder.tsx`), `relevantRaces` (`src/lib/districts.ts`), `BriefRenderer`, `BriefSkeleton` (`src/components/brief/chrome.tsx`), `fixtureBrief`
- Produces: `PreferencesPanel()` client component; rewritten `BriefLoader()`

Style: match the site's RetroUI idiom exactly — `border-2 border-border … shadow-[var(--shadow-brutal)] press` patterns as in `ballot-finder.tsx`. No new design language.

- [ ] **Step 1: Build `PreferencesPanel`**

```tsx
// src/components/brief/preferences-panel.tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { relevantRaces, type Districts } from "@/lib/districts";
import { BallotFinder } from "@/components/guide/ballot-finder";

const DETAIL_LEVELS = [
  ["short", "Short — the essentials"],
  ["standard", "Standard — races + comparisons"],
  ["deep", "Deep — quotes and money too"],
] as const;

/** MOO-311 preferences: address→districts (BallotFinder), starred races, issues, detail level. */
export function PreferencesPanel() {
  const prefs = useQuery(api.preferences.getMine, {});
  const races = useQuery(api.public.listRaces, {});
  const issueSlugs = useQuery(api.public.listIssueSlugs, {});
  const savePrefs = useMutation(api.preferences.savePrefs);
  const generate = useMutation(api.briefs.generate);

  if (prefs === undefined || races === undefined) return null;

  const districts: Districts | null = prefs?.congressionalDistrict
    ? {
        congressional: Number(prefs.congressionalDistrict),
        senate: Number(prefs.stateSenateDistrict),
        assembly: Number(prefs.stateAssemblyDistrict),
      }
    : null;
  const ballot = districts ? relevantRaces(districts, races) : [];
  const saved = {
    savedRaceIds: prefs?.savedRaceIds ?? [],
    savedIssues: prefs?.savedIssues ?? [],
    detailLevel: prefs?.detailLevel ?? ("standard" as const),
  };
  const patch = (partial: Partial<typeof saved>) => void savePrefs({ ...saved, ...partial });
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  return (
    <section className="mb-8 border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">Your brief, your ballot</h2>
      {!districts && <BallotFinder races={races} />}
      {districts && (
        <>
          <p className="mt-1 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            CD {districts.congressional} · Senate {districts.senate} · Assembly {districts.assembly}
            {prefs?.address ? ` · ${prefs.address}` : ""}
          </p>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold">Star the races you care about most</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ballot.map((race) => (
                <label key={race.raceId} className="flex items-center gap-1.5 border-2 border-border bg-background px-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={saved.savedRaceIds.includes(race.raceId)}
                    onChange={() => patch({ savedRaceIds: toggle(saved.savedRaceIds, race.raceId) })}
                  />
                  {race.office}
                </label>
              ))}
            </div>
          </fieldset>
          {issueSlugs && issueSlugs.length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-sm font-bold">Issues to highlight</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {issueSlugs.map((slug) => (
                  <label key={slug} className="flex items-center gap-1.5 border-2 border-border bg-background px-2 py-1 text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={saved.savedIssues.includes(slug)}
                      onChange={() => patch({ savedIssues: toggle(saved.savedIssues, slug) })}
                    />
                    {slug.replace(/-/g, " ")}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="mt-4">
            <legend className="text-sm font-bold">Detail level</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DETAIL_LEVELS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 border-2 border-border bg-background px-2 py-1 text-sm">
                  <input
                    type="radio"
                    name="detailLevel"
                    checked={saved.detailLevel === value}
                    onChange={() => patch({ detailLevel: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => void generate({})}
            className="mt-5 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
          >
            Generate my brief
          </button>
        </>
      )}
    </section>
  );
}
```

Note `useConvexAuth` gate: `api.preferences.getMine`/`api.briefs.getLatest` return null on unauth rather than throwing (verified in Task 2), so no `"skip"` needed — but double-check no query added here throws on unauth (gotcha 2). `PreferencesPanel` should only render for signed-in users — gate it in the page with Clerk's `<SignedIn>` (or the pattern the site already uses; check `src/app` for precedent and follow it).

- [ ] **Step 2: Rewrite `BriefLoader`**

Keep the print-expansion `useEffect` exactly as is (`loader.tsx:14-36`). Replace the body:

```tsx
// state additions at top of component:
const latest = useQuery(api.briefs.getLatest, {});
const history = useQuery(api.briefs.listMine, {});
const generate = useMutation(api.briefs.generate);
const [selectedId, setSelectedId] = useState<string | null>(null);

if (latest === undefined) return <BriefSkeleton lines={8} />;

// Signed-out or never generated: fixture demo (existing behavior)
if (latest === null) {
  return (
    <div>
      <BriefRenderer source={fixtureBrief} />
      <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Sample brief — sign in and set your address to generate yours
      </p>
    </div>
  );
}

const selected = selectedId ? history?.find((b) => b._id === selectedId) : undefined;
const brief = selected ?? latest;

if (!selected && latest.status === "generating") {
  return (
    <div>
      <p className="font-mono text-xs font-bold uppercase tracking-widest">
        {(latest.attempt ?? 1) > 1 ? "Refining your brief…" : "Composing your brief…"}
      </p>
      <BriefRenderer source={latest.openuiSource || null} isStreaming />
      {!latest.openuiSource && <BriefSkeleton lines={8} />}
    </div>
  );
}

if (!selected && latest.status === "failed") {
  return (
    <div className="border-2 border-border bg-warning p-4">
      <p className="font-bold">{latest.error ?? "Brief generation failed."}</p>
      <button type="button" onClick={() => void generate({})} className="mt-3 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press">
        Try again
      </button>
    </div>
  );
}

return (
  <div>
    <BriefRenderer source={brief.openuiSource} />
    <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      Generated {new Date(brief.generatedAt).toLocaleDateString("en-US", { dateStyle: "long" })}
    </p>
    {history && history.length > 1 && (
      <nav className="mt-4">
        <h3 className="text-sm font-bold">Saved briefs</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {history.map((b) => (
            <li key={b._id}>
              <button type="button" onClick={() => setSelectedId(b._id === latest._id ? null : b._id)} className={b._id === brief._id ? "font-bold underline" : "underline"}>
                {new Date(b.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    )}
  </div>
);
```

- [ ] **Step 3: Wire the page**

```tsx
// src/app/brief/page.tsx
import type { Metadata } from "next";
import { BriefLoader } from "@/components/brief/loader";
import { PreferencesPanel } from "@/components/brief/preferences-panel";

export const metadata: Metadata = {
  title: "Your primary brief",
  robots: { index: false }, // personal, Clerk-gated
};

export default function BriefPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PreferencesPanel />
      <BriefLoader />
    </main>
  );
}
```

(Wrap `PreferencesPanel` in the signed-in gate found in Step 1's precedent check.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean; `npx vitest run` → green.
Browser (dev server :3001): signed-out `/brief` shows fixture + sample note; no crashes on the auth token-exchange window (gotcha 2).

- [ ] **Step 5: Commit**

```bash
git add src/components/brief/preferences-panel.tsx src/components/brief/loader.tsx src/app/brief/page.tsx
git commit -m "feat: /brief preferences panel + status-aware streaming loader (MOO-311)"
```

---

### Task 7: End-to-end verification against real data + ship

This is the linear-build verification gate — never assert, prove. Use Playwright MCP tools; headless Clerk sign-in per handoff gotcha 5 (backend-create user → `POST /v1/sign_in_tokens` → `signIn.create({strategy:"ticket"})`; token via file under `.playwright-mcp/`; delete test users after).

- [ ] **Step 1: Move MOO-311 to In Progress in Linear** (should have happened at Task 1 — confirm).
- [ ] **Step 2: Dev-deployment E2E**: sign in, enter a real Milwaukee address (200 E Wells St, Milwaukee, WI 53202), confirm districts, star a race, pick issues, set detail level, Generate. Watch streaming render. Verify:
  - Exactly the district-correct races appear (compare against MOO-307 verification data)
  - Streaming visibly progresses (screenshot mid-stream)
  - Final brief: checklist + deadlines + races + comparisons; no endorsement language; free text only in AssistantNote styling
- [ ] **Step 3: Provenance**: pick 5 rendered claims → show their published source rows (Convex dashboard queries). Confirm the brief row has `traceId` and the trace is visible in Arize (project `badgerbrief`).
- [ ] **Step 4: Live re-render proof**: edit a `voting_info` deadline in dev, re-open the saved brief, screenshot the updated value. Revert the edit.
- [ ] **Step 5: Print**: print preview screenshot (details expanded, usable take-to-the-polls doc).
- [ ] **Step 6: Retry path proof**: force a parse failure (e.g. temporarily run `composeAttempt` with a corrupted schema, or feed `validateBriefSource` a bad source in a one-off run) OR cite the workflow logs if a natural retry occurred; show `attempt` incrementing and no broken save.
- [ ] **Step 7: Deploy**: `npx convex deploy -y` THEN `npx vercel deploy --prod --yes`. Smoke-test prod signed-out `/brief`.
- [ ] **Step 8: Evidence + Done**: attach stored OpenUI Lang for one brief + screenshots to MOO-311, write the evidence comment (what was proven, how), move to Done.
- [ ] **Step 9: Update process ledger** `.superpowers/sdd/progress.md` with any recorded-Minor debt (e.g. telemetry singleton now duplicated in helloAgent/briefAgent — note extraction candidate).
