# Coverage & Source Transparency (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship transparency-first election-coverage aggregation — an "In the News" module on race/candidate pages plus a `/news` hub — where every outlet carries a source-transparency card (ownership/funding/type), reusing the existing scout discovery and the sponsor-intelligence enrichment pattern.

**Architecture:** One pipeline, two reads. `scout` discovers coverage into an extended `article_sources` table; a deterministic relevance gate sets `hubStatus:"auto"` for the public `/news` hub (attributed links only, no BadgerBrief claims); the existing human `status:"approved"` gate controls per-entity "In the News". A new `outlets` table holds transparency data, populated by manual curation plus optional auto-enrichment (Firecrawl/Perplexity → review), exactly like `sponsors`.

**Tech Stack:** Convex (queries/mutations/actions, `convex-test` + vitest), Next.js App Router (server components, `fetchQuery` via `@/lib/data`), TypeScript.

## Global Constraints

- **Transparency-only v1:** render outlet ownership/funding/type only. NO bias/factuality badge renders in v1 and NO rating provider is wired. The `outlets.thirdPartyRatings` field EXISTS (data-ready for v2) but is never displayed.
- **Never self-rate / never assert:** the hub and "In the News" surface *attributed links* (outlet + headline + timestamp) — BadgerBrief writes NO factual claim or summary about any article.
- **Tiered gating invariant:** an article shows on `/news` iff `hubStatus === "auto"`; shows in an entity "In the News" iff `status === "approved"`. Neither flag implies the other.
- **Unrated ≠ neutral:** an outlet with no transparency data shows "outlet profile pending", never a fabricated label.
- **Brand:** no red/blue as a coverage palette; color never the sole signal (always a text label); copy describes *coverage*, not *candidates*; never fabricate a count or empty-state number.
- **Immutability:** new objects, never mutate (repo rule). Files focused, <800 lines.
- **Test command:** `npx vitest run <file>` (the repo has NO `pnpm test`). Convex logic tested with `convex-test`; pure functions with fixtures (mirror `convex/lib/openfecEnrich.test.ts`). No React Testing Library — components are presentational, verified by `npx tsc --noEmit`.
- **Key normalization** mirrors `normalizeSponsorKey` (`convex/lib/sponsors.ts`): lowercase → `[^a-z0-9]+` to space → collapse spaces → trim.

---

### Task 1: `normalizeOutletKey` + outlet type taxonomy

**Files:**
- Create: `convex/lib/outlets.ts`
- Test: `convex/lib/outlets.test.ts`

**Interfaces:**
- Produces: `normalizeOutletKey(name: string): string`; `OUTLET_TYPES` (readonly tuple); `OutletType` type.

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/outlets.test.ts
import { describe, expect, test } from "vitest";
import { normalizeOutletKey, OUTLET_TYPES } from "./outlets";

