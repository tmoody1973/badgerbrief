# Forecast Signals Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/forecast` into a guided 3-act class on election forecasting that blends four signals (polls, social reach, ad spend, news-mention tone) into an interactive, no-prediction lesson.

**Architecture:** Approach C (hybrid). The three already-live signals normalize to share-of-field in the browser for instant slider response; only news tone adds a small Convex backend (an LLM classifier over the existing `article_sources` rows). A pure `src/lib/signals.ts` module holds the normalize/blend math. The blend is only ever shown as bar ordering — never a printed number.

**Tech Stack:** Next.js (App Router) + React client components, Convex, `ai` + `@ai-sdk/anthropic` (`generateObject`), vitest + `convex-test`, Tailwind (site neo-brutalist tokens).

## Global Constraints

- **No quotable composite score.** The blend result is expressed ONLY as ordering + relative bar length. Never render a printed composite figure a reader could screenshot as "Hong: 81."
- **"This is not a prediction" frame persists** on the interactive (Act 3) section.
- **Normalize before blending.** Every signal passes through `toShares` (share-of-field) before it enters `blend`. Raw units (dollars, followers, story counts) are never added together.
- **News tone is scored toward THE candidate** ("Hong slams Tiffany" = positive-for-Hong). Low-confidence classifications count as neutral. Real headlines are always linked.
- **No outlet bias bands rendered** (the `outlets.thirdPartyRatings` field stays hidden per its existing v1 schema constraint).
- **Turnout is illustrative, not rigorous** — a scenario tilt + qualitative copy + a WEC source link; no hard turnout percentage is asserted on the page in v1.
- Immutable updates only (spread, no mutation). Prefer small focused files. Reuse site tokens (`bg-primary`, `bg-success`, `bg-destructive`, `shadow-brutal`).
- Active field = `ACTIVE_DEM` from `src/lib/forecast.ts` (`francesca-hong`→Hong, `david-crowley`→Crowley, `joel-brennan`→Brennan, `kelda-roys`→Roys).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: signals math core — `toShares` / `blend` / `rank`

**Files:**
- Create: `src/lib/signals.ts`
- Test: `src/lib/signals.test.ts`

**Interfaces:**
- Produces: `type Shares = Record<string, number>`; `type SignalKey = "polls" | "social" | "adspend" | "news"`; `toShares(values: Record<string, number>): Shares`; `blend(shares: Partial<Record<SignalKey, Shares>>, weights: Partial<Record<SignalKey, number>>): Shares`; `rank(blended: Shares): Array<{ slug: string; value: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/signals.test.ts
import { describe, expect, test } from "vitest";
import { toShares, blend, rank } from "./signals";

describe("signals math", () => {
  test("toShares normalizes to sum 1, floors negatives, handles empty field", () => {
    const s = toShares({ a: 30, b: 10 });
    expect(s.a).toBeCloseTo(0.75);
    expect(s.b).toBeCloseTo(0.25);
    expect(toShares({ a: -5, b: 0 })).toEqual({ a: 0, b: 0 }); // all non-positive
    expect(Object.values(toShares({ a: 1, b: 3 })).reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });

  test("blend weight-averages only signals with data AND positive weight", () => {
    const shares = {
      polls: { a: 0.7, b: 0.3 },
      social: { a: 0.4, b: 0.6 },
    };
    // equal weights → simple average
    const even = blend(shares, { polls: 1, social: 1 });
    expect(even.a).toBeCloseTo(0.55);
    expect(even.b).toBeCloseTo(0.45);
    // zero-weight social drops out → polls only
    const pollsOnly = blend(shares, { polls: 1, social: 0 });
    expect(pollsOnly.a).toBeCloseTo(0.7);
    // a signal with no data is ignored even at positive weight
    const withEmpty = blend({ ...shares, news: {} }, { polls: 1, social: 1, news: 5 });
    expect(withEmpty.a).toBeCloseTo(0.55);
  });

  test("rank orders candidates high to low", () => {
    expect(rank({ a: 0.2, b: 0.5, c: 0.3 }).map((r) => r.slug)).toEqual(["b", "c", "a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/signals.test.ts`
Expected: FAIL — cannot find module `./signals`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/signals.ts
/**
 * Multi-signal blend math for the /forecast class. Everything is done in
 * SHARE space (each candidate's fraction of the field, 0..1) so signals in
 * different units — poll %, followers, dollars, story counts — are never
 * added raw. The blend output is a RELATIVE index used only for ordering and
 * bar length; it is never shown to the reader as a number.
 */
