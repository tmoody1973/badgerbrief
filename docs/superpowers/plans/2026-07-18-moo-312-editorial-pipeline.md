# MOO-312 Editorial Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research Agent (cron) extracts issue positions + quote candidates from candidate websites into drafts; Editorial QA Agent scores them; a human approves/edits/rejects in `/admin`; only gated mutations publish; monitor crons write staleness/source-change alerts. Linear MOO-312, spec §3 Research/QA + §6.

**Architecture:** All agent work runs in `"use node"` Convex actions using `ai`/`@ai-sdk/anthropic` `generateObject` with `claude-opus-4-8` (repo precedent: `convex/helloAgent.ts`) + the manual Arize LLM-span pattern. Fetching uses the Firecrawl v2 scrape API (key in Convex env, being provided by Tarik). Content-hash short-circuiting keeps LLM cost bounded. Drafts land `pending` with a `review_tasks` row; the admin dashboard (client components + admin-gated Convex functions) drives review; `convex/publish.ts` remains the only path to published tables. New `audit_log` table records every decision.

**Tech Stack:** Convex actions/mutations/queries + convex-test, `ai` ^6 + `@ai-sdk/anthropic` (installed), zod 4, Firecrawl REST v2 (no SDK — plain fetch), Next.js client components with RetroUI styling.

## Global Constraints

- **pnpm, never npm.** NO new npm dependencies — Firecrawl is called via plain `fetch`.
- Model: `claude-opus-4-8` via `anthropic("claude-opus-4-8")` — both agents. Never downgrade.
- **Agents never publish or mutate published tables.** Research/QA actions write only `*_drafts`, `review_tasks`, `source_fetch_logs`, `alerts`, `audit_log`. `convex/publish.ts` mutations stay human-only and are never exposed as tools/agent calls.
- Telemetry: copy the lazy-singleton `ensureTelemetry()` + manual LLM-span pattern from `convex/helloAgent.ts` (`@convex-dev/agent` never forwards experimental_telemetry; here we use plain `generateObject`, so wrap it in a span the same way). Never read Arize env at import time.
- Admin gating: Convex-side via `identity.metadata.role === "admin"` (same shape as `requireAdmin` in `convex/publish.ts`); UI-side the `/admin` page already redirects non-admins.
- Issue vocabulary (M1 canonical, kebab-case — the extraction schema enum): `abortion`, `economy-jobs`, `education`, `elections-democracy`, `environment-energy`, `healthcare`, `housing`, `immigration`, `public-safety`, `taxes-budget`.
- Firecrawl v2: `POST https://api.firecrawl.dev/v2/scrape`, headers `Authorization: Bearer ${process.env.FIRECRAWL_API_KEY}`, body `{"url": <url>, "formats": ["markdown"]}` → `{success, data: {markdown, metadata: {statusCode, ...}}}`. 30s timeout via `AbortSignal.timeout(30000)`. If the key is unset at verification time, report BLOCKED — do not fake fetches (fixture-based unit tests are fine).
- Tests: `npx vitest run` (currently 27 passing) must stay green at every commit; `npx tsc --noEmit` clean. Convex tests follow the `convex-test` pattern in `convex/publish.test.ts`.
- Commits end with `(MOO-312)`. Convex dev deployment `greedy-armadillo-714`; `npx convex dev --once` to push. Do NOT deploy prod inside a task.
- TS gotcha: annotate return types on same-file `ctx.runQuery`/`ctx.runMutation` calls.

---

### Task 1: Schema — `audit_log` table + audit writes in publish path

**Files:**
- Modify: `convex/schema.ts` (add one table)
- Create: `convex/audit.ts`
- Modify: `convex/publish.ts` (audit inserts inside existing mutations — surgical, no behavior change)
- Test: `convex/audit.test.ts`

**Interfaces:**
- Produces: `audit_log` table `{actor: string, action: string, refTable: string, refId: string, detail?: string, at: number}` with index `by_ref` on `["refTable", "refId"]`; helper `logAudit(ctx, entry)` exported from `convex/audit.ts` (plain function taking `MutationCtx`); `api`-visible query `audit.forRecord({refTable, refId})` (admin-gated) returning entries oldest-first.
- Consumes: `requireAdmin` pattern from `convex/publish.ts` (copy the shape; do not export/import across files — keep publish.ts self-contained).