describe("normalizeOutletKey", () => {
  test("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeOutletKey("Milwaukee Journal Sentinel")).toBe("milwaukee journal sentinel");
    expect(normalizeOutletKey("Urban Milwaukee!")).toBe("urban milwaukee");
    expect(normalizeOutletKey("WPR.org")).toBe("wpr org");
  });
  test("same outlet, punctuation variants collapse to one key", () => {
    expect(normalizeOutletKey("Wisconsin Watch")).toBe(normalizeOutletKey("Wisconsin  Watch."));
  });
  test("taxonomy includes the eight v1 types", () => {
    expect(OUTLET_TYPES).toContain("nonprofit");
    expect(OUTLET_TYPES).toContain("public_media");
    expect(OUTLET_TYPES.length).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/outlets.test.ts`
Expected: FAIL ("Cannot find module './outlets'").

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/outlets.ts
export const OUTLET_TYPES = [
  "nonprofit", "public_media", "corporate_daily", "wire",
  "trade", "tv", "national", "other",
] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

/** Collapse outlet name/domain variants to one key. Mirrors
 * normalizeSponsorKey so the two enrichment pipelines behave identically. */
export function normalizeOutletKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/outlets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/outlets.ts convex/lib/outlets.test.ts
git commit -m "feat(coverage): normalizeOutletKey + outlet type taxonomy"
```

---

### Task 2: Schema — extend `article_sources`, add `outlets`

**Files:**
- Modify: `convex/schema.ts` (the `article_sources` table ~L392-412; add `outlets` table after it)

**Interfaces:**
- Produces: `article_sources` fields `outletKey?`, `hubStatus?`, `relevanceScore?`, `relevanceReason?`, with `candidateSlug`/`raceId` now optional; indexes `by_hubStatus`, `by_race`. New table `outlets` with index `by_key`.

- [ ] **Step 1: Edit `article_sources`** — make `candidateSlug` and `raceId` optional and add the new fields + indexes:

```ts
  article_sources: defineTable({
    candidateSlug: v.optional(v.string()), // optional: race-level / statewide coverage
    raceId: v.optional(v.string()),
    url: v.string(),
    outlet: v.string(),
    outletKey: v.optional(v.string()),     // normalizeOutletKey(outlet) → outlets.key
    sourceKind: v.optional(
      v.union(v.literal("article"), v.literal("campaign_site")),
    ),
    headline: v.string(),
    publishedAt: v.optional(v.string()),
    whyRelevant: v.string(),
    relevanceScore: v.optional(v.number()),   // from the hub relevance gate
    relevanceReason: v.optional(v.string()),
    status: v.union(v.literal("proposed"), v.literal("approved"), v.literal("rejected")),
    hubStatus: v.optional(v.union(v.literal("auto"), v.literal("hidden"))), // /news visibility
    proposedAt: v.number(),
    decidedAt: v.optional(v.number()),
    traceId: v.optional(v.string()),
  })
    .index("by_url", ["url"])
    .index("by_status", ["status"])
    .index("by_candidate", ["candidateSlug"])
    .index("by_race", ["raceId"])
    .index("by_hubStatus", ["hubStatus"]),
```

- [ ] **Step 2: Add the `outlets` table** (immediately after `article_sources`):

```ts
  outlets: defineTable({
    key: v.string(),
    displayName: v.string(),
    domain: v.optional(v.string()),
    type: v.union(
      v.literal("nonprofit"), v.literal("public_media"), v.literal("corporate_daily"),
      v.literal("wire"), v.literal("trade"), v.literal("tv"),
      v.literal("national"), v.literal("other"),
    ),
    ownership: v.optional(v.string()),
    fundingNote: v.optional(v.string()),
    ownershipSourceUrl: v.optional(v.string()),
    // Data-ready for v2; NEVER rendered in v1 (Global Constraints).
    thirdPartyRatings: v.optional(v.array(v.object({
      provider: v.union(
        v.literal("AllSides"), v.literal("AdFontes"),
        v.literal("MBFC"), v.literal("NewsGuard"),
      ),
      biasBand: v.optional(v.string()),
      factuality: v.optional(v.string()),
      url: v.string(),
      fetchedAt: v.number(),
    }))),
    reviewStatus: v.union(v.literal("draft"), v.literal("approved")),
    enrichedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
```

- [ ] **Step 3: Verify codegen + typecheck**

Run: `npx convex codegen && npx tsc --noEmit`
Expected: no errors. (Existing `article_sources` writers set `candidateSlug`/`raceId`, which stay valid now that they're optional.)

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(coverage): extend article_sources + add outlets table"
```

---

### Task 3: `outlets` writer + reads (dedup by key)

**Files:**
- Create: `convex/outlets.ts`
- Test: `convex/outlets.test.ts`

**Interfaces:**
- Consumes: `normalizeOutletKey` (Task 1); `outlets` table (Task 2).
- Produces: `upsertOutlet(internalMutation, {key,displayName,type,ownership?,fundingNote?,ownershipSourceUrl?,thirdPartyRatings?})`; `outletByKey(internalQuery,{key})`; `publicOutlet(query,{key}) → approved outlet | null`; `saveOutlet(mutation,admin)`; `approveOutlet(mutation,admin,{key})`; `listDraftOutlets(query,admin)`.

- [ ] **Step 1: Write the failing test** (dedup + approval gate):

```ts
// convex/outlets.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const t = () => convexTest(schema, modules);
const admin = { metadata: { role: "admin" } };

test("upsertOutlet dedups by key; publicOutlet hides drafts", async () => {
  const c = t();
  await c.mutation(internal.outlets.upsertOutlet, {
    key: "urban milwaukee", displayName: "Urban Milwaukee", type: "nonprofit",
  });
  await c.mutation(internal.outlets.upsertOutlet, {
    key: "urban milwaukee", displayName: "Urban Milwaukee", type: "nonprofit",
    ownership: "Independent nonprofit",
  });
  // still one row, latest fields win
  const row = await c.query(internal.outlets.outletByKey, { key: "urban milwaukee" });
  expect(row?.ownership).toBe("Independent nonprofit");
  // draft not public yet
  expect(await c.query(api.outlets.publicOutlet, { key: "urban milwaukee" })).toBeNull();
  // approve → public
  await c.withIdentity(admin).mutation(api.outlets.approveOutlet, { key: "urban milwaukee" });
  expect((await c.query(api.outlets.publicOutlet, { key: "urban milwaukee" }))?.displayName).toBe("Urban Milwaukee");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/outlets.test.ts`
Expected: FAIL ("internal.outlets ... undefined").

- [ ] **Step 3: Write the implementation**

```ts
// convex/outlets.ts
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const id = await ctx.auth.getUserIdentity();
  if ((id?.metadata as { role?: string } | undefined)?.role !== "admin") {
    throw new Error("admin only");
  }
}

const outletFields = {
  displayName: v.string(),
  type: v.union(
    v.literal("nonprofit"), v.literal("public_media"), v.literal("corporate_daily"),
    v.literal("wire"), v.literal("trade"), v.literal("tv"), v.literal("national"), v.literal("other"),
  ),
  ownership: v.optional(v.string()),
  fundingNote: v.optional(v.string()),
  ownershipSourceUrl: v.optional(v.string()),
  domain: v.optional(v.string()),
};

export const upsertOutlet = internalMutation({
  args: { key: v.string(), ...outletFields,
    thirdPartyRatings: v.optional(v.array(v.object({
      provider: v.union(v.literal("AllSides"), v.literal("AdFontes"), v.literal("MBFC"), v.literal("NewsGuard")),
      biasBand: v.optional(v.string()), factuality: v.optional(v.string()), url: v.string(), fetchedAt: v.number(),
    }))) },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const doc = {
      key: a.key, displayName: a.displayName, type: a.type,
      ownership: a.ownership ?? existing?.ownership,
      fundingNote: a.fundingNote ?? existing?.fundingNote,
      ownershipSourceUrl: a.ownershipSourceUrl ?? existing?.ownershipSourceUrl,
      domain: a.domain ?? existing?.domain,
      thirdPartyRatings: a.thirdPartyRatings ?? existing?.thirdPartyRatings,
      reviewStatus: existing?.reviewStatus ?? ("draft" as const),
      enrichedAt: Date.now(), updatedAt: Date.now(),
    };
    if (existing) { await ctx.db.patch(existing._id, doc); return existing._id; }
    return ctx.db.insert("outlets", doc);
  },
});

export const outletByKey = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) => ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

export const publicOutlet = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const o = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return o && o.reviewStatus === "approved" ? o : null;
  },
});