export type Shares = Record<string, number>;
export type SignalKey = "polls" | "social" | "adspend" | "news";

/** Normalize any raw signal to share-of-field. Negatives floor to 0; empty/all-zero → zeros. */
export function toShares(values: Record<string, number>): Shares {
  const pos = (v: number) => (v > 0 ? v : 0);
  const total = Object.values(values).reduce((s, v) => s + pos(v), 0);
  if (total <= 0) return Object.fromEntries(Object.keys(values).map((k) => [k, 0]));
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, pos(v) / total]));
}

/** Weighted average of per-signal shares. Only signals with data AND positive weight participate; their weights renormalize to sum 1. */
export function blend(
  shares: Partial<Record<SignalKey, Shares>>,
  weights: Partial<Record<SignalKey, number>>,
): Shares {
  const active = (Object.keys(shares) as SignalKey[]).filter(
    (k) => shares[k] && Object.keys(shares[k]!).length > 0 && (weights[k] ?? 0) > 0,
  );
  const wsum = active.reduce((s, k) => s + (weights[k] ?? 0), 0);
  if (wsum <= 0) return {};
  const slugs = new Set<string>();
  for (const k of active) for (const slug of Object.keys(shares[k]!)) slugs.add(slug);
  const out: Shares = {};
  for (const slug of slugs) {
    out[slug] = active.reduce((acc, k) => acc + (weights[k]! / wsum) * (shares[k]![slug] ?? 0), 0);
  }
  return out;
}

/** Leaderboard order (highest first) for the re-order display. */
export function rank(blended: Shares): Array<{ slug: string; value: number }> {
  return Object.entries(blended)
    .map(([slug, value]) => ({ slug, value }))
    .sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/signals.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.ts src/lib/signals.test.ts
git commit -m "feat(forecast): signals share-normalize + blend + rank core

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: turnout scenario tilt

**Files:**
- Modify: `src/lib/signals.ts` (append)
- Test: `src/lib/signals.test.ts` (append)

**Interfaces:**
- Consumes: `toShares`, `Shares` from Task 1.
- Produces: `type TurnoutScenario = "broad" | "hardcore"`; `TURNOUT_PROFILE: Record<string, number>`; `applyTurnoutTilt(shares: Shares, scenario: TurnoutScenario, profile?: Record<string, number>): Shares`.

- [ ] **Step 1: Write the failing test** (append to `signals.test.ts`)

```ts
import { applyTurnoutTilt, TURNOUT_PROFILE } from "./signals";

describe("turnout tilt", () => {
  test("broad scenario leaves shares unchanged", () => {
    const s = { "francesca-hong": 0.6, "kelda-roys": 0.4 };
    expect(applyTurnoutTilt(s, "broad")).toEqual(s);
  });

  test("hardcore scenario tilts by profile then renormalizes to sum 1", () => {
    const s = { a: 0.5, b: 0.5 };
    const tilted = applyTurnoutTilt(s, "hardcore", { a: 0.5, b: 1.5 });
    expect(tilted.b).toBeGreaterThan(tilted.a);
    expect(tilted.a + tilted.b).toBeCloseTo(1);
  });

  test("default profile has an entry for every active Dem slug", () => {
    for (const slug of ["francesca-hong", "david-crowley", "joel-brennan", "kelda-roys"]) {
      expect(TURNOUT_PROFILE[slug]).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/signals.test.ts`
Expected: FAIL — `applyTurnoutTilt` / `TURNOUT_PROFILE` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `signals.ts`)