- [ ] **Step 1: Write the failing test**

`convex/audit.test.ts` (mirror the harness setup used in `convex/publish.test.ts` — same `convexTest(schema, modules)` + `t.withIdentity({..., metadata: {role: "admin"}})` shape it uses):

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("audit log", () => {
  it("records approve and publish decisions for a quote draft", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = t.withIdentity({
      subject: "admin1",
      metadata: { role: "admin" },
    });
    const draftId = await t.run(async (ctx) => {
      return await ctx.db.insert("quote_drafts", {
        candidateSlug: "tom-tiffany",
        raceId: "WI-GOV-2026",
        speaker: "Tom Tiffany",
        text: "A quote.",
        context: "From his site.",
        date: "2026-07-01",
        sourceUrl: "https://example.com/q",
        reviewStatus: "pending",
        extractedAt: Date.now(),
      });
    });
    await asAdmin.mutation(api.publish.setDraftReviewStatus, {
      kind: "quote",
      draftId,
      status: "approved",
    });
    await asAdmin.mutation(api.publish.publishQuote, { draftId });
    const entries = await asAdmin.query(api.audit.forRecord, {
      refTable: "quote_drafts",
      refId: draftId,
    });
    expect(entries.map((e) => e.action)).toEqual(["review:approved", "publish"]);
    expect(entries[0].actor).toBe("admin1");
  });

  it("rejects the audit query for non-admins", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.audit.forRecord, { refTable: "quote_drafts", refId: "x" }),
    ).rejects.toThrow(/admin/);
  });
});
```

If `publish.test.ts` constructs identities differently (read it first), match its exact style so the role claim reaches `ctx.auth` the same way.

- [ ] **Step 2: Run to verify failure** — `npx vitest run convex/audit.test.ts` → FAIL (no audit table/module).

- [ ] **Step 3: Implement**

Schema addition (after `alerts` in `convex/schema.ts`):

```ts
  audit_log: defineTable({
    actor: v.string(), // identity.subject
    action: v.string(), // review:approved | review:rejected | publish | edit | qa:run | ...
    refTable: v.string(),
    refId: v.string(),
    detail: v.optional(v.string()),
    at: v.number(),
  }).index("by_ref", ["refTable", "refId"]),
```

`convex/audit.ts`:

```ts
import { v } from "convex/values";
import { query, MutationCtx } from "./_generated/server";

/** Append-only decision trail (MOO-312). Write via logAudit from any admin mutation. */

export async function logAudit(
  ctx: MutationCtx,
  entry: { action: string; refTable: string; refId: string; detail?: string },
) {
  const identity = await ctx.auth.getUserIdentity();
  await ctx.db.insert("audit_log", {
    actor: identity?.subject ?? "system",
    ...entry,
    at: Date.now(),
  });
}

