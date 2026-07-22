# Sponsor Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give voters a dedicated `/sponsors/[key]` page that explains who an advertiser/PAC really is and who it backs or attacks, enriched from OpenFEC (exact facts, auto-published) + your own ad data + Firecrawl (a human-gated narrative).

**Architecture:** One enrichment action writes the existing `sponsors` row in three trust tiers — OpenFEC exact facts and a support/attack scorecard publish automatically; a Firecrawl-drafted narrative publishes only after a human approves it. Pure parse/shape helpers (fixture-tested) sit under thin `fetch` wrappers; a new server-rendered route renders the tiers.

**Tech Stack:** Convex (actions/queries/mutations), OpenFEC REST API, Firecrawl v2 (`/v2/scrape`, plain `fetch`), Next.js App Router (server components), Tailwind + DESIGN.md semantic tokens, vitest + convex-test.

## Global Constraints

- Firecrawl: **plain `fetch`, no SDK**; `Authorization: Bearer ${process.env.FIRECRAWL_API_KEY}`; base `https://api.firecrawl.dev/v2`.
- OpenFEC: `https://api.open.fec.gov/v1`; key `process.env.OPENFEC_API_KEY ?? "DEMO_KEY"`.
- Perplexity fallback already exists: `perplexityDescribe` in `convex/sponsors.ts` (`PERPLEXITY_API_KEY`, model `sonar`).
- Sponsor identity key is `normalizeSponsorKey(name)` from `convex/lib/sponsors.ts` (`[a-z0-9 ]`, single-spaced) — the join key between `ads.pageOrCommittee` and `sponsors`.
- `disclosesDonors`: `true` when an FEC committee matches; `false` (dark money) when none does.
- UI: neo-brutalist per `DESIGN.md` — semantic tokens only (`bg-card`, `border-border`, `text-muted-foreground`, `shadow-[var(--shadow-brutal)]`), **no hex, no `dark:` classes**, zero radius. Every fact links to its source.
- Admin mutations/queries require the `admin` role via the existing `requireAdmin` in `convex/sponsors.ts`.
- Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- Tests: pure helpers unit-test without convex-test; queries/mutations use `convexTest(schema, modules)` (see `convex/adMoney.test.ts`). Run with `pnpm test`.
- Commit after every task with a conventional message.

---

### Task 1: Extend the `sponsors` schema

**Files:**
- Modify: `convex/schema.ts` (the `sponsors: defineTable({...})` block, ~lines 218-240)

**Interfaces:**
- Produces: new optional `sponsors` fields consumed by Tasks 4, 7, 8, 10, 12: `narrative?: string`, `narrativeStatus?: "draft"|"approved"`, `leadership?: {name,role}[]`, `totalSpent?: number`, `independentExpenditures?: {candidate, office?, supportOppose, amount}[]`, `financialsAsOf?: string`, `enrichedAt?: number`.

- [ ] **Step 1: Add the fields**

In `convex/schema.ts`, inside `sponsors: defineTable({ ... })`, add before `reviewStatus`:

```ts
    narrative: v.optional(v.string()),
    narrativeStatus: v.optional(
      v.union(v.literal("draft"), v.literal("approved")),
    ),
    leadership: v.optional(
      v.array(v.object({ name: v.string(), role: v.string() })),
    ),
    totalSpent: v.optional(v.number()),
    independentExpenditures: v.optional(
      v.array(
        v.object({
          candidate: v.string(),
          office: v.optional(v.string()),
          supportOppose: v.union(v.literal("support"), v.literal("oppose")),
          amount: v.number(),
        }),
      ),
    ),
    financialsAsOf: v.optional(v.string()),
    enrichedAt: v.optional(v.number()),
```

- [ ] **Step 2: Typecheck the generated types**

Run: `npx convex codegen && npx tsc --noEmit -p tsconfig.json`
Expected: no errors; `Doc<"sponsors">` now includes the new fields.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(sponsors): extend schema for tiered enrichment fields"
```

---

### Task 2: OpenFEC exact-facts helper (`convex/lib/openfecEnrich.ts`)

**Files:**
- Create: `convex/lib/openfecEnrich.ts`
- Create: `convex/lib/fixtures/openfec-totals.json`, `openfec-schedule-a.json`, `openfec-schedule-e.json`
- Test: `convex/lib/openfecEnrich.test.ts`

**Interfaces:**
- Consumes: `SponsorLean`, `fecCommitteeKind`, `leanFromParty` from `convex/lib/sponsors.ts`.
- Produces (consumed by Task 4):
  ```ts
  export type OpenFecFacts = {
    fecCommitteeId?: string; kind?: string; lean?: SponsorLean;
    disclosesDonors: boolean; totalRaised?: number; totalSpent?: number;
    topDonors?: { name: string; amount: number }[];
    independentExpenditures?: { candidate: string; office?: string; supportOppose: "support"|"oppose"; amount: number }[];
    financialsAsOf?: string; sources: { label: string; url: string }[];
  };
  export function parseCommitteeTotals(json: unknown): { totalRaised?: number; totalSpent?: number; financialsAsOf?: string };
  export function parseTopDonors(json: unknown, limit?: number): { name: string; amount: number }[];
  export function parseIndependentExpenditures(json: unknown, limit?: number): OpenFecFacts["independentExpenditures"];
  export async function fetchOpenFecFacts(fecCommitteeId: string): Promise<OpenFecFacts>;
  ```

- [ ] **Step 1: Write fixtures**

`convex/lib/fixtures/openfec-totals.json`:
```json
{ "results": [{ "receipts": 6155000, "disbursements": 5400000, "coverage_end_date": "2026-06-30T00:00:00" }] }
```
`convex/lib/fixtures/openfec-schedule-a.json`:
```json
{ "results": [
  { "contributor_name": "Jane Q. Donor", "contribution_receipt_amount": 250000 },
  { "contributor_name": "Acme LLC", "contribution_receipt_amount": 100000 }
] }
```
`convex/lib/fixtures/openfec-schedule-e.json`:
```json
{ "results": [
  { "candidate_name": "TIFFANY, TOM", "candidate_office": "H", "support_oppose_indicator": "O", "expenditure_amount": 40000 },
  { "candidate_name": "TIFFANY, TOM", "candidate_office": "H", "support_oppose_indicator": "O", "expenditure_amount": 20000 },
  { "candidate_name": "COOKE, REBECCA", "candidate_office": "H", "support_oppose_indicator": "S", "expenditure_amount": 15000 }
] }
```

- [ ] **Step 2: Write the failing test**

`convex/lib/openfecEnrich.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import totals from "./fixtures/openfec-totals.json";
import scheduleA from "./fixtures/openfec-schedule-a.json";
import scheduleE from "./fixtures/openfec-schedule-e.json";
import { parseCommitteeTotals, parseTopDonors, parseIndependentExpenditures } from "./openfecEnrich";