```ts
export type TurnoutScenario = "broad" | "hardcore";

/**
 * ILLUSTRATIVE, hand-set turnout propensity for a "hardcore" (small, older,
 * high-info August-primary) electorate. >1 = relatively favored when the
 * electorate shrinks to its most reliable voters; <1 = relatively favored by a
 * broad, younger, online-heavy electorate. These are a teaching device, NOT a
 * measured model (we have no turnout crosstabs) — surfaced as such in the UI.
 * This is a calibration knob: tune the numbers as judgment improves.
 */
export const TURNOUT_PROFILE: Record<string, number> = {
  "francesca-hong": 0.85, // strength skews young/online → fades in a hardcore electorate
  "david-crowley": 1.0,
  "joel-brennan": 1.1, // establishment/older-leaning → relatively favored
  "kelda-roys": 1.05,
};

/** Tilt shares by a turnout profile, then renormalize back to share-of-field. */
export function applyTurnoutTilt(
  shares: Shares,
  scenario: TurnoutScenario,
  profile: Record<string, number> = TURNOUT_PROFILE,
): Shares {
  if (scenario === "broad") return shares;
  const tilted = Object.fromEntries(
    Object.entries(shares).map(([slug, v]) => [slug, v * (profile[slug] ?? 1)]),
  );
  return toShares(tilted);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/signals.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.ts src/lib/signals.test.ts
git commit -m "feat(forecast): illustrative turnout scenario tilt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: news tone storage + read query

**Files:**
- Modify: `convex/schema.ts` (`article_sources` table — add optional tone fields)
- Create: `convex/newsTone.ts` (`setArticleTone` internal mutation + `newsToneForRace` query)
- Test: `convex/newsTone.test.ts`

**Interfaces:**
- Consumes: existing `article_sources` table (`candidateSlug`, `raceId`, `headline`, `outlet`, `url`, `status`).
- Produces: `internal.newsTone.setArticleTone({ id, tone, confidence, rationale })`; `api.newsTone.newsToneForRace({ raceId }): Array<{ candidateSlug, positive, neutral, negative, net, count, stories: Array<{ headline, url, outlet, tone }> }>`.

- [ ] **Step 1: Add schema fields** (`convex/schema.ts`, inside the `article_sources` table definition, after `traceId`)

```ts
    // News-tone signal (forecasting class). Tone is scored TOWARD this article's
    // candidate ("X slams Y" = positive-for-X). Undefined until classified.
    tone: v.optional(v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative"))),
    toneConfidence: v.optional(v.number()),
    toneRationale: v.optional(v.string()),
    toneClassifiedAt: v.optional(v.number()),
```

- [ ] **Step 2: Write the failing test**

```ts
// convex/newsTone.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

async function seedArticle(t: ReturnType<typeof setup>, slug: string, headline: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("article_sources", {
      candidateSlug: slug,
      raceId: "WI-GOV-2026",
      url: `https://example.com/${encodeURIComponent(headline)}`,
      outlet: "Example Outlet",
      headline,
      whyRelevant: "test",
      status: "approved",
      proposedAt: 0,
    } as any),
  );
}