export const saveOutlet = mutation({
  args: { key: v.string(), ...outletFields },
  handler: async (ctx, { key, ...fields }) => {
    await requireAdmin(ctx);
    const o = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!o) { await ctx.db.insert("outlets", { key, ...fields, reviewStatus: "draft", updatedAt: Date.now() }); return; }
    await ctx.db.patch(o._id, { ...fields, updatedAt: Date.now() });
  },
});

export const approveOutlet = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAdmin(ctx);
    const o = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!o) throw new Error("no outlet to approve");
    await ctx.db.patch(o._id, { reviewStatus: "approved", updatedAt: Date.now() });
  },
});

export const listDraftOutlets = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return (await ctx.db.query("outlets").collect()).filter((o) => o.reviewStatus === "draft");
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/outlets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/outlets.ts convex/outlets.test.ts
git commit -m "feat(coverage): outlets writer + admin curation + public read"
```

---

### Task 4: Relevance gate (deterministic v1)

**Files:**
- Modify: `convex/lib/outlets.ts` (add `scoreRelevance`)
- Test: `convex/lib/outlets.test.ts` (extend)

**Interfaces:**
- Produces: `scoreRelevance(text: string, ctx: { candidateNames: string[]; raceKeywords: string[] }): { score: number; reason: string }`. Score 0..1; ≥ `HUB_RELEVANCE_MIN` (0.5) means hub-eligible.

- [ ] **Step 1: Write the failing test**

```ts
// append to convex/lib/outlets.test.ts
import { scoreRelevance, HUB_RELEVANCE_MIN } from "./outlets";