export const forRecord = query({
  args: { refTable: v.string(), refId: v.string() },
  handler: async (ctx, { refTable, refId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const role = (identity as { metadata?: { role?: string } } | null)?.metadata?.role;
    if (role !== "admin") throw new Error("audit log requires the admin role");
    const rows = await ctx.db
      .query("audit_log")
      .withIndex("by_ref", (q) => q.eq("refTable", refTable).eq("refId", refId))
      .collect();
    return rows.sort((a, b) => a.at - b.at);
  },
});
```

In `convex/publish.ts`: import `logAudit` and add, at the end of `publishQuote` (before return, after insert): `await logAudit(ctx, { action: "publish", refTable: "quote_drafts", refId: draftId });` — same for `publishPosition` (refTable `"candidate_positions_drafts"`), and in `setDraftReviewStatus`: `await logAudit(ctx, { action: \`review:${status}\`, refTable: kind === "quote" ? "quote_drafts" : "candidate_positions_drafts", refId: draftId, detail: reviewerNote });`. No other changes to publish.ts.

- [ ] **Step 4: Run** — `npx vitest run` all green (27 + new), `npx tsc --noEmit` clean, `npx convex dev --once` pushes.

- [ ] **Step 5: Commit** — `git add convex/ && git commit -m "feat: audit_log table + decision trail on publish gates (MOO-312)"`

---

### Task 2: Research Agent — Firecrawl fetch + extraction into drafts

**Files:**
- Create: `convex/research.ts`
- Create: `convex/lib/extraction.ts` (pure: zod schemas + prompt builders — unit-testable without Convex)
- Modify: `convex/crons.ts` (daily research run)
- Test: `convex/extraction.test.ts`

**Interfaces:**
- Consumes: `candidates.socialMedia.campaign_website` (string URL, optional) — enumerate via an internal query in research.ts; `source_fetch_logs` (`by_url` index, fields `url/status/httpStatus/contentHash/error/fetchedAt`); draft tables + `review_tasks` shapes from schema; telemetry pattern from `helloAgent.ts`.
- Produces: `internal.research.run` internal action `{candidateSlugs?: string[], limit?: number}` (default limit 3 per run — cost bound); `extractionSchema` (zod) + `buildExtractionPrompt(candidateName, siteUrl, markdown)` from `convex/lib/extraction.ts`.

- [ ] **Step 1: Write the failing tests** — `convex/extraction.test.ts` (node env, pure):

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractionSchema, buildExtractionPrompt, ISSUE_SLUGS } from "./lib/extraction";

const valid = {
  positions: [
    {
      issueSlug: "healthcare",
      stance: "support",
      summary: "Supports expanding BadgerCare.",
      confidence: 0.8,
      evidenceExcerpt: "We will expand BadgerCare to every family.",
    },
  ],
  quotes: [
    {
      text: "We will expand BadgerCare to every family.",
      context: "Campaign site healthcare page",
      date: "2026-06-01",
    },
  ],
};

describe("extraction contract", () => {
  it("accepts a valid extraction", () => {
    expect(extractionSchema.parse(valid)).toBeTruthy();
  });
  it("rejects an off-vocabulary issue slug", () => {
    const bad = structuredClone(valid);
    bad.positions[0].issueSlug = "ufo-policy";
    expect(() => extractionSchema.parse(bad)).toThrow();
  });
  it("rejects confidence outside 0..1", () => {
    const bad = structuredClone(valid);
    bad.positions[0].confidence = 1.5;
    expect(() => extractionSchema.parse(bad)).toThrow();
  });
  it("prompt forbids invention and pins the vocabulary", () => {
    const p = buildExtractionPrompt("Kelda Roys", "https://x.com", "site text");
    expect(p).toContain("verbatim");
    for (const slug of ISSUE_SLUGS) expect(p).toContain(slug);
  });
});
```

- [ ] **Step 2: Verify failure**, then implement `convex/lib/extraction.ts`:

```ts
import { z } from "zod";

/** MOO-312 canonical M1 issue vocabulary — keep in sync with spec §2. */
export const ISSUE_SLUGS = [
  "abortion",
  "economy-jobs",
  "education",
  "elections-democracy",
  "environment-energy",
  "healthcare",
  "housing",
  "immigration",
  "public-safety",
  "taxes-budget",
] as const;

export const extractionSchema = z.object({
  positions: z.array(
    z.object({
      issueSlug: z.enum(ISSUE_SLUGS),
      stance: z.enum(["support", "oppose", "mixed", "evolving", "unclear"]),
      summary: z.string().min(10).describe("1-2 neutral sentences"),
      confidence: z.number().min(0).max(1),
      evidenceExcerpt: z
        .string()
        .min(10)
        .describe("verbatim excerpt from the page supporting the stance"),
    }),
  ),
  quotes: z.array(
    z.object({
      text: z.string().min(10).describe("verbatim quote from the page"),
      context: z.string(),
      date: z.string().optional().describe("ISO date if stated on the page"),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;

export function buildExtractionPrompt(
  candidateName: string,
  siteUrl: string,
  markdown: string,
): string {
  return [
    `You extract issue positions and quote candidates for a NON-PARTISAN voter guide.`,
    `Candidate: ${candidateName}. Source: ${siteUrl} (their own campaign site).`,
    `Rules:`,
    `- Only use what the page actually says. Every evidenceExcerpt and quote text must be verbatim from the page — never paraphrase into a quote, never invent.`,
    `- Positions must map to exactly one of these issue slugs: ${ISSUE_SLUGS.join(", ")}. Skip topics that fit none.`,
    `- summary is 1-2 neutral, descriptive sentences; no loaded language, no endorsement.`,
    `- stance reflects the candidate's own stated position (support/oppose/mixed/evolving/unclear).`,
    `- confidence reflects how explicitly the page states the position (explicit pledge ≈ 0.9, inference from emphasis ≈ 0.4).`,
    `- Return empty arrays when the page has nothing extractable.`,
    ``,
    `PAGE CONTENT (markdown):`,
    markdown.slice(0, 60_000),
  ].join("\n");
}
```

- [ ] **Step 3: Implement `convex/research.ts`** — `"use node"`. Structure (follow `helloAgent.ts` for telemetry; `generateObject` from `ai` with `anthropic("claude-opus-4-8")`, `schema: extractionSchema`):

```ts
"use node";
import { v } from "convex/values";
import { createHash } from "node:crypto";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { extractionSchema, buildExtractionPrompt } from "./lib/extraction";
// + the ensureTelemetry/tracer imports & pattern copied from helloAgent.ts
```

Pieces (all in this file):
1. `listResearchTargets` internalQuery: candidates with a `socialMedia.campaign_website`, returning `{slug, name, raceId, url}[]`.
2. `latestFetchHash` internalQuery `{url}`: most recent `source_fetch_logs` row with status "ok" for the url (query `by_url`, collect, max by fetchedAt) → its `contentHash` or null.
3. `recordFetch` internalMutation: insert into `source_fetch_logs`.
4. `saveExtraction` internalMutation `{candidateSlug, raceId, sourceUrl, sourceName, extraction (v.any() but validated upstream), traceId?}`: for each position — if a draft for candidate+issue exists with reviewStatus "pending" (query `by_candidate_issue`), patch it; else insert (`reviewStatus: "pending"`, `sources: [{name: sourceName, url: sourceUrl}]`, `extractedAt: Date.now()`); ensure ONE open `review_tasks` row per draft (kind "position", refTable/refId; skip if an open row for that refId exists — filter the `by_status` "open" index results). Each quote: skip if identical `text` already exists for candidate (query `by_candidate`, compare); else insert draft (`sourceUrl`, `speaker: candidateName`, `reviewStatus: "pending"`) + open review task (kind "quote"). Return counts `{positions, quotes}`.
5. `run` internalAction `{candidateSlugs: v.optional(v.array(v.string())), limit: v.optional(v.number())}`: targets = filter/slice (default limit 3). Per target: Firecrawl fetch (Global Constraints shape) → on non-ok log error fetch + continue; sha256 hash of markdown → `recordFetch`; if hash equals `latestFetchHash` result, skip LLM (log to console, continue) — **pass `force?: v.optional(v.boolean())` to bypass for verification**; else AGENT span (`research-agent.run`) wrapping `generateObject({model: anthropic("claude-opus-4-8"), schema: extractionSchema, prompt: buildExtractionPrompt(...)})` + manual LLM child span with usage (copy helloAgent lines 128-146, adapting output.value to JSON of object) → `saveExtraction` with `traceId` = the span's `span.spanContext().traceId`. Return per-candidate summary array (the action's return value is the verification evidence).

Cron addition in `convex/crons.ts`:

```ts
// 12:00 UTC = 7:00 AM Central — after finance sync, before editorial review hours.
crons.daily(
  "research agent sweep",
  { hourUTC: 12, minuteUTC: 0 },
  internal.research.run,
  {},
);
```

- [ ] **Step 4: Run** — `npx vitest run` green, `tsc --noEmit` clean, `npx convex dev --once` pushes.

- [ ] **Step 5: Commit** — `git add convex/ && git commit -m "feat: Research Agent — Firecrawl fetch, hash short-circuit, position/quote drafts (MOO-312)"`

---

### Task 3: Editorial QA Agent

**Files:**
- Create: `convex/qa.ts`
- Create: `convex/lib/qa.ts` (pure schema + prompt)
- Test: `convex/qa.test.ts` (pure parts)

**Interfaces:**
- Consumes: draft tables; `review_tasks.qaScores` (v.any()); `candidate_positions_published` `by_candidate_issue` (prior version for diff); Firecrawl fetch (re-fetch the draft's source URL for fresh source text); telemetry pattern.
- Produces: `qa.runForTask` **public action** `{reviewTaskId: v.id("review_tasks")}` (admin-gated via ctx.auth identity role, exactly like publish.ts requireAdmin but for actions) → writes `qaScores` onto the review task, appends `audit_log` entry (`action: "qa:run"` — via an internalMutation since actions can't write db directly), returns the scores object for the UI. `qaSchema` from `convex/lib/qa.ts`.

- [ ] **Step 1: Failing tests** — `convex/qa.test.ts` (node env, pure): `qaSchema` accepts `{claimSupport: 0.9, missingCitations: [], neutralRewrite: null-able optional, notes: "..."}`; rejects claimSupport > 1; `buildQaPrompt` contains the draft summary, the source text marker, and the words "unsupported" and "neutral".

- [ ] **Step 2: Implement `convex/lib/qa.ts`:**

```ts
import { z } from "zod";

export const qaSchema = z.object({
  claimSupport: z
    .number()
    .min(0)
    .max(1)
    .describe("how well the source excerpt supports every claim in the draft"),
  unsupportedClaims: z
    .array(z.string())
    .describe("claims in the draft NOT supported by the source text"),
  missingCitations: z.array(z.string()),
  neutralRewrite: z
    .string()
    .optional()
    .describe("suggested neutral rewording, only when the draft reads loaded"),
  notes: z.string(),
});
export type QaScores = z.infer<typeof qaSchema> & { diffVsPublished?: string };

export function buildQaPrompt(args: {
  kind: "position" | "quote";
  draftJson: string;
  sourceText: string;
  priorPublishedJson?: string;
}): string {
  return [
    `You are the Editorial QA agent for a NON-PARTISAN voter guide. Score this ${args.kind} draft against its source.`,
    `- claimSupport: 1.0 = every claim directly supported by the source text; 0 = unsupported.`,
    `- List every unsupported claim verbatim. Flag missing citations.`,
    `- If the wording is loaded/partisan, provide neutralRewrite; otherwise omit it.`,
    args.priorPublishedJson
      ? `- A prior published version exists; note substantive changes in notes.\nPRIOR PUBLISHED:\n${args.priorPublishedJson}`
      : ``,
    `DRAFT:\n${args.draftJson}`,
    `SOURCE TEXT:\n${args.sourceText.slice(0, 60_000)}`,
  ].join("\n");
}
```

- [ ] **Step 3: Implement `convex/qa.ts`** — `"use node"`. `runForTask` public action: admin check from `ctx.auth.getUserIdentity()` (throw unless `metadata.role === "admin"`); load task via internalQuery (`getTask`), load the draft (internalQuery by kind+refId), source URL = position draft `sources[0].url` / quote draft `sourceUrl`; Firecrawl fetch (on failure: still run QA with `sourceText: "(source fetch failed)"` and note it); prior published for positions via `by_candidate_issue` internalQuery → `priorPublishedJson`; AGENT+LLM spans around `generateObject({schema: qaSchema, ...})`; compute `diffVsPublished` = prior ? \`prior summary: ${prior.summary}\` : undefined (surface-level — the LLM notes cover substance); internalMutation `saveScores` patches `review_tasks.qaScores` with the full object + `scoredAt: Date.now()` and calls `logAudit` (import from `./audit`) with action `qa:run`. Return scores.

- [ ] **Step 4: Run suite + tsc + convex push.** Green.

- [ ] **Step 5: Commit** — `git add convex/ && git commit -m "feat: Editorial QA agent — claim-support scoring, citation + neutrality checks (MOO-312)"`

---

### Task 4: Admin review dashboard

**Files:**
- Create: `convex/adminQueue.ts` (queries/mutations for the dashboard)
- Create: `src/components/admin/review-queue.tsx` (client)
- Modify: `src/app/admin/page.tsx` (mount the queue; keep the existing role redirect)
- Test: `convex/adminQueue.test.ts`

**Interfaces:**
- Consumes: `review_tasks` `by_status`; both draft tables; `api.publish.setDraftReviewStatus` + `api.publish.publishQuote/publishPosition` (existing, called from the UI); `api.qa.runForTask`; `api.audit.forRecord`; `alerts` `by_resolved`.
- Produces: `adminQueue.list` query (admin): open review tasks joined with their draft docs → `[{task, draft, kind}]`; `adminQueue.editPositionDraft` mutation (admin) `{draftId, summary?, stance?, issueSlug?}` — patches the draft, resets `reviewStatus` to "pending", writes audit `action: "edit"`; `adminQueue.editQuoteDraft` similarly for `{text?, context?, date?, outlet?}`; `adminQueue.alerts` query (admin) + `adminQueue.resolveAlert` mutation (admin, audit-logged).

- [ ] **Step 1: Failing tests** — `convex/adminQueue.test.ts` (convex-test): (a) `list` returns an inserted open position task joined with its draft and rejects non-admin; (b) `editPositionDraft` patches summary, resets an "approved" draft back to "pending", and writes an `edit` audit entry; (c) `resolveAlert` flips `resolved` and audit-logs.

- [ ] **Step 2: Implement `convex/adminQueue.ts`.** All handlers start with the admin check (same inline shape as audit.ts). `list`: collect `review_tasks` `by_status` "open", for each fetch the draft via `ctx.db.get` (cast by kind), skip tasks whose draft is gone; return `{task, draft, kind}[]` sorted newest-first. Edits: patch only provided fields, set `reviewStatus: "pending"`, `logAudit` with detail = JSON of changed keys. Alerts: `by_resolved` false, sorted newest; `resolveAlert` patches `resolved: true` + audit.

- [ ] **Step 3: Implement the UI.** `src/components/admin/review-queue.tsx` — `"use client"`, RetroUI style (border-2 border-border bg-card shadow-brutal, mono uppercase labels — mirror `src/components/guide/` idioms):
  - `useQuery(api.adminQueue.list, {})` → task list (left column on desktop, stacked mobile): kind badge, candidate slug, extractedAt.
  - Selecting a task shows the detail panel: **draft fields | source excerpt | QA scores side-by-side** — draft summary/stance/quote text (editable inputs), the draft's `evidence`/source link, and `task.qaScores` rendered as labeled rows (claimSupport as a percentage chip — bg-warning below 0.7, unsupportedClaims list, neutralRewrite callout when present, diff note).
  - Buttons: **Run QA** (`useAction(api.qa.runForTask)`), **Approve** / **Reject** (`useMutation(api.publish.setDraftReviewStatus)` then, on approve of a valid draft, **Publish** button appears → `api.publish.publishQuote/-Position`), **Save edits** (edit mutation, then automatically re-run QA via the action — acceptance: "edits re-run QA").
  - Audit trail: `useQuery(api.audit.forRecord, {refTable, refId})` under the detail panel, rendered as a timestamped list.
  - Alerts section below the queue: `api.adminQueue.alerts` rows with severity chips + resolve buttons.
  - All mutation/action calls wrapped in try/catch with a visible error line (publish-gate errors must surface, not vanish).
  `src/app/admin/page.tsx`: keep the existing role redirect; replace the placeholder Card body with `<ReviewQueue />`.

- [ ] **Step 4: Run suite + tsc + convex push; `pnpm dev` and confirm `/admin` compiles (role redirect means visual pass happens in Task 6).**

- [ ] **Step 5: Commit** — `git add convex/ src/ && git commit -m "feat: admin review dashboard — queue, QA panel, gated publish, audit trail, alerts (MOO-312)"`

---

### Task 5: Monitor crons — staleness + source change

**Files:**
- Create: `convex/monitor.ts`
- Modify: `convex/crons.ts`
- Test: `convex/monitor.test.ts`

**Interfaces:**
- Consumes: `candidate_positions_published.lastReviewedAt`; `source_fetch_logs` (`by_url`); `alerts` shape; Firecrawl fetch + sha256 helpers (duplicate the small fetch helper locally or export it from research.ts — prefer exporting `fetchSite(url)` from research.ts and importing).
- Produces: `internal.monitor.stalenessSweep` internalMutation `{maxAgeDays: v.optional(v.number())}` (default 14): published positions with `lastReviewedAt` older than cutoff → insert `alerts` `{kind: "staleness", severity: "warning", refTable: "candidate_positions_published", refId, message, resolved: false, createdAt}` — skipping refIds that already have an unresolved staleness alert; `internal.monitor.sourceChangeSweep` internalAction `{limit?: number}`: distinct candidate-site URLs from research targets, fetch, hash, compare vs `latestFetchHash`; on difference insert alert `{kind: "source_change", severity: "info", message: "content hash changed for <url>"}` and record the new fetch.

- [ ] **Step 1: Failing test** — `convex/monitor.test.ts` (convex-test, mutation only — the action needs network): insert a published position with `lastReviewedAt: Date.now() - 30 days`, run `internal.monitor.stalenessSweep` via `t.mutation(internal.monitor.stalenessSweep, {})` (convex-test can invoke internal functions), expect one unresolved `staleness` alert; run again, still exactly one (dedup).

- [ ] **Step 2: Implement + crons:**

```ts
// crons.ts additions
crons.daily("staleness sweep", { hourUTC: 12, minuteUTC: 30 }, internal.monitor.stalenessSweep, {});
crons.daily("source change sweep", { hourUTC: 12, minuteUTC: 15 }, internal.monitor.sourceChangeSweep, {});
```

- [ ] **Step 3: Run suite + tsc + convex push.** Green.

- [ ] **Step 4: Commit** — `git add convex/ && git commit -m "feat: monitor crons — staleness sweep + source-change alerts (MOO-312)"`

---

### Task 6: Verify against reality + Linear evidence (controller-led)

No new code except fixes discovered. Prereq: `FIRECRAWL_API_KEY` set in dev deployment (`npx convex env get FIRECRAWL_API_KEY` — if unset, BLOCKED on Tarik).

- [ ] **Step 1:** `npx vitest run` + `npx tsc --noEmit` — all green.
- [ ] **Step 2 (Research vs reality):** `npx convex run research:run '{"candidateSlugs": ["kelda-roys"], "force": true}'` (or another candidate with a live site from `listResearchTargets`) — capture output showing a real drafted position with stance/summary/confidence/evidenceExcerpt + a `source_fetch_logs` row with contentHash (`npx convex data source_fetch_logs`). Screenshot/paste into evidence.
- [ ] **Step 3 (QA flags a plant):** via `npx convex run` or a tiny test insert, plant a position draft whose summary contains a claim absent from the source ("has pledged to eliminate all state taxes"); run QA on its task as admin (through the dashboard or a direct action call with admin identity via the dashboard UI); show `claimSupport` low + the planted claim in `unsupportedClaims`.
- [ ] **Step 4 (approve → public / reject → never public):** in `/admin` (admin Clerk user — Tarik's own account or set metadata.role=admin on a test user via Clerk API): approve+publish one real draft → screenshot it rendered on the public candidate page with source link; reject another → confirm `candidate_positions_published` has no row for it.
- [ ] **Step 5 (audit trail):** dashboard audit list (or `audit.forRecord`) for the published record showing qa:run → review:approved → publish sequence. Screenshot.
- [ ] **Step 6 (source change alert):** `npx convex run` an internalMutation inserting a fake older fetch log for a target URL (different hash), then `monitor:sourceChangeSweep` with limit 1 → alert row appears (`npx convex data alerts`).
- [ ] **Step 7:** Commit evidence to `docs/evidence/moo-312/`, deploy (`npx convex deploy -y` then `npx vercel deploy --prod --yes`), set FIRECRAWL_API_KEY in prod env too, Linear → Done + evidence comment, check off acceptance boxes.