describe("newsTone", () => {
  test("setArticleTone stores tone; newsToneForRace aggregates +/neutral/- and net", async () => {
    const t = setup();
    const a = await seedArticle(t, "francesca-hong", "Hong unveils housing plan");
    const b = await seedArticle(t, "francesca-hong", "Hong faces criticism over vote");
    await seedArticle(t, "francesca-hong", "Hong to appear at forum"); // stays unclassified → neutral bucket

    await t.mutation(internal.newsTone.setArticleTone, { id: a, tone: "positive", confidence: 0.9, rationale: "x" });
    await t.mutation(internal.newsTone.setArticleTone, { id: b, tone: "negative", confidence: 0.8, rationale: "x" });

    const rows = await t.query(api.newsTone.newsToneForRace, { raceId: "WI-GOV-2026" });
    const hong = rows.find((r) => r.candidateSlug === "francesca-hong")!;
    expect(hong.positive).toBe(1);
    expect(hong.negative).toBe(1);
    expect(hong.neutral).toBe(1); // unclassified counts neutral
    expect(hong.count).toBe(3);
    expect(hong.net).toBe(0); // positive - negative
    expect(hong.stories).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/newsTone.test.ts`
Expected: FAIL — `internal.newsTone.setArticleTone` undefined.

- [ ] **Step 4: Write implementation**

```ts
// convex/newsTone.ts
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/** Persist an LLM tone classification onto an article_sources row. */
export const setArticleTone = internalMutation({
  args: {
    id: v.id("article_sources"),
    tone: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
    confidence: v.number(),
    rationale: v.string(),
  },
  handler: async (ctx, { id, tone, confidence, rationale }) => {
    await ctx.db.patch(id, { tone, toneConfidence: confidence, toneRationale: rationale, toneClassifiedAt: Date.now() });
  },
});

/**
 * Per-candidate earned-media tone for the race: counts of positive/neutral/
 * negative approved stories, a net (positive - negative) score, and the linked
 * headlines so the reader can audit the classifier. Unclassified approved
 * stories count as neutral.
 */
export const newsToneForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = await ctx.db
      .query("article_sources")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    const approved = rows.filter((r) => r.status === "approved" && r.candidateSlug);
    const byCand = new Map<string, typeof approved>();
    for (const r of approved) {
      const g = byCand.get(r.candidateSlug!) ?? [];
      g.push(r);
      byCand.set(r.candidateSlug!, g);
    }
    return [...byCand.entries()].map(([candidateSlug, arts]) => {
      const tone = (r: (typeof arts)[number]) => r.tone ?? "neutral";
      const positive = arts.filter((r) => tone(r) === "positive").length;
      const negative = arts.filter((r) => tone(r) === "negative").length;
      const neutral = arts.length - positive - negative;
      return {
        candidateSlug,
        positive,
        neutral,
        negative,
        net: positive - negative,
        count: arts.length,
        stories: arts.map((r) => ({ headline: r.headline, url: r.url, outlet: r.outlet, tone: tone(r) })),
      };
    });
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/newsTone.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/newsTone.ts convex/newsTone.test.ts
git commit -m "feat(forecast): article_sources tone fields + newsToneForRace read

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: news tone classifier (rubric + action)

**Files:**
- Modify: `convex/newsTone.ts` (add pure `buildToneRubricPrompt` + `classifyPendingArticles` action)
- Test: `convex/newsTone.test.ts` (append — pure prompt-builder test only)

**Interfaces:**
- Consumes: `internal.newsTone.setArticleTone` (Task 3); `article_sources` rows.
- Produces: `buildToneRubricPrompt(headline: string, whyRelevant: string, candidateName: string): string`; `internal.newsTone.classifyPendingArticles({ limit? })`.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { buildToneRubricPrompt } from "./newsTone";

describe("tone rubric prompt", () => {
  test("anchors tone TO the candidate and warns about the slams-opponent trap", () => {
    const p = buildToneRubricPrompt("Hong slams Tiffany on taxes", "attack line", "Francesca Hong");
    expect(p).toContain("Francesca Hong");
    expect(p.toLowerCase()).toContain("toward"); // scored toward the candidate
    expect(p).toContain("Hong slams Tiffany on taxes"); // headline embedded
    // the trap: an attack BY the candidate is positive-for-them
    expect(p.toLowerCase()).toContain("attacks an opponent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/newsTone.test.ts`
Expected: FAIL — `buildToneRubricPrompt` not exported.

- [ ] **Step 3: Write implementation** (append to `convex/newsTone.ts`)

```ts
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

const MODEL = "claude-sonnet-5"; // align with convex/research.ts MODEL

/** Pure, testable rubric prompt. Tone is judged TOWARD the candidate. */
export function buildToneRubricPrompt(headline: string, whyRelevant: string, candidateName: string): string {
  return [
    `Classify the tone of this news item TOWARD the candidate "${candidateName}".`,
    `Answer positive, neutral, or negative from the candidate's perspective — not the overall mood of the words.`,
    `Rules:`,
    `- If the candidate ATTACKS an opponent or lands a hit, that is POSITIVE for the candidate, even though the words are harsh.`,
    `- Straight, factual coverage with no favorable/unfavorable slant is NEUTRAL. Most coverage is neutral.`,
    `- Scandal, criticism, gaffes, or bad polling for the candidate are NEGATIVE.`,
    `- If genuinely unsure, answer neutral with low confidence.`,
    ``,
    `Headline: ${headline}`,
    `Why it's relevant: ${whyRelevant}`,
  ].join("\n");
}

const toneSchema = z.object({
  tone: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

/** Classify approved article_sources rows that have no tone yet. */
export const classifyPendingArticles = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 25 }) => {
    const pending = await ctx.runQuery(internal.newsTone.pendingToClassify, { limit });
    let done = 0;
    for (const a of pending) {
      try {
        const { object } = await generateObject({
          model: anthropic(MODEL),
          schema: toneSchema,
          prompt: buildToneRubricPrompt(a.headline, a.whyRelevant, a.candidateName),
        });
        // Low-confidence → treat as neutral (Global Constraint).
        const tone = object.confidence < 0.5 ? "neutral" : object.tone;
        await ctx.runMutation(internal.newsTone.setArticleTone, {
          id: a.id,
          tone,
          confidence: object.confidence,
          rationale: object.rationale,
        });
        done++;
      } catch (e) {
        console.error("newsTone classify failed", a.id, (e as Error).message);
      }
    }
    return { classified: done };
  },
});
```

Also add the `pendingToClassify` internal query (non-node) near `setArticleTone` (it resolves the candidate display name):

```ts
import { internalQuery } from "./_generated/server";

export const pendingToClassify = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("article_sources")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const pending = rows.filter((r) => r.candidateSlug && r.tone === undefined).slice(0, limit);
    const out: Array<{ id: typeof rows[number]["_id"]; headline: string; whyRelevant: string; candidateName: string }> = [];
    for (const r of pending) {
      const cand = await ctx.db
        .query("candidates")
        .withIndex("by_race", (q) => q.eq("raceId", r.raceId!))
        .collect();
      const name = cand.find((c) => c.slug === r.candidateSlug)?.name ?? r.candidateSlug!;
      out.push({ id: r._id, headline: r.headline, whyRelevant: r.whyRelevant, candidateName: name });
    }
    return out;
  },
});
```

> Note: `classifyPendingArticles` uses `"use node"` (Anthropic SDK). The mutation/queries stay in the default runtime. If Convex complains about mixing `"use node"` with non-node exports in one file, split the action into `convex/newsToneClassify.ts` (node) and keep `setArticleTone`/`newsToneForRace`/`pendingToClassify` in `convex/newsTone.ts`. Follow the split pattern already used by `convex/research.ts` vs its callers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/newsTone.test.ts`
Expected: PASS (prompt-builder + Task 3 aggregation tests). The action is verified manually post-deploy: `npx convex run newsTone:classifyPendingArticles '{"limit":5}'` then reload `/forecast`.

- [ ] **Step 5: Commit**

```bash
git add convex/newsTone.ts convex/newsToneClassify.ts convex/newsTone.test.ts
git commit -m "feat(forecast): news-tone LLM classifier (rubric scored toward candidate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Act 2 — "Meet the witnesses" component

**Files:**
- Create: `src/components/forecast/witnesses.tsx`
- Create: `src/lib/forecast-signals.ts` (pure browser-side share builders from each live query result)
- Test: `src/lib/forecast-signals.test.ts`

**Interfaces:**
- Consumes: `toShares` (Task 1); `ACTIVE_DEM` (`src/lib/forecast.ts`); the return shapes of `api.social.socialForRace`, `api.adMoney.adMoneyForRace`, `api.newsTone.newsToneForRace`, and parsed polls (`aggregate`).
- Produces: `pollShares(avg)`, `socialShares(social)`, `adSpendShares(adMoney)`, `newsShares(tone)` — each `→ Shares` restricted to `ACTIVE_DEM`; `<Witnesses signals={...} />`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/forecast-signals.test.ts
import { describe, expect, test } from "vitest";
import { socialShares, adSpendShares, newsShares } from "./forecast-signals";

describe("forecast signal share builders", () => {
  test("socialShares sums followers per active Dem then normalizes", () => {
    const social = [
      { candidateSlug: "francesca-hong", platform: "twitter", followers: 120000 },
      { candidateSlug: "francesca-hong", platform: "instagram", followers: 40000 },
      { candidateSlug: "kelda-roys", platform: "twitter", followers: 40000 },
      { candidateSlug: "tom-tiffany", platform: "twitter", followers: 90000 }, // not an active Dem → excluded
    ] as any;
    const s = socialShares(social);
    expect(s.Hong).toBeCloseTo(0.8); // 160k / 200k
    expect(s.Roys).toBeCloseTo(0.2);
    expect(s.Tiffany).toBeUndefined();
  });

  test("adSpendShares uses per-candidate totalSpend", () => {
    const adMoney = { candidates: [
      { candidateSlug: "francesca-hong", totalSpend: 30000 },
      { candidateSlug: "david-crowley", totalSpend: 10000 },
    ] } as any;
    const s = adSpendShares(adMoney);
    expect(s.Hong).toBeCloseTo(0.75);
    expect(s.Crowley).toBeCloseTo(0.25);
  });

  test("newsShares uses max(0, positive-negative) favorable-coverage volume", () => {
    const tone = [
      { candidateSlug: "francesca-hong", positive: 4, negative: 1 },
      { candidateSlug: "kelda-roys", positive: 1, negative: 3 }, // net negative → 0 share
    ] as any;
    const s = newsShares(tone);
    expect(s.Hong).toBeCloseTo(1); // 3 vs 0
    expect(s.Roys).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/forecast-signals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/forecast-signals.ts
import { toShares, type Shares } from "./signals";
import { ACTIVE_DEM } from "./forecast";

const slugToLabel = ACTIVE_DEM; // { "francesca-hong": "Hong", ... }

function restrict(raw: Record<string, number>): Shares {
  // keep only active Dems, key by short label
  const byLabel: Record<string, number> = {};
  for (const [slug, label] of Object.entries(slugToLabel)) {
    if (raw[slug] != null) byLabel[label] = raw[slug];
  }
  return toShares(byLabel);
}

/** Poll standing (already per short-label from `aggregate`) → shares. */
export function pollShares(avg: Record<string, number>): Shares {
  return toShares(avg);
}

export function socialShares(
  social: Array<{ candidateSlug: string; followers?: number }> | undefined,
): Shares {
  const raw: Record<string, number> = {};
  for (const r of social ?? []) raw[r.candidateSlug] = (raw[r.candidateSlug] ?? 0) + (r.followers ?? 0);
  return restrict(raw);
}

export function adSpendShares(
  adMoney: { candidates: Array<{ candidateSlug: string; totalSpend: number }> } | undefined,
): Shares {
  const raw: Record<string, number> = {};
  for (const c of adMoney?.candidates ?? []) raw[c.candidateSlug] = c.totalSpend;
  return restrict(raw);
}

export function newsShares(
  tone: Array<{ candidateSlug: string; positive: number; negative: number }> | undefined,
): Shares {
  const raw: Record<string, number> = {};
  for (const r of tone ?? []) raw[r.candidateSlug] = Math.max(0, r.positive - r.negative);
  return restrict(raw);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/forecast-signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the Witnesses component**

```tsx
// src/components/forecast/witnesses.tsx
"use client";
import type { Shares } from "@/lib/signals";

const HOW_IT_LIES: Record<string, string> = {
  Polls: "The witness everyone quotes — but old and sparse in a primary.",
  "Social reach": "Buzz ≠ votes: skews young and online; August primary voters skew old.",
  "Ad spend": "Where the campaign THINKS the vote is — a revealed belief, not a result.",
  "News tone": "Earned media reaches older voters — but tone-scoring is error-prone, so we link every headline.",
};

function ShareRow({ label, shares }: { label: string; shares: Shares }) {
  const rows = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  const has = rows.some(([, v]) => v > 0);
  return (
    <div className="border-t border-border py-4 first:border-t-0">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">{label}</span>
        <span className="text-xs text-muted-foreground">{HOW_IT_LIES[label]}</span>
      </div>
      {!has ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">no data yet</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {rows.map(([name, v]) => (
            <div key={name} className="grid grid-cols-[4.5rem_1fr_2.6rem] items-center gap-3">
              <span className="font-mono text-sm">{name}</span>
              <span className="h-3 overflow-hidden border border-border bg-muted">
                <span className="block h-full bg-primary" style={{ width: `${Math.round(v * 100)}%` }} />
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{Math.round(v * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Witnesses({ signals }: { signals: Record<string, Shares> }) {
  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">Meet the witnesses</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The same field, measured four different ways — as each candidate&apos;s <b className="text-foreground">share of the field</b>.
        Watch them disagree. Every witness lies in its own way.
      </p>
      <div className="mt-4">
        {Object.entries(signals).map(([label, shares]) => (
          <ShareRow key={label} label={label} shares={shares} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/forecast-signals.ts src/lib/forecast-signals.test.ts src/components/forecast/witnesses.tsx
git commit -m "feat(forecast): Act 2 Meet-the-witnesses share bars + signal builders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Act 3 — "You be the forecaster" blend lab

**Files:**
- Create: `src/components/forecast/blend-lab.tsx`

**Interfaces:**
- Consumes: `blend`, `rank`, `applyTurnoutTilt`, `type Shares`, `type SignalKey` (Tasks 1-2).
- Produces: `<BlendLab signals={Partial<Record<SignalKey, Shares>>} labels={Record<SignalKey,string>} />`.

- [ ] **Step 1: Build the component** (no printed composite number — Global Constraint)

```tsx
// src/components/forecast/blend-lab.tsx
"use client";
import { useMemo, useState } from "react";
import { blend, rank, applyTurnoutTilt, type Shares, type SignalKey, type TurnoutScenario } from "@/lib/signals";

const SIGNAL_ORDER: Array<{ key: SignalKey; label: string }> = [
  { key: "polls", label: "Polls" },
  { key: "social", label: "Social reach" },
  { key: "adspend", label: "Ad spend" },
  { key: "news", label: "News tone" },
];

export function BlendLab({ signals }: { signals: Partial<Record<SignalKey, Shares>> }) {
  const [weights, setWeights] = useState<Record<SignalKey, number>>({ polls: 3, social: 1, adspend: 1, news: 1 });
  const [scenario, setScenario] = useState<TurnoutScenario>("broad");

  const ordered = useMemo(() => {
    const blended = blend(signals, weights);
    const tilted = applyTurnoutTilt(blended, scenario);
    return rank(tilted);
  }, [signals, weights, scenario]);

  const top = ordered[0]?.value ?? 1;

  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">You be the forecaster</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Decide how much to trust each witness. The order below is <i>your</i> forecast — and it changes with your
        assumptions. <b className="text-foreground">That movement is the point. There is no &ldquo;right&rdquo; number.</b>
      </p>

      {/* weight sliders */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {SIGNAL_ORDER.map(({ key, label }) => {
          const available = signals[key] && Object.keys(signals[key]!).length > 0;
          return (
            <label key={key} className={`block ${available ? "" : "opacity-40"}`}>
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {label}{available ? "" : " — no data"}
              </span>
              <input
                type="range" min={0} max={5} value={weights[key]} disabled={!available}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                className="mt-2 w-full accent-primary"
              />
            </label>
          );
        })}
      </div>

      {/* turnout scenario */}
      <div className="mt-5">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">Who shows up in August?</span>
        <div className="mt-2 flex gap-2">
          {(["broad", "hardcore"] as TurnoutScenario[]).map((s) => (
            <button key={s} type="button" onClick={() => setScenario(s)}
              className={`border-2 border-border px-3 py-1.5 font-mono text-xs uppercase ${scenario === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {s === "broad" ? "Broad electorate" : "Small hardcore electorate"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Only a small, older slice of Wisconsin Democrats votes in an August primary — turnout reshapes who&apos;s really ahead.
          This tilt is <i>illustrative, not a measured model.</i>
        </p>
      </div>

      {/* re-ordered field — ordering + bar length ONLY, never a number */}
      <div className="mt-6 flex flex-col gap-2">
        {ordered.map(({ slug, value }, i) => (
          <div key={slug} className="grid grid-cols-[1.5rem_4.5rem_1fr] items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{i + 1}</span>
            <span className="font-mono text-sm">{slug}</span>
            <span className="h-4 overflow-hidden border border-border bg-muted">
              <span className="block h-full bg-primary transition-[width] duration-500" style={{ width: `${top > 0 ? (value / top) * 100 : 0}%` }} />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 font-mono text-xs text-muted-foreground">This is not a prediction — it&apos;s your assumptions, drawn as a picture.</p>
    </section>
  );
}
```

> Note: `blend`/`rank` key by whatever the share objects use. Pass the SAME keying to every signal — use the short labels (Hong/Crowley/…) produced by the Task 5 builders so `slug` here renders as the short label.

- [ ] **Step 2: Verify (build)**

Run: `npx tsc --noEmit` — expected: clean. (Component logic is covered by the Task 1-2 unit tests; there is no component-test harness in this repo, so visual verification happens in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/components/forecast/blend-lab.tsx
git commit -m "feat(forecast): Act 3 blend lab — weight sliders + turnout, no quotable score

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: assemble the acts + framing copy + verify live

**Files:**
- Modify: `src/components/forecast/forecast-experience.tsx` (wire the new signals + render Act 2/3)
- Modify: `src/app/forecast/page.tsx` (act framing copy only — no data changes)

**Interfaces:**
- Consumes: `Witnesses` (Task 5), `BlendLab` (Task 6), `pollShares/socialShares/adSpendShares/newsShares` (Task 5), existing `aggregate` + queries.

- [ ] **Step 1: Wire the signals in `forecast-experience.tsx`**

Inside `ForecastExperience`, after the existing `reach` memo, add:

```tsx
  const adMoney = useQuery(api.adMoney.adMoneyForRace, { raceId });
  const newsTone = useQuery(api.newsTone.newsToneForRace, { raceId });

  const witnessSignals = useMemo(
    () => ({
      "Polls": pollShares(avg),
      "Social reach": socialShares(social),
      "Ad spend": adSpendShares(adMoney),
      "News tone": newsShares(newsTone),
    }),
    [avg, social, adMoney, newsTone],
  );

  const blendSignals = useMemo(
    () => ({
      polls: pollShares(avg),
      social: socialShares(social),
      adspend: adSpendShares(adMoney),
      news: newsShares(newsTone),
    }),
    [avg, social, adMoney, newsTone],
  );
```

Add imports at top:

```tsx
import { Witnesses } from "./witnesses";
import { BlendLab } from "./blend-lab";
import { pollShares, socialShares, adSpendShares, newsShares } from "@/lib/forecast-signals";
```

- [ ] **Step 2: Render Act 2 + Act 3** — replace the existing social-reach section placement so the flow reads Act1 (polls+odds) → Act2 (Witnesses) → Act3 (BlendLab) → the existing social-reach + debate/vs-Tiffany sections become supporting detail under Act 2 (leave them; they deepen individual witnesses). Insert right before the closing wrapper:

```tsx
      <Witnesses signals={witnessSignals} />
      <BlendLab signals={blendSignals} />
```

- [ ] **Step 3: Add act framing copy in `page.tsx`** — under the existing hero `<p>`, add a one-line orientation so the page reads as a lesson:

```tsx
      <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        A three-part lesson: a lead is not a lock · the witnesses disagree · you be the forecaster.
      </p>
```

- [ ] **Step 4: Verify build + tests**

Run: `npx vitest run src/lib/signals.test.ts src/lib/forecast-signals.test.ts src/lib/forecast.test.ts convex/newsTone.test.ts && npx tsc --noEmit && npx eslint src/components/forecast src/lib/signals.ts src/lib/forecast-signals.ts convex/newsTone.ts`
Expected: all green.

Run: `npx next build` — expected: `/forecast` compiles.

- [ ] **Step 5: Verify the production build (branch — do NOT deploy)**

Run: `npx next build` — expected: compiles, `/forecast` route builds. This is the branch-scoped completion bar for this task.

**Deploy is DEFERRED to post-merge (controller-run), not part of this task.** The agreed flow is: branch → final whole-branch review → merge to main → deploy as usual. When that happens the controller (not a task subagent) will:
- Convex first (schema + newsTone): `git stash push -q -m wip -- convex/voterHelp.ts && npx convex deploy --yes && git stash pop -q`
- Seed tone once: `npx convex run newsToneClassify:classifyPendingArticles '{"limit":25}' --prod`  *(note: `newsToneClassify`, not `newsTone` — the classifier is in the split `"use node"` file)*
- Frontend: clean-worktree `vercel --prod` (see `docs/HANDOFF-2026-07-31-forecast-social.md`).
- Load `https://badgerbrief.org/forecast` in a browser: confirm Act 2 shows four disagreeing share bars, Act 3 sliders re-order the field and the leader flips when polls weight is dropped, turnout toggle tilts, and NO composite number is printed anywhere.

- [ ] **Step 6: Commit**

```bash
git add src/components/forecast/forecast-experience.tsx src/app/forecast/page.tsx
git commit -m "feat(forecast): assemble 3-act forecasting class (witnesses + blend lab)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 3-act structure → Tasks 5, 6, 7 ✓
- Math contract (toShares/blend/rank/turnout) → Tasks 1, 2 ✓
- Signal sources (polls/social/adspend live; news new) → Tasks 5 (builders), 3-4 (news) ✓
- News-tone classifier (rubric toward candidate, low-conf→neutral, linked headlines, no bias bands) → Tasks 3, 4 ✓
- No-quotable-score rule → Task 6 (ordering+bar only), Global Constraints ✓
- Edge cases (missing signal drops out / renormalize; no data yet; classifier failure) → Task 1 blend filter, Task 5 "no data yet", Task 4 try/catch ✓
- Turnout illustrative → Task 2 + Task 6 copy ✓
- Testing → Tasks 1-5 TDD; 6-7 build/browser ✓

**Placeholder scan:** none — every code step has real content; the only manual steps are the LLM action (unavoidable integration) and the browser verify.

**Type consistency:** `Shares`, `SignalKey`, `TurnoutScenario` defined in Task 1-2 and consumed unchanged in 5-7. `newsToneForRace` return shape defined in Task 3 and consumed by `newsShares` (Task 5) — fields `positive`/`negative` match. `adMoneyForRace().candidates[].totalSpend` matches Task 5 `adSpendShares`. Witness keys ("Polls"/"Social reach"/"Ad spend"/"News tone") consistent between Task 5 component and Task 7 wiring.

**One known integration risk (flagged, not a placeholder):** Task 4's `"use node"` + non-node exports in one file may need the file split noted in Task 4 Step 3. The split pattern is specified.