describe("scoreRelevance", () => {
  const ctx = { candidateNames: ["Francesca Hong", "Tom Tiffany"], raceKeywords: ["governor", "u.s. senate"] };
  test("names a tracked candidate → hub-eligible", () => {
    const r = scoreRelevance("Francesca Hong unveils housing plan", ctx);
    expect(r.score).toBeGreaterThanOrEqual(HUB_RELEVANCE_MIN);
    expect(r.reason).toContain("Francesca Hong");
  });
  test("off-topic (no candidate, no race, no WI-election term) → below floor", () => {
    expect(scoreRelevance("Packers sign new quarterback", ctx).score).toBeLessThan(HUB_RELEVANCE_MIN);
  });
  test("WI-election term without a candidate still scores low but non-zero", () => {
    const r = scoreRelevance("Wisconsin governor race heats up", ctx);
    expect(r.score).toBeGreaterThanOrEqual(HUB_RELEVANCE_MIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/outlets.test.ts`
Expected: FAIL ("scoreRelevance is not a function").

- [ ] **Step 3: Write the implementation** (append to `convex/lib/outlets.ts`):

```ts
export const HUB_RELEVANCE_MIN = 0.5;
const WI_ELECTION_TERMS = ["wisconsin", "primary", "ballot", "election", "candidate", "assembly", "u.s. senate", "governor"];

/** Deterministic v1 gate: hub-eligible when the text names a tracked candidate,
 * or matches a race keyword together with a WI-election term. No LLM — cheap,
 * testable, honest. (An LLM classifier can replace this later without changing
 * callers.) */
export function scoreRelevance(
  text: string,
  ctx: { candidateNames: string[]; raceKeywords: string[] },
): { score: number; reason: string } {
  const t = text.toLowerCase();
  const named = ctx.candidateNames.find((n) => t.includes(n.toLowerCase()));
  if (named) return { score: 1, reason: `names candidate ${named}` };
  const race = ctx.raceKeywords.find((k) => t.includes(k.toLowerCase()));
  const wi = WI_ELECTION_TERMS.some((w) => t.includes(w));
  if (race && wi) return { score: 0.7, reason: `race keyword "${race}" + WI-election term` };
  if (wi) return { score: 0.3, reason: "WI-election term only" };
  return { score: 0, reason: "no candidate/race/election match" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/outlets.test.ts`
Expected: PASS (all outlet tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/outlets.ts convex/lib/outlets.test.ts
git commit -m "feat(coverage): deterministic v1 relevance gate"
```

---

### Task 5: Coverage reads + gating invariant

**Files:**
- Create: `convex/coverage.ts`
- Test: `convex/coverage.test.ts`

**Interfaces:**
- Consumes: `article_sources` (Task 2), `publicOutlet` shape.
- Produces: `hubArticles(query,{limit?,raceId?}) → rows where hubStatus==="auto"` (each joined with its approved outlet or null); `inTheNewsForCandidate(query,{candidateSlug}) → status==="approved"`; `inTheNewsForRace(query,{raceId}) → status==="approved"`; `setHubStatus(mutation,admin,{articleId,hubStatus})`.

- [ ] **Step 1: Write the failing test** (encodes the gating invariant):

```ts
// convex/coverage.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const t = () => convexTest(schema, modules);

async function seedArticle(c: ReturnType<typeof t>, over: Record<string, unknown>) {
  return c.run(async (ctx: any) => ctx.db.insert("article_sources", {
    url: "https://x/" + Math.random(), outlet: "Urban Milwaukee", outletKey: "urban milwaukee",
    headline: "H", whyRelevant: "r", status: "proposed", proposedAt: Date.now(), ...over,
  }));
}

test("hub shows only hubStatus:auto; entity shows only approved", async () => {
  const c = t();
  await seedArticle(c, { hubStatus: "auto", status: "proposed", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });
  await seedArticle(c, { hubStatus: "hidden", status: "approved", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });

  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub.map((r) => r.article.hubStatus)).toEqual(["auto"]); // hidden excluded

  const entity = await c.query(api.coverage.inTheNewsForCandidate, { candidateSlug: "francesca-hong" });
  expect(entity.length).toBe(1); // only the approved one, though it's hub-hidden
  expect(entity[0].status).toBe("approved");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/coverage.test.ts`
Expected: FAIL ("api.coverage undefined").

- [ ] **Step 3: Write the implementation**

```ts
// convex/coverage.ts
import { v } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const id = await ctx.auth.getUserIdentity();
  if ((id?.metadata as { role?: string } | undefined)?.role !== "admin") throw new Error("admin only");
}

async function withOutlet(ctx: QueryCtx, article: any) {
  const outlet = article.outletKey
    ? await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", article.outletKey)).unique()
    : null;
  return { article, status: article.status, outlet: outlet && outlet.reviewStatus === "approved" ? outlet : null };
}

export const hubArticles = query({
  args: { limit: v.optional(v.number()), raceId: v.optional(v.string()) },
  handler: async (ctx, { limit, raceId }) => {
    const rows = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    const filtered = (raceId ? rows.filter((r) => r.raceId === raceId) : rows)
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, limit ?? 60);
    return Promise.all(filtered.map((a) => withOutlet(ctx, a)));
  },
});

export const inTheNewsForCandidate = query({
  args: { candidateSlug: v.string() },
  handler: async (ctx, { candidateSlug }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug)).collect())
      .filter((r) => r.status === "approved" && r.sourceKind !== "campaign_site");
    return Promise.all(rows.map((a) => withOutlet(ctx, a)));
  },
});

export const inTheNewsForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_race", (q) => q.eq("raceId", raceId)).collect())
      .filter((r) => r.status === "approved" && r.sourceKind !== "campaign_site");
    return Promise.all(rows.map((a) => withOutlet(ctx, a)));
  },
});

export const setHubStatus = mutation({
  args: { articleId: v.id("article_sources"), hubStatus: v.union(v.literal("auto"), v.literal("hidden")) },
  handler: async (ctx, { articleId, hubStatus }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(articleId, { hubStatus });
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/coverage.ts convex/coverage.test.ts
git commit -m "feat(coverage): hub + in-the-news reads with tiered gating invariant"
```

---

### Task 6: Outlet transparency enrichment (parser tested, action thin)

**Files:**
- Modify: `convex/lib/outlets.ts` (add `parseOutletTransparency`)
- Create: `convex/lib/fixtures/outlet-firecrawl.json` (sample enrichment payload)
- Test: `convex/lib/outlets.test.ts` (extend)
- Create: `convex/outletEnrich.ts` (internalAction + admin action, mirrors `sponsorEnrich`)

**Interfaces:**
- Consumes: `normalizeOutletKey`, `OUTLET_TYPES`, `internal.outlets.upsertOutlet`.
- Produces: `parseOutletTransparency(raw): { type: OutletType; ownership?; fundingNote?; ownershipSourceUrl? }`; `enrichOutletCore(internalAction,{name,url?})`; `enrichOutlet(action,admin,{name,url?})`.

- [ ] **Step 1: Write the failing parser test**

```ts
// append to convex/lib/outlets.test.ts
import { parseOutletTransparency } from "./outlets";
import outletRaw from "./fixtures/outlet-firecrawl.json";

test("parseOutletTransparency maps a payload to transparency fields", () => {
  const p = parseOutletTransparency(outletRaw);
  expect(p.type).toBe("nonprofit");
  expect(p.ownership).toMatch(/nonprofit/i);
  expect(p.ownershipSourceUrl).toMatch(/^https?:\/\//);
});
test("parseOutletTransparency falls back to 'other' on unknown type", () => {
  expect(parseOutletTransparency({ type: "??", ownership: "x", sourceUrl: "https://a" }).type).toBe("other");
});
```

Fixture:
```json
// convex/lib/fixtures/outlet-firecrawl.json
{ "type": "nonprofit", "ownership": "Independent nonprofit newsroom", "funding": "reader donations + grants", "sourceUrl": "https://wisconsinwatch.org/about/" }
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run convex/lib/outlets.test.ts`
Expected: FAIL ("parseOutletTransparency is not a function").

- [ ] **Step 3: Implement the parser** (append to `convex/lib/outlets.ts`):

```ts
export function parseOutletTransparency(raw: unknown): {
  type: OutletType; ownership?: string; fundingNote?: string; ownershipSourceUrl?: string;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawType = String(r.type ?? "").toLowerCase();
  const type = (OUTLET_TYPES as readonly string[]).includes(rawType) ? (rawType as OutletType) : "other";
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
  return {
    type,
    ownership: str(r.ownership),
    fundingNote: str(r.funding) ?? str(r.fundingNote),
    ownershipSourceUrl: str(r.sourceUrl) ?? str(r.ownershipSourceUrl),
  };
}
```

- [ ] **Step 4: Run parser test → PASS**

Run: `npx vitest run convex/lib/outlets.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the enrichment action** (network layer, mirrors `convex/sponsorEnrich.ts:enrichSponsorCore`; no network in tests):

```ts
// convex/outletEnrich.ts
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeOutletKey, parseOutletTransparency } from "./lib/outlets";

/** Draft an outlet's transparency from public sources (Firecrawl/Perplexity),
 * then upsert as a draft for human review. Same shape as sponsor enrichment. */
export const enrichOutletCore = internalAction({
  args: { name: v.string(), url: v.optional(v.string()) },
  handler: async (ctx, { name, url }) => {
    const key = normalizeOutletKey(name);
    // fetchOutletFacts is the thin network call (Firecrawl/Perplexity). Returns
    // a raw payload; the tested parser turns it into transparency fields.
    const raw = await fetchOutletFacts(name, url); // implement per firecrawlSponsor.ts
    const parsed = parseOutletTransparency(raw);
    await ctx.runMutation(internal.outlets.upsertOutlet, { key, displayName: name, ...parsed });
    return { key };
  },
});

export const enrichOutlet = action({
  args: { name: v.string(), url: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // admin gate is enforced by the mutation it ultimately calls; keep parity
    // with sponsorEnrich.enrichSponsor (public admin entry).
    return ctx.runAction(internal.outletEnrich.enrichOutletCore, args);
  },
});

// Thin wrapper around the existing Firecrawl/Perplexity helpers — model on
// convex/lib/firecrawlSponsor.ts. Returns { type?, ownership?, funding?, sourceUrl? }.
async function fetchOutletFacts(name: string, url?: string): Promise<unknown> {
  // Reuse the sponsor narrative/Firecrawl helper; prompt it for outlet
  // ownership/funding/type + a source URL. Network only — untested by design.
  const { fetchOutletFacts: impl } = await import("./lib/firecrawlOutlet");
  return impl(name, url);
}
```

Create `convex/lib/firecrawlOutlet.ts` by copying the request/allowlist shape of `convex/lib/firecrawlSponsor.ts`, swapping the prompt to ask for outlet ownership, funding model, type, and a source URL. (No test — network layer, exactly like `firecrawlSponsor.ts`.)

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add convex/lib/outlets.ts convex/lib/outlets.test.ts convex/lib/fixtures/outlet-firecrawl.json convex/outletEnrich.ts convex/lib/firecrawlOutlet.ts
git commit -m "feat(coverage): outlet transparency enrichment (parser tested)"
```

---

### Task 7: Broaden `scout` to write coverage + gate the hub

**Files:**
- Modify: `convex/scout.ts` (the `run` internalAction, ~L121) — after it writes an `article_sources` row, set `outletKey`, run `scoreRelevance`, and set `hubStatus`.
- Test: `convex/scoutQueries.test.ts` (add a gate test) OR a new `convex/scout.test.ts` for the pure wiring.

**Interfaces:**
- Consumes: `normalizeOutletKey`, `scoreRelevance`, `HUB_RELEVANCE_MIN`.
- Produces: article rows now carry `outletKey`, `relevanceScore`, `relevanceReason`, and `hubStatus:"auto"` when `score >= HUB_RELEVANCE_MIN`.

- [ ] **Step 1: Write a failing test** for the enrichment-of-a-row helper. Extract the per-row decoration into a pure exported helper so it's testable without the network:

```ts
// convex/scout.test.ts
import { describe, expect, test } from "vitest";
import { decorateCoverageRow } from "./scout";

describe("decorateCoverageRow", () => {
  const ctx = { candidateNames: ["Francesca Hong"], raceKeywords: ["governor"] };
  test("candidate-named article becomes hub:auto with outletKey", () => {
    const d = decorateCoverageRow({ outlet: "Urban Milwaukee", headline: "Francesca Hong on housing" }, ctx);
    expect(d.outletKey).toBe("urban milwaukee");
    expect(d.hubStatus).toBe("auto");
    expect(d.relevanceScore).toBeGreaterThanOrEqual(0.5);
  });
  test("off-topic article is not hub:auto", () => {
    const d = decorateCoverageRow({ outlet: "ESPN", headline: "Packers trade news" }, ctx);
    expect(d.hubStatus).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → fails** (`decorateCoverageRow` not exported).

Run: `npx vitest run convex/scout.test.ts` → FAIL.

- [ ] **Step 3: Add the exported helper in `convex/scout.ts`** and call it where a row is built:

```ts
import { normalizeOutletKey, scoreRelevance, HUB_RELEVANCE_MIN } from "./lib/outlets";

export function decorateCoverageRow(
  row: { outlet: string; headline: string },
  ctx: { candidateNames: string[]; raceKeywords: string[] },
): { outletKey: string; relevanceScore: number; relevanceReason: string; hubStatus?: "auto" } {
  const { score, reason } = scoreRelevance(row.headline, ctx);
  return {
    outletKey: normalizeOutletKey(row.outlet),
    relevanceScore: score,
    relevanceReason: reason,
    ...(score >= HUB_RELEVANCE_MIN ? { hubStatus: "auto" as const } : {}),
  };
}
```

In `run`, where the discovered article is inserted into `article_sources`, spread `...decorateCoverageRow({ outlet, headline }, { candidateNames, raceKeywords })` into the insert. Load `candidateNames`/`raceKeywords` from the `candidates`/`races` tables at the top of the run (they're already queried for rotation).

- [ ] **Step 4: Run → PASS** and typecheck.

Run: `npx vitest run convex/scout.test.ts && npx tsc --noEmit` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add convex/scout.ts convex/scout.test.ts
git commit -m "feat(coverage): scout tags coverage rows + auto-gates the hub"
```

---

### Task 8: `SourceTransparencyCard` component

**Files:**
- Create: `src/components/guide/source-transparency-card.tsx`

**Interfaces:**
- Consumes: an approved `outlets` doc (or null) + the outlet display name.
- Produces: `<SourceTransparencyCard outlet={Doc<"outlets"> | null} outletName={string} />`.

- [ ] **Step 1: Implement** (presentational; transparency-only — NO bias badge per Global Constraints; graceful "profile pending" when null):

```tsx
// src/components/guide/source-transparency-card.tsx
import type { Doc } from "../../../convex/_generated/dataModel";

const TYPE_LABEL: Record<string, string> = {
  nonprofit: "nonprofit newsroom", public_media: "public media",
  corporate_daily: "daily newspaper", wire: "wire service", trade: "trade press",
  tv: "broadcast TV", national: "national outlet", other: "news outlet",
};

export function SourceTransparencyCard({
  outlet, outletName,
}: { outlet: Doc<"outlets"> | null; outletName: string }) {
  if (!outlet) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        {outletName} · outlet profile pending
      </p>
    );
  }
  return (
    <div className="font-mono text-xs text-muted-foreground">
      <span className="font-bold text-foreground">{outlet.displayName}</span>
      {" · "}{TYPE_LABEL[outlet.type] ?? "news outlet"}
      {outlet.fundingNote ? ` · ${outlet.fundingNote}` : ""}
      {outlet.ownership ? (
        <div className="mt-0.5">
          {outlet.ownership}
          {outlet.ownershipSourceUrl ? (
            <>
              {" "}
              <a href={outlet.ownershipSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                source&nbsp;↗
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      {/* v1: no bias/factuality badge rendered (data-ready in outlet.thirdPartyRatings). */}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/source-transparency-card.tsx
git commit -m "feat(coverage): SourceTransparencyCard (transparency-only)"
```

---

### Task 9: `InTheNews` module + wire into candidate & race pages

**Files:**
- Create: `src/components/guide/in-the-news.tsx`
- Modify: `src/lib/data.ts` (add `getInTheNewsForCandidate`, `getInTheNewsForRace`)
- Modify: `src/app/candidates/[slug]/page.tsx` (fetch + render + nav section)
- Modify: `src/app/races/[slug]/page.tsx` (same, race-level)

**Interfaces:**
- Consumes: `api.coverage.inTheNewsForCandidate` / `inTheNewsForRace`; `SourceTransparencyCard`.
- Produces: `<InTheNews items={CoverageRow[]} heading={string} />` where `CoverageRow = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null }`.

- [ ] **Step 1: Add data helpers** in `src/lib/data.ts`:

```ts
export const getInTheNewsForCandidate = (candidateSlug: string) =>
  fetchQuery(api.coverage.inTheNewsForCandidate, { candidateSlug });
export const getInTheNewsForRace = (raceId: string) =>
  fetchQuery(api.coverage.inTheNewsForRace, { raceId });
```

- [ ] **Step 2: Implement `InTheNews`** (attributed links only — no BadgerBrief claim):

```tsx
// src/components/guide/in-the-news.tsx
import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceTransparencyCard } from "./source-transparency-card";

type Row = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null };

export function InTheNews({ items, heading }: { items: Row[]; heading: string }) {
  if (items.length === 0) return null;
  return (
    <section id="news" className="mt-8">
      <h2 className="text-xl font-bold">{heading}</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Coverage a BadgerBrief editor confirmed is about this race. We link out — we don&rsquo;t summarize.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map(({ article, outlet }) => (
          <li key={article._id} className="border-2 border-border bg-card p-3">
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              {article.headline}&nbsp;↗
            </a>
            {article.publishedAt ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">{article.publishedAt}</span>
            ) : null}
            <div className="mt-1">
              <SourceTransparencyCard outlet={outlet} outletName={article.outlet} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the candidate page** (`src/app/candidates/[slug]/page.tsx`): add `getInTheNewsForCandidate(slug)` to the `Promise.all` at L66, add a nav section `...(inTheNews.length > 0 ? [{ id: "news", label: "In the news", count: inTheNews.length }] : [])`, and render `<InTheNews items={inTheNews} heading={`In the news about ${candidate.name}`} />` in the page body. Import both at the top.

- [ ] **Step 4: Wire into the race page** the same way using `getInTheNewsForRace(race.raceId)`.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npx next build` (or the repo's build script)
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/guide/in-the-news.tsx src/lib/data.ts "src/app/candidates/[slug]/page.tsx" "src/app/races/[slug]/page.tsx"
git commit -m "feat(coverage): In the News on candidate + race pages"
```

---

### Task 10: `/news` hub page + feed

**Files:**
- Create: `src/app/news/page.tsx`
- Create: `src/components/guide/news-feed.tsx`
- Modify: `src/lib/data.ts` (add `getHubArticles`)
- Modify: nav (wherever `AD TRACKER`/`VOTER HELP` header links live — add a `NEWS` link)

**Interfaces:**
- Consumes: `api.coverage.hubArticles`; `SourceTransparencyCard`.
- Produces: `/news` server page listing hub coverage, filter chips by `outlet.type` (client subcomponent).

- [ ] **Step 1: Add data helper**

```ts
// src/lib/data.ts
export const getHubArticles = (raceId?: string) =>
  fetchQuery(api.coverage.hubArticles, raceId ? { raceId } : {});
```

- [ ] **Step 2: Implement the feed** (`src/components/guide/news-feed.tsx`) — reverse-chron list of the same `Row` shape as Task 9, with a client-side outlet-type filter (chips). Reuse `InTheNews`'s row markup; factor the row into a shared `<CoverageRow>` if it reads cleaner, otherwise duplicate the ~10 lines. Empty state: "We haven't found tracked coverage yet." Include a "How we handle coverage" link to `/news/about` (Task 11).

- [ ] **Step 3: Implement the page** (`src/app/news/page.tsx`, server component, `revalidate = 300`):

```tsx
import type { Metadata } from "next";
import { NewsFeed } from "@/components/guide/news-feed";
import { getHubArticles } from "@/lib/data";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Election news — Wisconsin 2026",
  description: "Tracked coverage of Wisconsin's 2026 races, with source transparency on every outlet.",
  alternates: { canonical: "/news" },
};

export default async function NewsPage() {
  const items = await getHubArticles();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:max-w-5xl">
      <h1 className="text-3xl font-bold">Wisconsin 2026 — election news</h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Coverage we&rsquo;ve tracked, linked out with transparency on who runs each outlet. We don&rsquo;t summarize or rate the reporting.{" "}
        <a href="/news/about" className="underline">How we handle coverage ↗</a>
      </p>
      <NewsFeed items={items} />
    </main>
  );
}
```

- [ ] **Step 4: Add the `NEWS` header nav link** next to the existing links (match the existing nav component's markup).

- [ ] **Step 5: Typecheck + build → clean. Commit**

```bash
git add src/app/news/page.tsx src/components/guide/news-feed.tsx src/lib/data.ts
git commit -m "feat(coverage): /news hub with source transparency"
```

---

### Task 11: "How we handle coverage" methodology page

**Files:**
- Create: `src/app/news/about/page.tsx`

**Interfaces:** none (static server component).

- [ ] **Step 1: Implement** a static page explaining, in plain language: what BadgerBrief tracks (WI-election coverage only); that it links out and never summarizes or rates the reporting; that outlet transparency (ownership/funding/type) comes from public records and is human-reviewed; that BadgerBrief does not assign political-bias labels in v1; how the hub (auto) vs. entity (editor-approved) tiers differ; and how to report an error. Mirror the layout/typography of the existing `/methodology` page if present.

- [ ] **Step 2: Typecheck → clean. Commit**

```bash
git add src/app/news/about/page.tsx
git commit -m "docs(coverage): 'How we handle coverage' methodology page"
```

---

### Task 12: Admin — outlet curation + hub moderation UI

**Files:**
- Create: `src/components/admin/outlet-editor.tsx` (curate/approve outlets; mirror `src/components/admin/sponsor-resolver.tsx`)
- Modify: the admin queue page to surface draft outlets + a hub-hide control (mirror how `article-sources.tsx` / `sponsor-resolver.tsx` are mounted)

**Interfaces:**
- Consumes: `api.outlets.listDraftOutlets`, `api.outlets.saveOutlet`, `api.outlets.approveOutlet`, `api.outletEnrich.enrichOutlet`, `api.coverage.setHubStatus`.

- [ ] **Step 1: Implement `outlet-editor.tsx`** modeled on `sponsor-resolver.tsx`: fields for displayName, type (select over `OUTLET_TYPES`), ownership, fundingNote, ownershipSourceUrl; buttons "Enrich (web)", "Save", "Approve". Same `useMutation`/`useAction`/`useQuery` pattern.

- [ ] **Step 2: Add a hub-moderation control** to the coverage/admin surface: for a hub row, a "Hide from hub" button calling `setHubStatus({ articleId, hubStatus: "hidden" })` (and un-hide).

- [ ] **Step 3: Typecheck + build → clean. Commit**

```bash
git add src/components/admin/outlet-editor.tsx src/app/admin
git commit -m "feat(coverage): admin outlet curation + hub moderation"
```

---

## Self-Review

**Spec coverage:** §2 surfaces A+B → Tasks 9,10; transparency layer → Tasks 3,6,8; methodology → Task 11; §3 data model → Tasks 1,2,3; §4 ingestion+tiered gating → Tasks 4,5,7; §5 UI + brand rules → Tasks 8,9,10; §6 edge states (unrated→"pending", no coverage→empty state, dedup by_url) → Tasks 5,8,10; §7 reuse map → Tasks 6,7 (scout + sponsor pattern); §8 Q1 settled: transparency-only v1 (badge deferred, field data-ready) → Global Constraints + Task 2/8. Admin curation (needed to populate outlets) → Task 12. No gaps.

**Placeholder scan:** Network layers (`fetchOutletFacts`/`firecrawlOutlet.ts`) are intentionally untested and described by analogy to the existing `firecrawlSponsor.ts` — this matches the repo's pattern (parsers tested via fixture, network untested), not a placeholder. All logic steps carry real code.

**Type consistency:** `normalizeOutletKey`, `scoreRelevance`/`HUB_RELEVANCE_MIN`, `parseOutletTransparency`, `decorateCoverageRow`, the `Row = { article, outlet }` shape, and `upsertOutlet` args are used identically across Tasks 1–12. `hubStatus`/`status`/`reviewStatus` unions match the schema in Task 2.

**Open follow-up (non-blocking):** v2 = add a rating provider (populates `outlets.thirdPartyRatings`) + render a bias/factuality badge in `SourceTransparencyCard` + the PRD's Bias Bar and clustering. None of that requires a migration — the field and card already exist.