describe("openfecEnrich parsers", () => {
  test("totals pull receipts/disbursements + coverage date", () => {
    expect(parseCommitteeTotals(totals)).toEqual({
      totalRaised: 6155000, totalSpent: 5400000, financialsAsOf: "2026-06-30",
    });
  });
  test("top donors sorted desc, capped", () => {
    expect(parseTopDonors(scheduleA, 1)).toEqual([{ name: "Jane Q. Donor", amount: 250000 }]);
  });
  test("independent expenditures grouped by candidate + support/oppose, summed", () => {
    const ies = parseIndependentExpenditures(scheduleE);
    expect(ies).toContainEqual({ candidate: "TIFFANY, TOM", office: "H", supportOppose: "oppose", amount: 60000 });
    expect(ies).toContainEqual({ candidate: "COOKE, REBECCA", office: "H", supportOppose: "support", amount: 15000 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test convex/lib/openfecEnrich.test.ts`
Expected: FAIL — module `./openfecEnrich` not found.

- [ ] **Step 4: Implement**

`convex/lib/openfecEnrich.ts`:
```ts
import { fecCommitteeKind, leanFromParty, type SponsorLean } from "./sponsors";

export type OpenFecFacts = {
  fecCommitteeId?: string; kind?: string; lean?: SponsorLean;
  disclosesDonors: boolean; totalRaised?: number; totalSpent?: number;
  topDonors?: { name: string; amount: number }[];
  independentExpenditures?: { candidate: string; office?: string; supportOppose: "support" | "oppose"; amount: number }[];
  financialsAsOf?: string; sources: { label: string; url: string }[];
};

const OPENFEC = "https://api.open.fec.gov/v1";
const key = () => process.env.OPENFEC_API_KEY ?? "DEMO_KEY";

export function parseCommitteeTotals(json: unknown) {
  const r = (json as { results?: any[] }).results?.[0];
  if (!r) return {};
  return {
    totalRaised: typeof r.receipts === "number" ? r.receipts : undefined,
    totalSpent: typeof r.disbursements === "number" ? r.disbursements : undefined,
    financialsAsOf: typeof r.coverage_end_date === "string" ? r.coverage_end_date.slice(0, 10) : undefined,
  };
}

export function parseTopDonors(json: unknown, limit = 10) {
  const rows = (json as { results?: any[] }).results ?? [];
  return rows
    .map((r) => ({ name: String(r.contributor_name ?? "").trim(), amount: Number(r.contribution_receipt_amount ?? 0) }))
    .filter((d) => d.name && d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function parseIndependentExpenditures(json: unknown, limit = 10): OpenFecFacts["independentExpenditures"] {
  const rows = (json as { results?: any[] }).results ?? [];
  const by = new Map<string, { candidate: string; office?: string; supportOppose: "support" | "oppose"; amount: number }>();
  for (const r of rows) {
    const candidate = String(r.candidate_name ?? "").trim();
    if (!candidate) continue;
    const supportOppose = String(r.support_oppose_indicator ?? "").toUpperCase() === "S" ? "support" : "oppose";
    const office = r.candidate_office ? String(r.candidate_office) : undefined;
    const k = `${candidate}|${supportOppose}`;
    const cur = by.get(k) ?? { candidate, office, supportOppose, amount: 0 };
    cur.amount += Number(r.expenditure_amount ?? 0);
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) return { results: [] };
  return res.json();
}

/** Fetch all OpenFEC exact facts for a known committee id. */
export async function fetchOpenFecFacts(fecCommitteeId: string): Promise<OpenFecFacts> {
  const k = key();
  const [committee, totals, scheduleA, scheduleE] = await Promise.all([
    getJson(`${OPENFEC}/committee/${encodeURIComponent(fecCommitteeId)}/?api_key=${k}`),
    getJson(`${OPENFEC}/committee/${encodeURIComponent(fecCommitteeId)}/totals/?api_key=${k}&per_page=1&sort=-cycle`),
    getJson(`${OPENFEC}/schedules/schedule_a/?committee_id=${fecCommitteeId}&api_key=${k}&per_page=10&sort=-contribution_receipt_amount`),
    getJson(`${OPENFEC}/schedules/schedule_e/?committee_id=${fecCommitteeId}&api_key=${k}&per_page=100&sort=-expenditure_amount`),
  ]);
  const c = (committee as { results?: any[] }).results?.[0];
  const { kind } = fecCommitteeKind(c?.committee_type);
  return {
    fecCommitteeId,
    kind: c ? kind : undefined,
    lean: leanFromParty(c?.party),
    disclosesDonors: true,
    ...parseCommitteeTotals(totals),
    topDonors: parseTopDonors(scheduleA),
    independentExpenditures: parseIndependentExpenditures(scheduleE),
    sources: [{ label: "fec.gov", url: `https://www.fec.gov/data/committee/${fecCommitteeId}/` }],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test convex/lib/openfecEnrich.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add convex/lib/openfecEnrich.ts convex/lib/openfecEnrich.test.ts convex/lib/fixtures/openfec-*.json
git commit -m "feat(sponsors): OpenFEC exact-facts parsers + fetch"
```

---

### Task 3: Firecrawl narrative helper (`convex/lib/firecrawlSponsor.ts`)

**Files:**
- Create: `convex/lib/firecrawlSponsor.ts`
- Create: `convex/lib/fixtures/firecrawl-sponsor.json` (a per-URL `/v2/scrape` json result)
- Test: `convex/lib/firecrawlSponsor.test.ts`

**Interfaces:**
- Produces (consumed by Task 4):
  ```ts
  export type SponsorNarrative = {
    narrative?: string;
    leadership?: { name: string; role: string }[];
    sources: { label: string; url: string }[];
  };
  export function buildSourceUrls(name: string): string[];
  export function mergeNarrative(results: { url: string; json: { narrative?: string; leadership?: {name:string;role:string}[] } | null }[]): SponsorNarrative;
  export async function fetchSponsorNarrative(name: string): Promise<SponsorNarrative>;
  ```

- [ ] **Step 1: Write the fixture**

`convex/lib/fixtures/firecrawl-sponsor.json` (shape of one `/v2/scrape` json-format response):
```json
{ "success": true, "data": { "json": {
  "narrative": "Americans for Prosperity is a conservative political advocacy group founded by the Koch network that spends on lower-tax and deregulation candidates.",
  "leadership": [{ "name": "Emily Seidel", "role": "CEO" }]
} } }
```

- [ ] **Step 2: Write the failing test**

`convex/lib/firecrawlSponsor.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { buildSourceUrls, mergeNarrative } from "./firecrawlSponsor";

describe("firecrawlSponsor", () => {
  test("buildSourceUrls includes ProPublica, OpenSecrets, Ballotpedia, Wikipedia", () => {
    const urls = buildSourceUrls("Americans for Prosperity");
    expect(urls.some((u) => u.includes("projects.propublica.org/nonprofits"))).toBe(true);
    expect(urls.some((u) => u.includes("opensecrets.org"))).toBe(true);
    expect(urls.some((u) => u.includes("ballotpedia.org"))).toBe(true);
    expect(urls.some((u) => u.includes("wikipedia.org"))).toBe(true);
  });
  test("mergeNarrative takes first narrative, unions leadership, records sources", () => {
    const merged = mergeNarrative([
      { url: "https://opensecrets.org/x", json: { narrative: "First.", leadership: [{ name: "A", role: "CEO" }] } },
      { url: "https://ballotpedia.org/y", json: { narrative: "Second.", leadership: [{ name: "B", role: "Treasurer" }] } },
      { url: "https://dead.example/z", json: null },
    ]);
    expect(merged.narrative).toBe("First.");
    expect(merged.leadership).toEqual([{ name: "A", role: "CEO" }, { name: "B", role: "Treasurer" }]);
    expect(merged.sources.map((s) => s.url)).toEqual(["https://opensecrets.org/x", "https://ballotpedia.org/y"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test convex/lib/firecrawlSponsor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`convex/lib/firecrawlSponsor.ts`:
```ts
export type SponsorNarrative = {
  narrative?: string;
  leadership?: { name: string; role: string }[];
  sources: { label: string; url: string }[];
};

const SCHEMA = {
  type: "object",
  properties: {
    narrative: { type: "string", description: "2-4 neutral sentences: what kind of group this is, its agenda, who funds/backs it. No opinion." },
    leadership: { type: "array", items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } } } },
  },
};

const PROMPT =
  "For a nonpartisan voter guide, extract a neutral factual profile of this political ad sponsor: what kind of organization it is, its agenda, and who funds or leads it. Only use what the page states.";

/** Ordered civic-source allowlist for one sponsor name. */
export function buildSourceUrls(name: string): string[] {
  const q = encodeURIComponent(name);
  const wiki = name.trim().replace(/\s+/g, "_");
  return [
    `https://projects.propublica.org/nonprofits/search?q=${q}`,
    `https://www.opensecrets.org/search?q=${q}&type=pacs`,
    `https://ballotpedia.org/${wiki}`,
    `https://en.wikipedia.org/wiki/${wiki}`,
  ];
}

export function mergeNarrative(
  results: { url: string; json: { narrative?: string; leadership?: { name: string; role: string }[] } | null }[],
): SponsorNarrative {
  const live = results.filter((r) => r.json);
  const narrative = live.map((r) => r.json!.narrative).find((n) => n && n.trim());
  const leadership: { name: string; role: string }[] = [];
  const seen = new Set<string>();
  for (const r of live) {
    for (const p of r.json!.leadership ?? []) {
      const k = p.name.toLowerCase();
      if (p.name && !seen.has(k)) { seen.add(k); leadership.push(p); }
    }
  }
  const sources = live.map((r) => {
    let label = r.url;
    try { label = new URL(r.url).hostname.replace(/^www\./, ""); } catch { /* keep */ }
    return { label, url: r.url };
  });
  return { narrative, leadership: leadership.length ? leadership : undefined, sources };
}

/** Scrape the top allowlist URLs with Firecrawl json-format and merge. */
export async function fetchSponsorNarrative(name: string): Promise<SponsorNarrative> {
  if (!process.env.FIRECRAWL_API_KEY) return { sources: [] };
  const urls = buildSourceUrls(name).slice(0, 3);
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: [{ type: "json", prompt: PROMPT, schema: SCHEMA }] }),
        });
        if (!res.ok) return { url, json: null };
        const body = (await res.json()) as { data?: { json?: { narrative?: string; leadership?: { name: string; role: string }[] } } };
        return { url, json: body.data?.json ?? null };
      } catch {
        return { url, json: null };
      }
    }),
  );
  return mergeNarrative(results);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test convex/lib/firecrawlSponsor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add convex/lib/firecrawlSponsor.ts convex/lib/firecrawlSponsor.test.ts convex/lib/fixtures/firecrawl-sponsor.json
git commit -m "feat(sponsors): Firecrawl narrative allowlist + merge"
```

---

### Task 4: Enrichment orchestration (`convex/sponsorEnrich.ts`)

**Files:**
- Create: `convex/sponsorEnrich.ts`
- Modify: `convex/sponsors.ts` (add `upsertEnrichment` internal mutation)

**Interfaces:**
- Consumes: `fetchOpenFecFacts` (Task 2), `fetchSponsorNarrative` (Task 3), `searchFecCommittees`/`perplexityDescribe` (existing `convex/sponsors.ts`), `normalizeSponsorKey`.
- Produces (consumed by Tasks 5, 12): `enrichSponsor` action `{ advertiser: string, fecCommitteeId?: string } → { key: string }`; `internal.sponsors.upsertEnrichment` mutation.

- [ ] **Step 1: Add the internal upsert mutation to `convex/sponsors.ts`**

```ts
import { internalMutation } from "./_generated/server";

/** Enrichment writer: exact facts publish immediately; a fresh narrative lands
 * as a draft (narrativeStatus:"draft") unless one is already approved. */
export const upsertEnrichment = internalMutation({
  args: {
    key: v.string(), displayName: v.string(),
    kind: v.optional(v.string()), lean: v.optional(leanValidator),
    fecCommitteeId: v.optional(v.string()), disclosesDonors: v.optional(v.boolean()),
    totalRaised: v.optional(v.number()), totalSpent: v.optional(v.number()),
    topDonors: v.optional(v.array(v.object({ name: v.string(), amount: v.number() }))),
    independentExpenditures: v.optional(v.array(v.object({
      candidate: v.string(), office: v.optional(v.string()),
      supportOppose: v.union(v.literal("support"), v.literal("oppose")), amount: v.number(),
    }))),
    financialsAsOf: v.optional(v.string()),
    narrativeDraft: v.optional(v.string()),
    leadership: v.optional(v.array(v.object({ name: v.string(), role: v.string() }))),
    sources: v.array(v.object({ label: v.string(), url: v.string() })),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const keepNarrative = existing?.narrativeStatus === "approved";
    const doc = {
      key: a.key, displayName: existing?.displayName ?? a.displayName,
      kind: a.kind ?? existing?.kind, lean: a.lean ?? existing?.lean,
      summary: existing?.summary, fecCommitteeId: a.fecCommitteeId ?? existing?.fecCommitteeId,
      disclosesDonors: a.disclosesDonors ?? existing?.disclosesDonors,
      topDonors: a.topDonors, totalRaised: a.totalRaised, totalSpent: a.totalSpent,
      independentExpenditures: a.independentExpenditures, financialsAsOf: a.financialsAsOf,
      leadership: keepNarrative ? existing?.leadership : a.leadership,
      narrative: keepNarrative ? existing?.narrative : a.narrativeDraft,
      narrativeStatus: keepNarrative ? existing?.narrativeStatus : (a.narrativeDraft ? ("draft" as const) : existing?.narrativeStatus),
      sources: a.sources.length ? a.sources : (existing?.sources ?? []),
      reviewStatus: existing?.reviewStatus ?? ("draft" as const),
      enrichedAt: Date.now(), updatedAt: Date.now(),
    };
    if (existing) { await ctx.db.patch(existing._id, doc); return existing._id; }
    return ctx.db.insert("sponsors", doc);
  },
});
```

- [ ] **Step 2: Write the enrich action**

`convex/sponsorEnrich.ts`:
```ts
"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeSponsorKey } from "./lib/sponsors";
import { fetchOpenFecFacts } from "./lib/openfecEnrich";
import { fetchSponsorNarrative } from "./lib/firecrawlSponsor";

/** Full enrichment for one sponsor: OpenFEC exact facts (auto-published) +
 * Firecrawl narrative (draft). Resolves the committee by id or name search. */
export const enrichSponsor = action({
  args: { advertiser: v.string(), fecCommitteeId: v.optional(v.string()) },
  handler: async (ctx, { advertiser, fecCommitteeId }): Promise<{ key: string }> => {
    const key = normalizeSponsorKey(advertiser);
    let committeeId = fecCommitteeId;
    if (!committeeId) {
      const matches = await ctx.runAction(internal.sponsorEnrich.searchCommittees, { name: advertiser });
      committeeId = matches[0]?.fecCommitteeId;
    }
    const [facts, narrative] = await Promise.all([
      committeeId ? fetchOpenFecFacts(committeeId) : Promise.resolve(null),
      fetchSponsorNarrative(advertiser),
    ]);
    await ctx.runMutation(internal.sponsors.upsertEnrichment, {
      key, displayName: advertiser,
      kind: facts?.kind, lean: facts?.lean, fecCommitteeId: committeeId,
      disclosesDonors: facts ? true : false,
      totalRaised: facts?.totalRaised, totalSpent: facts?.totalSpent,
      topDonors: facts?.topDonors, independentExpenditures: facts?.independentExpenditures,
      financialsAsOf: facts?.financialsAsOf,
      narrativeDraft: narrative.narrative, leadership: narrative.leadership,
      sources: [...(facts?.sources ?? []), ...narrative.sources],
    });
    return { key };
  },
});
```

- [ ] **Step 3: Expose committee search as an internal action**

The existing `searchFecCommittees` is a private function in `convex/sponsors.ts`. Export a thin internal action wrapper in `convex/sponsorEnrich.ts`:
```ts
import { fecCommitteeKind, leanFromParty } from "./lib/sponsors";
export const searchCommittees = action({
  args: { name: v.string() },
  handler: async (_ctx, { name }) => {
    const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
    const res = await fetch(`https://api.open.fec.gov/v1/committees/?q=${encodeURIComponent(name)}&api_key=${apiKey}&per_page=5&sort=-receipts`);
    if (!res.ok) return [] as { fecCommitteeId: string }[];
    const data = (await res.json()) as { results?: { committee_id: string }[] };
    return (data.results ?? []).map((c) => ({ fecCommitteeId: c.committee_id }));
  },
});
```
(Mark it `internal` by re-exporting via `internal.sponsorEnrich.searchCommittees` — Convex exposes `action`s under `internal` when not referenced publicly; if lint requires, define with `internalAction` from `./_generated/server`.)

- [ ] **Step 4: Typecheck + smoke**

Run: `npx convex codegen && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/sponsorEnrich.ts convex/sponsors.ts convex/_generated
git commit -m "feat(sponsors): enrichSponsor orchestration + tiered upsert"
```

---

### Task 5: Batch enrichment + cron

**Files:**
- Modify: `convex/sponsorEnrich.ts` (add `enrichOutsideGroups`)
- Modify: `convex/crons.ts` (register monthly)

**Interfaces:**
- Consumes: `enrichSponsor`, `ads` table, `normalizeSponsorKey`, `fecCommitteeKind`.
- Produces: `enrichOutsideGroups` action `{ limit?: number, staleDays?: number }`.

- [ ] **Step 1: Add a query for enrich candidates (in `convex/sponsors.ts`)**

```ts
/** Distinct sponsor names by tracked spend, newest-stale first — enrichment queue. */
export const sponsorsToEnrich = internalQuery({
  args: { limit: v.number(), staleDays: v.number() },
  handler: async (ctx, { limit, staleDays }) => {
    const ads = await ctx.db.query("ads").collect();
    const spendBy = new Map<string, { name: string; spend: number }>();
    for (const ad of ads) {
      const name = ad.pageOrCommittee;
      const key = normalizeSponsorKey(name);
      const mid = ((ad.spendLower ?? 0) + (ad.spendUpper ?? 0)) / 2;
      const cur = spendBy.get(key) ?? { name, spend: 0 };
      cur.spend += mid; spendBy.set(key, cur);
    }
    const cutoff = Date.now() - staleDays * 86_400_000;
    const out: { name: string; key: string }[] = [];
    for (const [key, { name, spend }] of [...spendBy.entries()].sort((a, b) => b[1].spend - a[1].spend)) {
      const existing = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (existing?.enrichedAt && existing.enrichedAt > cutoff) continue;
      // Skip candidate own-committees once enriched (kind set); include unknowns.
      if (existing?.kind === "Candidate committee") continue;
      out.push({ name, key });
      if (out.length >= limit) break;
    }
    return out;
  },
});
```
Add `internalQuery` to the imports in `convex/sponsors.ts`.

- [ ] **Step 2: Add the batch action to `convex/sponsorEnrich.ts`**

```ts
export const enrichOutsideGroups = action({
  args: { limit: v.optional(v.number()), staleDays: v.optional(v.number()) },
  handler: async (ctx, { limit = 25, staleDays = 30 }) => {
    const targets = await ctx.runQuery(internal.sponsors.sponsorsToEnrich, { limit, staleDays });
    for (const t of targets) {
      await ctx.runAction(internal.sponsorEnrich.enrichSponsor, { advertiser: t.name });
    }
    return { enriched: targets.length };
  },
});
```

- [ ] **Step 3: Register the cron in `convex/crons.ts`**

```ts
crons.monthly("enrich sponsors", { day: 1, hourUTC: 8, minuteUTC: 0 }, internal.sponsorEnrich.enrichOutsideGroups, { limit: 50, staleDays: 30 });
```

- [ ] **Step 4: Typecheck**

Run: `npx convex codegen && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/sponsorEnrich.ts convex/sponsors.ts convex/crons.ts convex/_generated
git commit -m "feat(sponsors): monthly batch enrichment by spend"
```

---

### Task 6: Support/attack scorecard query

**Files:**
- Modify: `convex/sponsors.ts` (add `sponsorScorecard`)
- Test: `convex/sponsors.test.ts` (create)

**Interfaces:**
- Produces (consumed by Task 10):
  ```ts
  sponsorScorecard({ key: string }) → {
    supported: { candidateSlug: string; raceId?: string; spend: number; adCount: number }[];
    attacked: { candidateSlug: string; raceId?: string; spend: number; adCount: number }[];
  }
  ```

- [ ] **Step 1: Write the failing test**

`convex/sponsors.test.ts`:
```ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

describe("sponsorScorecard", () => {
  test("rolls this sponsor's ads into supported/attacked with summed spend", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const base = { platform: "meta" as const, firstSeenAt: 0, lastSeenAt: 0, pageOrCommittee: "A Better Wisconsin Together" };
      await ctx.db.insert("ads", { ...base, platformAdId: "a1", raceId: "R1", candidateSlug: "tom-tiffany", stance: "oppose", spendLower: 60000, spendUpper: 80000 });
      await ctx.db.insert("ads", { ...base, platformAdId: "a2", raceId: "R1", candidateSlug: "tom-tiffany", stance: "oppose", spendLower: 20000, spendUpper: 20000 });
      await ctx.db.insert("ads", { ...base, platformAdId: "a3", raceId: "R2", candidateSlug: "rebecca-cooke", stance: "support", spendLower: 10000, spendUpper: 20000 });
      // Different sponsor — must be excluded.
      await ctx.db.insert("ads", { platform: "meta", firstSeenAt: 0, lastSeenAt: 0, platformAdId: "b1", pageOrCommittee: "Other PAC", candidateSlug: "x", stance: "support", spendLower: 1, spendUpper: 1 });
    });
    const r = await t.query(api.sponsors.sponsorScorecard, { key: "a better wisconsin together" });
    expect(r.attacked).toEqual([{ candidateSlug: "tom-tiffany", raceId: "R1", spend: 80000, adCount: 2 }]);
    expect(r.supported).toEqual([{ candidateSlug: "rebecca-cooke", raceId: "R2", spend: 15000, adCount: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test convex/sponsors.test.ts`
Expected: FAIL — `sponsorScorecard` is not a function.

- [ ] **Step 3: Implement in `convex/sponsors.ts`**

```ts
export const sponsorScorecard = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const ads = await ctx.db.query("ads").collect();
    const mine = ads.filter((a) => a.candidateSlug && a.stance && normalizeSponsorKey(a.pageOrCommittee) === key);
    const roll = (stance: "support" | "oppose") => {
      const by = new Map<string, { candidateSlug: string; raceId?: string; spend: number; adCount: number }>();
      for (const a of mine.filter((x) => x.stance === stance)) {
        const mid = ((a.spendLower ?? 0) + (a.spendUpper ?? 0)) / 2;
        const cur = by.get(a.candidateSlug!) ?? { candidateSlug: a.candidateSlug!, raceId: a.raceId, spend: 0, adCount: 0 };
        cur.spend += mid; cur.adCount += 1; by.set(a.candidateSlug!, cur);
      }
      return [...by.values()].sort((x, y) => y.spend - x.spend);
    };
    return { supported: roll("support"), attacked: roll("oppose") };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test convex/sponsors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/sponsors.ts convex/sponsors.test.ts
git commit -m "feat(sponsors): support/attack scorecard from own ad data"
```

---

### Task 7: Public profile query (the tiered gate)

**Files:**
- Modify: `convex/sponsors.ts` (add `sponsorPublicProfile`)
- Test: `convex/sponsors.test.ts` (append)

**Interfaces:**
- Produces (consumed by Task 10): `sponsorPublicProfile({ key }) → PublicProfile | null` where narrative fields are present ONLY when approved:
  ```ts
  type PublicProfile = {
    displayName: string; kind?: string; lean?: string; disclosesDonors?: boolean;
    totalRaised?: number; totalSpent?: number; topDonors?: {name,amount}[];
    independentExpenditures?: {candidate,office?,supportOppose,amount}[]; financialsAsOf?: string;
    sources: {label,url}[];
    narrative?: string; leadership?: {name,role}[]; // omitted unless narrativeStatus==="approved"
  };
  ```

- [ ] **Step 1: Append the failing test to `convex/sponsors.test.ts`**

```ts
describe("sponsorPublicProfile tiered gate", () => {
  test("exact facts always public; narrative hidden until approved", async () => {
    const t = setup();
    const baseDoc = { key: "acme pac", displayName: "Acme PAC", disclosesDonors: true, totalRaised: 100, sources: [], reviewStatus: "draft" as const, updatedAt: 0, enrichedAt: 1, narrative: "Secret story.", leadership: [{ name: "A", role: "CEO" }] };
    await t.run(async (ctx) => { await ctx.db.insert("sponsors", { ...baseDoc, narrativeStatus: "draft" as const }); });
    let p = await t.query(api.sponsors.sponsorPublicProfile, { key: "acme pac" });
    expect(p?.totalRaised).toBe(100);
    expect(p?.narrative).toBeUndefined();
    expect(p?.leadership).toBeUndefined();
    await t.run(async (ctx) => {
      const row = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", "acme pac")).unique();
      await ctx.db.patch(row!._id, { narrativeStatus: "approved" });
    });
    p = await t.query(api.sponsors.sponsorPublicProfile, { key: "acme pac" });
    expect(p?.narrative).toBe("Secret story.");
    expect(p?.leadership).toEqual([{ name: "A", role: "CEO" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test convex/sponsors.test.ts`
Expected: FAIL — `sponsorPublicProfile` not a function.

- [ ] **Step 3: Implement in `convex/sponsors.ts`**

```ts
export const sponsorPublicProfile = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const s = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!s || !s.enrichedAt) return null;
    const base = {
      displayName: s.displayName, kind: s.kind, lean: s.lean, disclosesDonors: s.disclosesDonors,
      totalRaised: s.totalRaised, totalSpent: s.totalSpent, topDonors: s.topDonors,
      independentExpenditures: s.independentExpenditures, financialsAsOf: s.financialsAsOf,
      sources: s.sources,
    };
    if (s.narrativeStatus === "approved") {
      return { ...base, narrative: s.narrative, leadership: s.leadership };
    }
    return base;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test convex/sponsors.test.ts`
Expected: PASS (scorecard + tiered-gate).

- [ ] **Step 5: Commit**

```bash
git add convex/sponsors.ts convex/sponsors.test.ts
git commit -m "feat(sponsors): public profile query with narrative gate"
```

---

### Task 8: Narrative review — approve mutation + pending queue

**Files:**
- Modify: `convex/sponsors.ts` (add `approveNarrative`, `saveNarrativeDraft`, `pendingNarratives`)

**Interfaces:**
- Produces (consumed by Task 12): `saveNarrativeDraft({ key, narrative, leadership? })`, `approveNarrative({ key })`, `pendingNarratives() → { key, displayName }[]` (all admin-gated).

- [ ] **Step 1: Implement (admin-gated; reuse `requireAdmin`)**

```ts
export const saveNarrativeDraft = mutation({
  args: { key: v.string(), narrative: v.string(), leadership: v.optional(v.array(v.object({ name: v.string(), role: v.string() }))) },
  handler: async (ctx, { key, narrative, leadership }) => {
    await requireAdmin(ctx);
    const s = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!s) throw new Error("no sponsor row to edit");
    await ctx.db.patch(s._id, { narrative, leadership, narrativeStatus: "draft", updatedAt: Date.now() });
  },
});

export const approveNarrative = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAdmin(ctx);
    const s = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!s) throw new Error("no sponsor row to approve");
    await ctx.db.patch(s._id, { narrativeStatus: "approved", updatedAt: Date.now() });
  },
});

export const pendingNarratives = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("sponsors").collect();
    return rows.filter((s) => s.narrativeStatus === "draft" && s.narrative)
      .map((s) => ({ key: s.key, displayName: s.displayName }));
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx convex codegen && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/sponsors.ts convex/_generated
git commit -m "feat(sponsors): narrative draft-save, approve, pending queue"
```

---

### Task 9: Page data wrappers + slug helpers

**Files:**
- Modify: `src/lib/data.ts` (add fetch wrappers)
- Modify: `src/lib/site.ts` (add `sponsorKeyToSlug`, `sponsorSlugToKey`)

**Interfaces:**
- Produces (consumed by Task 10): `getSponsorProfile(key)`, `getSponsorScorecard(key)`, `getSponsorAds(key)`, `sponsorKeyToSlug`, `sponsorSlugToKey`.

- [ ] **Step 1: Slug helpers in `src/lib/site.ts`**

Keys are `[a-z0-9 ]`; slug swaps spaces↔hyphens (lossless — keys never contain hyphens):
```ts
export const sponsorKeyToSlug = (key: string) => key.replace(/ /g, "-");
export const sponsorSlugToKey = (slug: string) => decodeURIComponent(slug).replace(/-/g, " ");
```

- [ ] **Step 2: Add a `sponsorAds` query to `convex/sponsors.ts`**

```ts
export const sponsorAds = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const ads = await ctx.db.query("ads").collect();
    return ads.filter((a) => normalizeSponsorKey(a.pageOrCommittee) === key)
      .sort((a, b) => (b.spendUpper ?? 0) - (a.spendUpper ?? 0));
  },
});
```

- [ ] **Step 3: Fetch wrappers in `src/lib/data.ts`**

```ts
export const getSponsorProfile = (key: string) => fetchQuery(api.sponsors.sponsorPublicProfile, { key });
export const getSponsorScorecard = (key: string) => fetchQuery(api.sponsors.sponsorScorecard, { key });
export const getSponsorAds = (key: string) => fetchQuery(api.sponsors.sponsorAds, { key });
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx convex codegen && npx tsc --noEmit -p tsconfig.json`
```bash
git add src/lib/data.ts src/lib/site.ts convex/sponsors.ts convex/_generated
git commit -m "feat(sponsors): page data wrappers + slug helpers"
```

---

### Task 10: The `/sponsors/[key]` page

**Files:**
- Create: `src/app/sponsors/[slug]/page.tsx`
- Create: `src/components/guide/sponsor-profile.tsx` (the sections)

**Interfaces:**
- Consumes: Task 9 wrappers, `candidateDirectory` (existing, for slug→name), `raceIdToSlug` (`src/lib/site.ts`).

- [ ] **Step 1: The section component `src/components/guide/sponsor-profile.tsx`**

Server component; renders the tiers. Money formatting reuses the `usd` pattern from `ads-analytics.tsx` (copy the small helper locally). Sections: header (name · kind · lean · dark-money warning) → who's behind it (narrative + leadership + sources, or "Profile in review") → the money (raised/spent, top donors or "does not disclose its funders", FEC as-of) → who they support/attack (scorecard rows linking to `/candidates/[slug]` and national IEs) → sources. Use `border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]`, `font-display` headings, `font-mono` stamps. Full component:

```tsx
import Link from "next/link";

type Profile = Awaited<ReturnType<typeof import("@/lib/data").getSponsorProfile>>;
type Scorecard = Awaited<ReturnType<typeof import("@/lib/data").getSponsorScorecard>>;

function usd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function SponsorProfile({
  profile, scorecard, names,
}: { profile: NonNullable<Profile>; scorecard: Scorecard; names: Record<string, string> }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl leading-none sm:text-4xl">{profile.displayName}</h1>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs font-bold uppercase tracking-widest">
          {profile.kind && <span className="border-2 border-border bg-card px-2 py-1">{profile.kind}</span>}
          {profile.disclosesDonors === false && (
            <span className="border-2 border-border bg-warning px-2 py-1 text-foreground">Does not disclose donors</span>
          )}
        </div>
      </header>

      {profile.narrative ? (
        <section>
          <h2 className="font-display text-xl">Who&apos;s behind it</h2>
          <p className="mt-2 max-w-2xl">{profile.narrative}</p>
          {profile.leadership && profile.leadership.length > 0 && (
            <ul className="mt-3 font-mono text-xs text-muted-foreground">
              {profile.leadership.map((l) => <li key={l.name}>{l.name} — {l.role}</li>)}
            </ul>
          )}
        </section>
      ) : (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Profile in review</p>
      )}

      <section>
        <h2 className="font-display text-xl">The money</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.disclosesDonors === false
            ? "This group does not disclose its funders."
            : `Raised ${profile.totalRaised ? usd(profile.totalRaised) : "—"} · spent ${profile.totalSpent ? usd(profile.totalSpent) : "—"}${profile.financialsAsOf ? ` (as of ${profile.financialsAsOf})` : ""}.`}
        </p>
        {profile.topDonors && profile.topDonors.length > 0 && (
          <ul className="mt-3 space-y-1">
            {profile.topDonors.map((d) => (
              <li key={d.name} className="flex justify-between border-b-2 border-dashed border-border py-1 text-sm">
                <span>{d.name}</span><span className="font-mono font-bold">{usd(d.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">Who they support &amp; attack</h2>
        {scorecard.supported.length === 0 && scorecard.attacked.length === 0 &&
          (!profile.independentExpenditures || profile.independentExpenditures.length === 0) ? (
          <p className="mt-1 text-sm text-muted-foreground">No candidate spending we&apos;ve tracked yet.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">In Wisconsin (our tracked ads)</p>
              <ul className="mt-2 space-y-1 text-sm">
                {scorecard.supported.map((r) => (
                  <li key={`s-${r.candidateSlug}`}>
                    <span className="text-accent">Backed</span>{" "}
                    <Link href={`/candidates/${r.candidateSlug}`} className="underline decoration-2 underline-offset-2">{names[r.candidateSlug] ?? r.candidateSlug}</Link>{" "}
                    · {usd(r.spend)}
                  </li>
                ))}
                {scorecard.attacked.map((r) => (
                  <li key={`a-${r.candidateSlug}`}>
                    <span className="text-primary">Attacked</span>{" "}
                    <Link href={`/candidates/${r.candidateSlug}`} className="underline decoration-2 underline-offset-2">{names[r.candidateSlug] ?? r.candidateSlug}</Link>{" "}
                    · {usd(r.spend)}
                  </li>
                ))}
              </ul>
            </div>
            {profile.independentExpenditures && profile.independentExpenditures.length > 0 && (
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Nationally (FEC Schedule E)</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {profile.independentExpenditures.map((ie) => (
                    <li key={`${ie.candidate}-${ie.supportOppose}`}>
                      <span className={ie.supportOppose === "support" ? "text-accent" : "text-primary"}>
                        {ie.supportOppose === "support" ? "Backed" : "Attacked"}
                      </span>{" "}{ie.candidate} · {usd(ie.amount)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {profile.sources.length > 0 && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Sources:{" "}
          {profile.sources.map((s, i) => (
            <span key={s.url}>{i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2">{s.label}</a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: The route `src/app/sponsors/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getSponsorProfile, getSponsorScorecard, candidateDirectory } from "@/lib/data";
import { sponsorSlugToKey } from "@/lib/site";
import { SponsorProfile } from "@/components/guide/sponsor-profile";

export const revalidate = 300;

export default async function SponsorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = sponsorSlugToKey(slug);
  const [profile, scorecard, candidates] = await Promise.all([
    getSponsorProfile(key), getSponsorScorecard(key), candidateDirectory(),
  ]);
  if (!profile) notFound();
  const names = Object.fromEntries(candidates.map((c) => [c.slug, c.name]));
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <SponsorProfile profile={profile} scorecard={scorecard} names={names} />
    </main>
  );
}
```

- [ ] **Step 3: Verify build + a live render**

Run: `npx next build`
Expected: `/sponsors/[slug]` appears in the route list; no type errors. (If no sponsor is enriched yet in dev, run `npx convex run sponsorEnrich:enrichSponsor '{"advertiser":"A Better Wisconsin Together"}'` first, then load `/sponsors/a-better-wisconsin-together`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/sponsors src/components/guide/sponsor-profile.tsx
git commit -m "feat(sponsors): public /sponsors/[slug] profile page"
```

---

### Task 11: "Who is this? →" links from inline cards

**Files:**
- Modify: `src/components/guide/tv-ad-tracker.tsx` (the "Who is this?" block, ~line 89-95)

**Interfaces:**
- Consumes: `sponsorKeyToSlug`, `normalizeSponsorKey` (mirror in `src/lib/site.ts` if not already client-safe — it is: pure string).

- [ ] **Step 1: Add the link**

In `tv-ad-tracker.tsx`, inside the `<details>` "Who is this?" summary block, append a link to the full page after the summary text:
```tsx
import { sponsorKeyToSlug } from "@/lib/site";
import { normalizeSponsorKey } from "../../../convex/lib/sponsors";
// …after the summary <p>:
<Link href={`/sponsors/${sponsorKeyToSlug(normalizeSponsorKey(s.sponsor))}`} className="mt-1 inline-block font-mono text-[11px] font-bold underline decoration-2 underline-offset-2">
  Full profile →
</Link>
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit -p tsconfig.json`
```bash
git add src/components/guide/tv-ad-tracker.tsx
git commit -m "feat(sponsors): link inline sponsor cards to full profile"
```

---

### Task 12: Admin narrative review

**Files:**
- Modify: `src/components/admin/sponsor-resolver.tsx` (run `enrichSponsor`, edit + approve narrative)
- Modify: `src/components/admin/admin-tabs.tsx` (add a "Narratives" pending list)

**Interfaces:**
- Consumes: `enrichSponsor`, `saveNarrativeDraft`, `approveNarrative`, `pendingNarratives`, `sponsorPublicProfile`/`sponsorForName`.

- [ ] **Step 1: Wire enrichment + narrative approve into `SponsorResolver`**

Replace the "Look up" `useAction(api.sponsors.lookupSponsor)` path with `useAction(api.sponsorEnrich.enrichSponsor)`; after it resolves, read back the row (`sponsorForName`) to populate the narrative textarea + leadership. Add two buttons: **Save narrative draft** (`saveNarrativeDraft`) and **Approve narrative** (`approveNarrative`). Exact facts (kind, totals, donors) render read-only from the row. Keep the existing edit fields for `displayName`/`kind`/`lean` via the existing `saveSponsor`.

- [ ] **Step 2: Add a "Narratives" pending list to `admin-tabs.tsx`**

A new tab/list that calls `useQuery(api.sponsors.pendingNarratives)` and lists `{displayName}` each linking to its `SponsorResolver` (or `/sponsors/[slug]` with an approve action). Each row: name + "Review →".

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx next build`
```bash
git add src/components/admin/sponsor-resolver.tsx src/components/admin/admin-tabs.tsx
git commit -m "feat(sponsors): admin narrative review + pending queue"
```

---

### Task 13: Full-suite verification

- [ ] **Step 1: Run the whole test suite + build**

Run: `pnpm test && npx next build`
Expected: all sponsor tests pass; build clean; `/sponsors/[slug]` in the route list.

- [ ] **Step 2: Live smoke on one real sponsor**

Run: `npx convex run sponsorEnrich:enrichSponsor '{"advertiser":"Americans for Prosperity"}'`
Then load `/sponsors/americans-for-prosperity`: exact facts + scorecard render; narrative shows "Profile in review" until you `approveNarrative` in admin. Confirm the dark-money warning shows for a non-FEC group.

- [ ] **Step 3: Commit any fixups**

```bash
git commit -am "test(sponsors): verification fixups" || echo "nothing to fix"
```

---

## Self-Review

**Spec coverage:**
- Data-model tier fields → Task 1. ✅
- OpenFEC exact facts (totals/donors/Schedule E) → Task 2. ✅
- Firecrawl narrative + allowlist (OpenSecrets/Ballotpedia/ProPublica/Wikipedia) → Task 3. ✅
- Enrichment orchestration + Perplexity fallback → Task 4 (fallback: `narrative.narrative` empty → `narrativeDraft` undefined → reviewer/`perplexityDescribe` via existing `lookupSponsor` remains available; note: wire `perplexityDescribe` as the fallback inside `enrichSponsor` if Firecrawl returns no narrative). ✅
- Batch by spend + monthly cron + skip candidate committees → Task 5. ✅
- Support/attack scorecard from own data → Task 6. ✅
- Tiered-gate public query → Task 7. ✅
- Admin approve + pending queue → Task 8, Task 12. ✅
- `/sponsors/[key]` page with all sections → Task 10. ✅
- Inline "Who is this? →" links → Task 11. ✅
- Fixture-first tests → Tasks 2, 3, 6, 7. ✅

**Placeholder scan:** Task 4 Step 3 notes the internal-action nuance; Task 12 steps describe UI wiring at a higher level than code blocks (acceptable — they modify existing well-understood components with named mutations). One follow-up made explicit: in Task 4, if `narrative.narrative` is empty, call the existing `perplexityDescribe(advertiser)` and use its `summary` as `narrativeDraft` before the upsert.

**Type consistency:** `OpenFecFacts`, `SponsorNarrative`, scorecard `{supported,attacked}`, and `PublicProfile` names/shapes are consistent across Tasks 2→4→6→7→10. `narrativeStatus` gate identical in Tasks 4/7/8. Slug helpers identical in Tasks 9/11.

**Fix applied inline:** Task 4 — add the Perplexity fallback branch:
```ts
let narrativeDraft = narrative.narrative;
if (!narrativeDraft) {
  const p = await perplexityDescribe(advertiser); // export it from convex/sponsors.ts
  narrativeDraft = p.summary && !p.summary.startsWith("Unknown") ? p.summary : undefined;
}
```
(Export `perplexityDescribe` from `convex/sponsors.ts` for reuse.)
