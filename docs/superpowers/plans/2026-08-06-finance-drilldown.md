# Finance Breakdowns & Donor Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a voter-first interpretation layer (funding mix, donor size, geography, momentum, plain-English takeaways) with tap-through drill-down to top donors, on candidate money sections and the race comparison table, before the Aug 11 primary.

**Architecture:** Breakdowns are precomputed at import time from the Sunshine transactions CSV (produced by `scripts/fetch-sunshine.mjs`) into one new Convex table `finance_breakdowns` (one doc per candidate per source). The UI reads that doc and renders pure HTML/CSS stacked bars — no runtime aggregation, no chart library. Spec: `docs/superpowers/specs/2026-08-06-finance-drilldown-design.md`.

**Tech Stack:** Node .mjs scripts (no deps), Convex, Next.js App Router, Tailwind (neo-brutalist house classes), vitest (+ convex-test).

## Global Constraints

- State (Sunshine) races only; `source: "openfec"` docs are allowed by schema but nothing imports or renders them in v1.
- No new npm dependencies. No chart libraries. Bars are `<div>`/`<button>` with percentage widths.
- PAC tags come ONLY from `scripts/pac-tags.json` — explicit names, never keyword matching.
- Every `count` in `finance_breakdowns` = **distinct donors** (by contributor name), never transactions.
- Every component renders `null` when its breakdown doc is absent — federal races and un-imported candidates must look exactly like today.
- Takeaway sentences are deterministic threshold templates computed at import time; no AI, no runtime generation.
- Category display order is fixed everywhere: individuals, party, union, pac, business, other. Colors come from one exported constant (`CATEGORY_META`).
- Category colors must NOT be red/blue partisan-coded (the "party" slice covers both parties). Use the Okabe-Ito colorblind-safe values defined in Task 5.
- Before writing the bar/tile JSX (Tasks 6–7), the implementer MUST load the `dataviz` skill.
- Commit after every task. House commit style: `type: description`, no attribution footer.
- All work in `/Users/tarikmoody/Documents/Projects/badgerbrief`, branch `main`. Only commit files this plan names — the repo has unrelated uncommitted work.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `convex/schema.ts` | modify | add `finance_breakdowns` table |
| `convex/finance.ts` | modify | add `upsertBreakdown` internal mutation |
| `convex/finance.test.ts` | modify | mutation upsert test |
| `scripts/fetch-sunshine.mjs` | modify | add `Contributor State` CSV column |
| `scripts/pac-tags.json` | create | curated committee-name → tag map |
| `scripts/lib/breakdowns.mjs` | create | pure CSV → breakdown-doc computation |
| `scripts/lib/breakdowns.test.mjs` | create | unit tests w/ synthetic fixture |
| `scripts/import-sunshine-breakdowns.mjs` | create | CLI: CSV + tags → Convex upserts |
| `src/lib/financeSegments.ts` | create | segment math + `CATEGORY_META` constant |
| `src/lib/financeSegments.test.ts` | create | segment math tests (the two silent-lie risks) |
| `convex/public.ts` | modify | race + candidate queries return breakdowns |
| `src/components/guide/financeBreakdown.tsx` | create | callout, mix bar (client), tiles, momentum, mini bar |
| `src/app/candidates/[slug]/page.tsx` | modify | render breakdown section |
| `src/components/guide/finance.tsx` | modify | "Where it's from" column in race table |
| `src/app/races/[slug]/page.tsx` | modify | pass breakdowns to race table |

---

### Task 1: Schema + upsert mutation

**Files:**
- Modify: `convex/schema.ts` (after the `contributions` table, ~line 252)
- Modify: `convex/finance.ts` (after `replaceContributions`)
- Test: `convex/finance.test.ts`

**Interfaces:**
- Produces: table `finance_breakdowns` (shape below); internal mutation `finance:upsertBreakdown` upserting on (raceId, candidateSlug, source). Later tasks rely on the exact field names below.

- [ ] **Step 1: Add the table to `convex/schema.ts`**

```ts
  // Precomputed funding breakdowns (spec: 2026-08-06-finance-drilldown).
  // One doc per candidate per source, written by import-sunshine-breakdowns.mjs.
  // Every `count` = distinct donors by contributor name, never transactions.
  finance_breakdowns: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    source: v.union(v.literal("openfec"), v.literal("sunshine")),
    coverageEndDate: v.optional(v.string()),
    fetchedAt: v.number(),
    categories: v.array(
      v.object({
        key: v.string(), // individuals | party | union | pac | business | other
        amount: v.number(),
        count: v.number(),
        topDonors: v.array(
          v.object({
            name: v.string(),
            amount: v.number(),
            location: v.optional(v.string()),
          }),
        ),
      }),
    ),
    sizeBuckets: v.array(
      v.object({
        key: v.string(), // small (<$200) | mid ($200–999) | large (>=$1,000)
        amount: v.number(),
        count: v.number(),
      }),
    ),
    geo: v.object({
      inState: v.object({ amount: v.number(), count: v.number() }),
      outOfState: v.object({ amount: v.number(), count: v.number() }),
      unknown: v.object({ amount: v.number(), count: v.number() }),
    }),
    monthly: v.array(v.object({ month: v.string(), receipts: v.number() })),
    takeaways: v.array(v.string()),
  }).index("by_candidate", ["raceId", "candidateSlug"]),
```

- [ ] **Step 2: Write the failing test in `convex/finance.test.ts`**

Read the top of the file first and reuse its existing harness/imports (it uses `convex-test`). Append:

```ts
test("upsertBreakdown inserts then updates in place", async () => {
  const t = convexTest(schema, modules);
  const doc = {
    candidateSlug: "david-crowley",
    raceId: "WI-GOV-2026",
    source: "sunshine" as const,
    coverageEndDate: "filings through Aug 3, 2026",
    categories: [
      { key: "individuals", amount: 100, count: 2, topDonors: [{ name: "A", amount: 60 }] },
    ],
    sizeBuckets: [{ key: "small", amount: 100, count: 2 }],
    geo: {
      inState: { amount: 100, count: 2 },
      outOfState: { amount: 0, count: 0 },
      unknown: { amount: 0, count: 0 },
    },
    monthly: [{ month: "2026-07", receipts: 100 }],
    takeaways: ["test sentence"],
  };
  await t.mutation(internal.finance.upsertBreakdown, doc);
  await t.mutation(internal.finance.upsertBreakdown, {
    ...doc,
    takeaways: ["updated sentence"],
  });
  const rows = await t.run((ctx) => ctx.db.query("finance_breakdowns").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].takeaways).toEqual(["updated sentence"]);
  expect(rows[0].fetchedAt).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/finance.test.ts -t upsertBreakdown`
Expected: FAIL (`upsertBreakdown` does not exist)

- [ ] **Step 4: Implement `upsertBreakdown` in `convex/finance.ts`**

```ts
const breakdownFields = {
  candidateSlug: v.string(),
  raceId: v.string(),
  source: financeSource,
  coverageEndDate: v.optional(v.string()),
  categories: v.array(
    v.object({
      key: v.string(),
      amount: v.number(),
      count: v.number(),
      topDonors: v.array(
        v.object({
          name: v.string(),
          amount: v.number(),
          location: v.optional(v.string()),
        }),
      ),
    }),
  ),
  sizeBuckets: v.array(
    v.object({ key: v.string(), amount: v.number(), count: v.number() }),
  ),
  geo: v.object({
    inState: v.object({ amount: v.number(), count: v.number() }),
    outOfState: v.object({ amount: v.number(), count: v.number() }),
    unknown: v.object({ amount: v.number(), count: v.number() }),
  }),
  monthly: v.array(v.object({ month: v.string(), receipts: v.number() })),
  takeaways: v.array(v.string()),
};

export const upsertBreakdown = internalMutation({
  args: breakdownFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("finance_breakdowns")
      .withIndex("by_candidate", (q) =>
        q.eq("raceId", args.raceId).eq("candidateSlug", args.candidateSlug),
      )
      .collect();
    const match = existing.find((b) => b.source === args.source);
    const doc = { ...args, fetchedAt: Date.now() };
    if (match) {
      await ctx.db.patch(match._id, doc);
      return match._id;
    }
    return await ctx.db.insert("finance_breakdowns", doc);
  },
});
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run convex/finance.test.ts`
Expected: all PASS (including pre-existing tests)

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/finance.ts convex/finance.test.ts convex/_generated
git commit -m "feat: finance_breakdowns table + upsertBreakdown mutation"
```

---

### Task 2: Contributor State column in fetch script

**Files:**
- Modify: `scripts/fetch-sunshine.mjs`

**Interfaces:**
- Produces: CSV gains a `Contributor State` column (header exactly that string) between `Contributor City` and `Related Ballot Event Name`. Task 3's lib reads it.

- [ ] **Step 1: Add the header** — in the `HEADERS` array, insert `"Contributor State"` after `"Contributor City"`.

- [ ] **Step 2: Add the value** — in the `rows.push([...])` call, after the city expression, insert:

```js
          t?.from_entity?.entityContactProfiles?.[0]?.state ?? "",
```

- [ ] **Step 3: Verify against the live API with the smallest committee**

Run: `node scripts/fetch-sunshine.mjs /tmp/leiber-check.csv --dateFrom 2026-01-01 --dateTo 2026-08-03 --only john-leiber && head -3 /tmp/leiber-check.csv`
Expected: header contains `Contributor State` in position 8 (after `Contributor City`); data rows show state values such as `WI`, `Wisconsin`, or two-letter codes; script prints a nonzero txn count for Friends of John Leiber.

- [ ] **Step 4: Confirm the totals importer still parses the new CSV shape**

Run: `node -e 'import("./scripts/lib/sunshine.mjs").then(async ({aggregateSunshine}) => { const fs = await import("node:fs"); const {committees, skipped} = aggregateSunshine(fs.readFileSync("/tmp/leiber-check.csv","utf8")); console.log([...committees.keys()], "skipped:", skipped); })'`
Expected: `[ 'Friends of John Leiber' ] skipped: 0` (headerIndex lookups are name-based, so the inserted column must not break them)

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-sunshine.mjs
git commit -m "feat: contributor state column in sunshine fetch"
```

---

### Task 3: Curated pac-tags.json

**Files:**
- Create: `scripts/pac-tags.json`

**Interfaces:**
- Produces: JSON object mapping exact committee/contributor names → `"party" | "union" | "business-assoc" | "ideological"`. Task 4's lib consumes it verbatim (exact-name lookup, case-sensitive).

- [ ] **Step 1: Write the seed file** (names verified against the Aug 3 import's top-donor data; extend over time, never keyword-guess):

```json
{
  "_comment": "Explicit contributor-name → tag map for finance_breakdowns categories. Exact names as they appear in Sunshine data. Tags: party | union | business-assoc | ideological. Untagged Registrant rows stay category 'pac'. Curated only — never keyword-guessed. import-sunshine-breakdowns.mjs prints big untagged committee donors so this list can grow.",
  "Republican Party of Wisconsin": "party",
  "Democratic Party of Wisconsin": "party",
  "Democratic Party of Wisconsin - Segregated Fund": "party",
  "Assembly Democratic Camp Comm": "party",
  "State Senate Democratic Committee": "party",
  "Republican Party of Milwaukee County": "party",
  "WEAC PAC": "union",
  "Wisconsin Pipe Trades Association PAC Fund": "union",
  "International Union of Operating Engineers Local 139 PAC": "union",
  "United Food & Commercial Workers International Union Active Ballot Club": "union",
  "Prof Firefighters of WI PAC": "union",
  "Wisconsin Credit Union Legislative Action Fund": "business-assoc",
  "Alliance of Bankers for WI ": "business-assoc",
  "WMC Conduit ": "business-assoc",
  "Realtors Direct Giver Program ": "business-assoc",
  "RANW PAC": "business-assoc",
  "Volunteers for Agriculture VFA": "business-assoc",
  "WI Medical PAC": "business-assoc",
  "Pro-Life WI Victory Fund PAC": "ideological"
}
```

Note the trailing spaces in `"Alliance of Bankers for WI "`, `"WMC Conduit "`, `"Realtors Direct Giver Program "` — they are real in the Sunshine data; keep them.

- [ ] **Step 2: Validate JSON parses**

Run: `node -e 'const t = require("./scripts/pac-tags.json"); console.log(Object.keys(t).length, "tags")'`
Expected: `20 tags` (19 names + `_comment`... the count prints 20 including `_comment`; that is fine)

- [ ] **Step 3: Commit**

```bash
git add scripts/pac-tags.json
git commit -m "feat: curated pac-tags for finance breakdown categories"
```

---

### Task 4: Pure breakdown computation lib (TDD)

**Files:**
- Create: `scripts/lib/breakdowns.mjs`
- Test: `scripts/lib/breakdowns.test.mjs`

**Interfaces:**
- Consumes: `parseCsv` from `./sunshine.mjs`; pac-tags object from Task 3.
- Produces: `computeBreakdowns(csvText, pacTags, { cycle = "2026" } = {})` → `Map<committeeName, { categories, sizeBuckets, geo, monthly, takeaways }>` in exactly the schema shape from Task 1 (minus candidateSlug/raceId/source/coverageEndDate). Task 5's CLI consumes this.

Rules the implementation must encode (all from the spec):
- Row filtering identical to `aggregateSunshine`: contribution rows only for money-in (`type` contains "contribution" or "receipt", case-insensitive); drop rows whose `Related Ballot Event Name` is non-empty and lacks the cycle string; skip rows with missing committee or non-finite amount.
- Category per row: `Contributor Entity Type` `Individual` → `individuals`; `Registrant` → `pacTags[name]` mapped (`party`→party, `union`→union, `business-assoc`/`ideological`→pac) — **wait, no**: `business-assoc` and `ideological` stay in category `pac` for the mix bar (six fixed categories only); the tag is not surfaced in v1 beyond curation. `Business` → `business`; anything else (`Anonymous`, `Unregistered`, `Depository`, empty) → `other`.
- Donor aggregation by exact `Contributor Name` within a category; `count` = distinct donors; `topDonors` = top 10 by aggregated amount, `location` = `"City, State"` when both present, else whichever exists, else omitted.
- `sizeBuckets`: individuals only, bucket by per-donor aggregated total: `small` < 200, `mid` 200–999.999, `large` >= 1000. Amounts are the summed donations of donors in that bucket; counts are donors.
- `geo`: individuals + business rows only, aggregated per donor; a donor is `inState` when their state normalizes to WI (`state.trim().toUpperCase()` is `"WI"` or `"WISCONSIN"`), `unknown` when empty/missing, else `outOfState`.
- `monthly`: sum of contribution amounts by `Transaction Date` month, `"YYYY-MM"`, ascending, months with zero omitted.
- `takeaways` (pct = `Math.round(100 * part / totalReceipts)`; only when threshold trips; totalReceipts = sum of all six category amounts):
  - party ≥ 40%: `` `Over ${pct}% of this campaign's money came from party committees.` `` (use `pct - 1` if `pct` rounds above the true value? No — keep it simple: use `Math.floor` for "Over" claims.)
  - union ≥ 25%: `` `About ${pct}% of this campaign's money came from union PACs.` `` (Math.round)
  - small ≥ 40% of totalReceipts: `` `${count.toLocaleString("en-US")} donors gave under $200 — ${pct}% of the total raised.` `` (Math.round)
  - out-of-state ≥ 40% of (inState+outOfState amounts, i.e. known-geo money): `` `${pct}% of individual and business donations came from outside Wisconsin.` `` (Math.round)

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, test } from "vitest";
import { computeBreakdowns } from "./breakdowns.mjs";

const HEADER =
  "ID,Transaction Date,Amount,Registrant Name,Transaction Type,Contributor Name,Contributor Entity Type,Contributor City,Contributor State,Related Ballot Event Name";

const row = (id, date, amount, committee, type, donor, entityType, city, state, event = "") =>
  [id, date, amount, committee, type, donor, entityType, city, state, event].join(",");

const CSV = [
  HEADER,
  // Alice gives twice (aggregates to 250 → mid bucket), in-state
  row(1, "2026-01-15", 100, "Test Comm", "Contribution", "Alice A", "Individual", "Madison", "WI"),
  row(2, "2026-07-02", 150, "Test Comm", "Contribution", "Alice A", "Individual", "Madison", "Wisconsin"),
  // Bob small donor, out of state
  row(3, "2026-07-10", 50, "Test Comm", "Contribution", "Bob B", "Individual", "Chicago", "IL"),
  // Tagged party committee
  row(4, "2026-07-11", 500, "Test Comm", "Contribution", "Republican Party of Wisconsin", "Registrant", "Madison", "WI"),
  // Untagged PAC falls back to 'pac'
  row(5, "2026-07-12", 200, "Test Comm", "Contribution", "Mystery PAC", "Registrant", "", ""),
  // Business, unknown state
  row(6, "2026-02-01", 300, "Test Comm", "Contribution", "Acme LLC", "Business", "Racine", ""),
  // Disbursement must not count toward any breakdown
  row(7, "2026-03-01", 999, "Test Comm", "Disbursement", "Vendor", "Business", "", ""),
  // Old-cycle-tagged row must be dropped
  row(8, "2026-03-02", 777, "Test Comm", "Contribution", "Old Donor", "Individual", "", "", "2020 Fall General"),
].join("\n");

const TAGS = { "Republican Party of Wisconsin": "party" };

describe("computeBreakdowns", () => {
  const b = computeBreakdowns(CSV, TAGS).get("Test Comm");

  test("category totals, donor counts, and tag fallback", () => {
    const byKey = Object.fromEntries(b.categories.map((c) => [c.key, c]));
    expect(byKey.individuals).toMatchObject({ amount: 300, count: 2 });
    expect(byKey.party).toMatchObject({ amount: 500, count: 1 });
    expect(byKey.pac).toMatchObject({ amount: 200, count: 1 }); // Mystery PAC untagged
    expect(byKey.business).toMatchObject({ amount: 300, count: 1 });
    expect(byKey.other ?? { amount: 0 }).toMatchObject({ amount: 0 });
  });

  test("category amounts sum to total receipts (bar sums to 100%)", () => {
    const total = b.categories.reduce((s, c) => s + c.amount, 0);
    expect(total).toBe(1300); // 300 + 500 + 200 + 300; no disbursement, no 2020 row
  });

  test("topDonors aggregate across gifts with location", () => {
    const ind = b.categories.find((c) => c.key === "individuals");
    expect(ind.topDonors[0]).toEqual({ name: "Alice A", amount: 250, location: "Madison, WI" });
  });

  test("size buckets aggregate per donor, individuals only", () => {
    const byKey = Object.fromEntries(b.sizeBuckets.map((s) => [s.key, s]));
    expect(byKey.small).toMatchObject({ amount: 50, count: 1 }); // Bob
    expect(byKey.mid).toMatchObject({ amount: 250, count: 1 }); // Alice (100+150)
    expect(byKey.large ?? { count: 0 }).toMatchObject({ count: 0 });
  });

  test("geo normalizes WI spellings and buckets unknown", () => {
    expect(b.geo.inState).toMatchObject({ amount: 250, count: 1 }); // Alice
    expect(b.geo.outOfState).toMatchObject({ amount: 50, count: 1 }); // Bob
    expect(b.geo.unknown).toMatchObject({ amount: 300, count: 1 }); // Acme
  });

  test("monthly sums ascending, zero months omitted", () => {
    expect(b.monthly).toEqual([
      { month: "2026-01", receipts: 100 },
      { month: "2026-02", receipts: 300 },
      { month: "2026-07", receipts: 900 },
    ]);
  });

  test("takeaway thresholds: party 500/1300 = 38% does not trip at 40", () => {
    expect(b.takeaways.some((t) => t.includes("party"))).toBe(false);
  });

  test("takeaway fires when party crosses 40%", () => {
    const csv = [
      HEADER,
      row(1, "2026-07-01", 600, "P Comm", "Contribution", "Republican Party of Wisconsin", "Registrant", "", ""),
      row(2, "2026-07-02", 400, "P Comm", "Contribution", "Carol C", "Individual", "", ""),
    ].join("\n");
    const p = computeBreakdowns(csv, TAGS).get("P Comm");
    expect(p.takeaways).toContain("Over 60% of this campaign's money came from party committees.");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/lib/breakdowns.test.mjs`
Expected: FAIL (`breakdowns.mjs` not found)

- [ ] **Step 3: Implement `scripts/lib/breakdowns.mjs`**

```js
/**
 * Pure computation of finance_breakdowns docs from a Sunshine transactions CSV
 * (the fetch-sunshine.mjs shape). Spec: docs/superpowers/specs/
 * 2026-08-06-finance-drilldown-design.md. Every count = distinct donors.
 */
import { parseCsv } from "./sunshine.mjs";

const CATEGORY_ORDER = ["individuals", "party", "union", "pac", "business", "other"];

function categoryFor(entityType, donorName, pacTags) {
  const t = (entityType ?? "").trim().toLowerCase();
  if (t === "individual") return "individuals";
  if (t === "registrant") {
    const tag = pacTags[donorName];
    if (tag === "party") return "party";
    if (tag === "union") return "union";
    return "pac"; // business-assoc / ideological / untagged all render as PAC
  }
  if (t === "business") return "business";
  return "other"; // Anonymous, Unregistered, Depository, empty
}

function normalizeState(s) {
  const up = (s ?? "").trim().toUpperCase();
  if (!up) return "unknown";
  return up === "WI" || up === "WISCONSIN" ? "inState" : "outOfState";
}

const location = (city, state) =>
  [city, state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ") || undefined;

function idx(headers, name) {
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return headers.findIndex((h) => norm(h) === norm(name) || norm(h).startsWith(norm(name)));
}

export function computeBreakdowns(csvText, pacTags, { cycle = "2026" } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return new Map();
  const H = rows[0];
  const iDate = idx(H, "Transaction Date");
  const iAmount = idx(H, "Amount");
  const iCommittee = idx(H, "Registrant Name");
  const iType = idx(H, "Transaction Type");
  const iDonor = idx(H, "Contributor Name");
  const iEntity = idx(H, "Contributor Entity Type");
  const iCity = idx(H, "Contributor City");
  const iState = idx(H, "Contributor State");
  const iEvent = idx(H, "Related Ballot Event Name");
  if (iCommittee < 0 || iAmount < 0 || iDonor < 0) {
    throw new Error(`Unrecognized CSV header: ${H.join(", ")}`);
  }

  // committee -> donor name -> {amount, category, city, state, months:{}}
  const perCommittee = new Map();
  for (const row of rows.slice(1)) {
    const committee = (row[iCommittee] ?? "").trim();
    const amount = Number((row[iAmount] ?? "").replace(/[$,]/g, ""));
    const type = (row[iType] ?? "").trim().toLowerCase();
    if (!committee || !Number.isFinite(amount)) continue;
    if (!(type.includes("contribution") || type.includes("receipt"))) continue;
    const event = iEvent >= 0 ? (row[iEvent] ?? "").trim() : "";
    if (event && !event.includes(cycle)) continue;

    const donor = (row[iDonor] ?? "").trim() || "(unnamed)";
    const entity = perCommittee.get(committee) ?? { donors: new Map(), monthly: new Map() };
    const d = entity.donors.get(donor) ?? {
      amount: 0,
      category: categoryFor(row[iEntity], donor, pacTags),
      city: (row[iCity] ?? "").trim(),
      state: (row[iState] ?? "").trim(),
    };
    d.amount += amount;
    entity.donors.set(donor, d);

    const month = (row[iDate] ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      entity.monthly.set(month, (entity.monthly.get(month) ?? 0) + amount);
    }
    perCommittee.set(committee, entity);
  }

  const out = new Map();
  for (const [committee, { donors, monthly }] of perCommittee) {
    const round = (n) => Math.round(n * 100) / 100;
    const categories = CATEGORY_ORDER.map((key) => {
      const members = [...donors.entries()].filter(([, d]) => d.category === key);
      const topDonors = members
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 10)
        .map(([name, d]) => {
          const loc = location(d.city, d.state);
          return loc
            ? { name, amount: round(d.amount), location: loc }
            : { name, amount: round(d.amount) };
        });
      return {
        key,
        amount: round(members.reduce((s, [, d]) => s + d.amount, 0)),
        count: members.length,
        topDonors,
      };
    }).filter((c) => c.count > 0);

    const individuals = [...donors.values()].filter((d) => d.category === "individuals");
    const bucketOf = (d) => (d.amount < 200 ? "small" : d.amount < 1000 ? "mid" : "large");
    const sizeBuckets = ["small", "mid", "large"]
      .map((key) => {
        const members = individuals.filter((d) => bucketOf(d) === key);
        return {
          key,
          amount: round(members.reduce((s, d) => s + d.amount, 0)),
          count: members.length,
        };
      })
      .filter((b) => b.count > 0);

    const geo = {
      inState: { amount: 0, count: 0 },
      outOfState: { amount: 0, count: 0 },
      unknown: { amount: 0, count: 0 },
    };
    for (const d of donors.values()) {
      if (d.category !== "individuals" && d.category !== "business") continue;
      const g = geo[normalizeState(d.state)];
      g.amount = round(g.amount + d.amount);
      g.count += 1;
    }

    const monthlyArr = [...monthly.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, receipts]) => ({ month, receipts: round(receipts) }));

    const total = categories.reduce((s, c) => s + c.amount, 0);
    const catAmount = (key) => categories.find((c) => c.key === key)?.amount ?? 0;
    const takeaways = [];
    if (total > 0) {
      const partyPct = Math.floor((100 * catAmount("party")) / total);
      if (partyPct >= 40)
        takeaways.push(`Over ${partyPct}% of this campaign's money came from party committees.`);
      const unionPct = Math.round((100 * catAmount("union")) / total);
      if (unionPct >= 25)
        takeaways.push(`About ${unionPct}% of this campaign's money came from union PACs.`);
      const small = sizeBuckets.find((b) => b.key === "small");
      if (small) {
        const smallPct = Math.round((100 * small.amount) / total);
        if (smallPct >= 40)
          takeaways.push(
            `${small.count.toLocaleString("en-US")} donors gave under $200 — ${smallPct}% of the total raised.`,
          );
      }
      const known = geo.inState.amount + geo.outOfState.amount;
      if (known > 0) {
        const outPct = Math.round((100 * geo.outOfState.amount) / known);
        if (outPct >= 40)
          takeaways.push(
            `${outPct}% of individual and business donations came from outside Wisconsin.`,
          );
      }
    }

    out.set(committee, { categories, sizeBuckets, geo, monthly: monthlyArr, takeaways });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run scripts/lib/breakdowns.test.mjs`
Expected: all PASS. If the "38% does not trip" test fails, check the party takeaway uses `Math.floor` and the ≥40 threshold.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/breakdowns.mjs scripts/lib/breakdowns.test.mjs
git commit -m "feat: pure breakdown computation for finance drill-down"
```

---

### Task 5: Import CLI + segment math module (TDD)

**Files:**
- Create: `scripts/import-sunshine-breakdowns.mjs`
- Create: `src/lib/financeSegments.ts`
- Test: `src/lib/financeSegments.test.ts`

**Interfaces:**
- Consumes: `computeBreakdowns` (Task 4), `scripts/pac-tags.json` (Task 3), `scripts/sunshine-committees.json` (existing), `finance:upsertBreakdown` (Task 1).
- Produces:
  - CLI: `node scripts/import-sunshine-breakdowns.mjs <export.csv> [--prod] [--coverage <label>]`.
  - `CATEGORY_META: Record<string, { label: string; color: string }>` and `computeSegments(categories | undefined): { key, label, color, amount, count, pct }[]` from `src/lib/financeSegments.ts`. Tasks 6–7 consume both.

- [ ] **Step 1: Write the CLI** (mirrors `import-sunshine.mjs`'s structure — same `run()` helper, same mapping file):

```js
#!/usr/bin/env node
/**
 * Import funding breakdowns from a Sunshine transactions CSV into Convex
 * (finance_breakdowns). Run AFTER import-sunshine.mjs, same CSV:
 *   node scripts/import-sunshine-breakdowns.mjs <export.csv> [--prod] [--coverage <label>]
 * Prints each candidate's takeaway sentences (editorial eyeball gate) and the
 * largest untagged committee donors (candidates for pac-tags.json).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { computeBreakdowns } from "./lib/breakdowns.mjs";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error(
    "Usage: node scripts/import-sunshine-breakdowns.mjs <export.csv> [--prod] [--coverage <label>]",
  );
  process.exit(2);
}
const PROD = args.includes("--prod");
const coverageIdx = args.indexOf("--coverage");
const coverage = coverageIdx >= 0 ? args[coverageIdx + 1] : "per latest Sunshine export";

const mapping = JSON.parse(
  readFileSync(new URL("./sunshine-committees.json", import.meta.url), "utf8"),
);
const pacTags = JSON.parse(readFileSync(new URL("./pac-tags.json", import.meta.url), "utf8"));

function run(fn, payload) {
  const argv = ["convex", "run", fn, JSON.stringify(payload), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

const breakdowns = computeBreakdowns(readFileSync(csvPath, "utf8"), pacTags);
let imported = 0;
for (const [committee, b] of breakdowns) {
  const match = mapping[committee];
  if (!match) continue; // import-sunshine.mjs already reports unmatched committees
  run("finance:upsertBreakdown", {
    candidateSlug: match.candidateSlug,
    raceId: match.raceId,
    source: "sunshine",
    coverageEndDate: coverage,
    ...b,
  });
  imported++;
  const total = b.categories.reduce((s, c) => s + c.amount, 0);
  console.log(`✓ ${committee} → ${match.candidateSlug}: $${total.toLocaleString("en-US")}`);
  for (const t of b.takeaways) console.log(`    “${t}”`);
  const untaggedBig = (b.categories.find((c) => c.key === "pac")?.topDonors ?? [])
    .filter((d) => !(d.name in pacTags) && d.amount >= 25000)
    .slice(0, 3);
  for (const d of untaggedBig)
    console.log(`    ? untagged committee donor: ${d.name} ($${d.amount.toLocaleString("en-US")})`);
}
console.log(`\nImported breakdowns for ${imported} committees.`);
```

- [ ] **Step 2: Dry-run against the real Aug 3 CSV on the DEV deployment** (no `--prod`):

Run: `node scripts/import-sunshine-breakdowns.mjs /private/tmp/claude-502/-Users-tarikmoody-Documents-Projects-blk-exchange/aba76dfd-971c-4d92-a66a-d34dc6a40023/scratchpad/sunshine-2026-aug3.csv --coverage "filings through Aug 3, 2026"`
(That CSV predates Task 2, so it has no `Contributor State` column — `geo` will be all-`unknown`, which is the correct degraded behavior; state data arrives with the next fetch. If the file no longer exists, regenerate: `node scripts/fetch-sunshine.mjs /tmp/sunshine-2026-aug3.csv --dateFrom 2026-01-01 --dateTo 2026-08-03`.)
Expected: 13 `✓` lines; Tiffany's line includes a party takeaway near "Over 76%"; Hong's includes a small-donor takeaway; no crash on the missing state column.

- [ ] **Step 3: Sanity-check one dev doc**

Run: `npx convex data finance_breakdowns --limit 3`
Expected: docs present with categories/sizeBuckets/geo/monthly/takeaways populated.

- [ ] **Step 4: Write failing tests for the segment math** (`src/lib/financeSegments.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { CATEGORY_META, computeSegments } from "./financeSegments";

const cats = [
  { key: "individuals", amount: 300, count: 2, topDonors: [] },
  { key: "party", amount: 500, count: 1, topDonors: [] },
  { key: "pac", amount: 200, count: 1, topDonors: [] },
];

describe("computeSegments", () => {
  test("percentages sum to exactly 100", () => {
    const segs = computeSegments(cats);
    expect(segs.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });

  test("keeps fixed category order and attaches meta", () => {
    const segs = computeSegments(cats);
    expect(segs.map((s) => s.key)).toEqual(["individuals", "party", "pac"]);
    expect(segs[0].label).toBe(CATEGORY_META.individuals.label);
    expect(segs[0].color).toBe(CATEGORY_META.individuals.color);
  });

  test("absent or empty input renders nothing", () => {
    expect(computeSegments(undefined)).toEqual([]);
    expect(computeSegments([])).toEqual([]);
    expect(computeSegments([{ key: "individuals", amount: 0, count: 0, topDonors: [] }])).toEqual([]);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run src/lib/financeSegments.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 6: Implement `src/lib/financeSegments.ts`**

```ts
/**
 * Shared segment math + category metadata for the finance breakdown UI.
 * One source of truth so the candidate mix bar and the race-table mini bars
 * cannot drift. Colors are Okabe-Ito (colorblind-safe) and deliberately NOT
 * red/blue partisan-coded — "party" covers both parties.
 */

export type BreakdownCategory = {
  key: string;
  amount: number;
  count: number;
  topDonors: { name: string; amount: number; location?: string }[];
};

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  individuals: { label: "Individuals", color: "#0072B2" },
  party: { label: "Party committees", color: "#E69F00" },
  union: { label: "Union PACs", color: "#009E73" },
  pac: { label: "PACs & committees", color: "#CC79A7" },
  business: { label: "Businesses", color: "#56B4E9" },
  other: { label: "Other", color: "#8B8B8B" },
};

const ORDER = ["individuals", "party", "union", "pac", "business", "other"];

export type Segment = BreakdownCategory & { label: string; color: string; pct: number };

/**
 * Order categories, compute integer percentages that sum to exactly 100
 * (largest-remainder rounding). Returns [] for absent/empty/zero input so
 * components can render nothing.
 */
export function computeSegments(categories?: BreakdownCategory[]): Segment[] {
  const cats = (categories ?? [])
    .filter((c) => c.amount > 0)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const total = cats.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return [];
  const raw = cats.map((c) => (100 * c.amount) / total);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((s, f) => s + f, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const pcts = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    pcts[i] += 1;
    remainder -= 1;
  }
  return cats.map((c, i) => ({
    ...c,
    label: CATEGORY_META[c.key]?.label ?? c.key,
    color: CATEGORY_META[c.key]?.color ?? "#8B8B8B",
    pct: pcts[i],
  }));
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npx vitest run src/lib/financeSegments.test.ts`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add scripts/import-sunshine-breakdowns.mjs src/lib/financeSegments.ts src/lib/financeSegments.test.ts
git commit -m "feat: breakdown import CLI + shared segment math"
```

---

### Task 6: Breakdown UI components + candidate page

**Files:**
- Create: `src/components/guide/financeBreakdown.tsx`
- Modify: `src/app/candidates/[slug]/page.tsx` (render after the `FinanceDetail` element, ~line 308)
- Modify: `convex/public.ts` (candidate query, `candidateGuide` handler ~line 97)

**Interfaces:**
- Consumes: `computeSegments` + `CATEGORY_META` (Task 5); `Doc<"finance_breakdowns">` (Task 1).
- Produces: `FinanceBreakdownSection({ breakdown }: { breakdown?: Doc<"finance_breakdowns"> | null })` (server-renderable wrapper; returns `null` when absent) and `MixBarMini({ categories })` (non-interactive, used by Task 7). Candidate query returns a new `financeBreakdowns` array field.

**Before writing JSX in this task: load the `dataviz` skill.**

- [ ] **Step 1: Extend the candidate query in `convex/public.ts`** — inside the `Promise.all` at ~line 97, add a sixth query following the exact pattern of the `finance_totals` one:

```ts
      ctx.db
        .query("finance_breakdowns")
        .withIndex("by_candidate", (q) =>
          q.eq("raceId", candidate.raceId).eq("candidateSlug", slug),
        )
        .collect(),
```

Destructure it as `financeBreakdowns` and add `financeBreakdowns` to the returned object (~line 203).

- [ ] **Step 2: Create `src/components/guide/financeBreakdown.tsx`** with these components (house style: `border-2 border-border`, `shadow-[var(--shadow-brutal)]`, `font-mono` micro-labels, `bg-warning` callouts — copy class strings from `finance.tsx` neighbors):

```tsx
"use client";

import { useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { computeSegments, type BreakdownCategory, type Segment } from "@/lib/financeSegments";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** Plain-English takeaways, warning-box style (renders nothing when empty). */
function Takeaways({ takeaways }: { takeaways: string[] }) {
  if (takeaways.length === 0) return null;
  return (
    <div className="mt-3 border-2 border-border bg-warning p-4 text-sm text-foreground shadow-[var(--shadow-brutal)]">
      <strong>What it means.</strong>{" "}
      {takeaways.map((t) => (
        <span key={t}>{t} </span>
      ))}
    </div>
  );
}

/** Interactive stacked funding-mix bar; tap a segment for its top donors. */
function FundingMixBar({ categories }: { categories: BreakdownCategory[] }) {
  const segments = computeSegments(categories);
  const [open, setOpen] = useState<string | null>(null);
  if (segments.length === 0) return null;
  const openSeg = segments.find((s) => s.key === open);
  return (
    <div className="mt-3">
      <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
        Where the money comes from
      </h3>
      <div className="mt-2 flex h-9 w-full overflow-hidden border-2 border-border shadow-[var(--shadow-brutal)]">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-expanded={open === s.key}
            title={`${s.label}: ${s.pct}% (${fmt(s.amount)})`}
            onClick={() => setOpen(open === s.key ? null : s.key)}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            className={`h-full min-w-[2px] border-r border-border last:border-r-0 ${
              open === s.key ? "outline outline-2 outline-offset-[-3px] outline-foreground" : ""
            }`}
          >
            {s.pct >= 12 && (
              <span className="px-1 font-mono text-[10px] font-bold text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.6)]">
                {s.pct}%
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setOpen(open === s.key ? null : s.key)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            <span
              className="inline-block h-2.5 w-2.5 border border-border"
              style={{ backgroundColor: s.color }}
            />
            {s.label} {s.pct}%
          </button>
        ))}
      </div>
      {/* Screen-reader equivalent of the bar */}
      <table className="sr-only">
        <caption>Funding mix by source type</caption>
        <tbody>
          {segments.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{s.pct}%</td>
              <td>{fmt(s.amount)}</td>
              <td>{s.count} donors</td>
            </tr>
          ))}
        </tbody>
      </table>
      {openSeg && <SegmentPanel segment={openSeg} />}
    </div>
  );
}

function SegmentPanel({ segment }: { segment: Segment }) {
  return (
    <div className="mt-2 border-2 border-dashed border-border bg-secondary/40 p-3">
      <p className="text-xs">
        <span className="font-bold">{segment.label}:</span>{" "}
        <span className="font-mono font-bold">{fmt(segment.amount)}</span> from{" "}
        {segment.count.toLocaleString("en-US")} donor{segment.count === 1 ? "" : "s"}.
        {segment.topDonors.length > 0 ? " Largest:" : ""}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {segment.topDonors.map((d) => (
          <li key={d.name} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
            <span>
              {d.name}
              {d.location ? ` (${d.location})` : ""}
            </span>
            <span className="font-mono">{fmt(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small-vs-big donors and in/out-of-state, as two expandable stat tiles. */
function SizeGeoTiles({ breakdown }: { breakdown: Doc<"finance_breakdowns"> }) {
  const size = breakdown.sizeBuckets;
  const sizeTotal = size.reduce((s, b) => s + b.amount, 0);
  const small = size.find((b) => b.key === "small");
  const geo = breakdown.geo;
  const geoKnown = geo.inState.amount + geo.outOfState.amount;
  const bucketLabel: Record<string, string> = {
    small: "under $200",
    mid: "$200–$999",
    large: "$1,000 and up",
  };
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sizeTotal > 0 && small && (
        <details className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
          <summary className="cursor-pointer">
            <span className="font-display text-xl">
              {Math.round((100 * small.amount) / sizeTotal)}%
            </span>{" "}
            <span className="text-sm">
              from donations under $200 ({small.count.toLocaleString("en-US")} donors)
            </span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {size.map((b) => (
              <li key={b.key} className="flex justify-between border-b border-dashed border-border pb-1">
                <span>{bucketLabel[b.key] ?? b.key}</span>
                <span className="font-mono">
                  {fmt(b.amount)} · {b.count.toLocaleString("en-US")} donors
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            Individual donors only, grouped by each donor&apos;s total
          </p>
        </details>
      )}
      {geoKnown > 0 && (
        <details className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
          <summary className="cursor-pointer">
            <span className="font-display text-xl">
              {Math.round((100 * geo.inState.amount) / geoKnown)}%
            </span>{" "}
            <span className="text-sm">from Wisconsin</span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {(
              [
                ["Wisconsin", geo.inState],
                ["Out of state", geo.outOfState],
                ["Unknown", geo.unknown],
              ] as const
            ).map(([label, g]) => (
              <li key={label} className="flex justify-between border-b border-dashed border-border pb-1">
                <span>{label}</span>
                <span className="font-mono">
                  {fmt(g.amount)} · {g.count.toLocaleString("en-US")} donors
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            Individuals and businesses; committees excluded
          </p>
        </details>
      )}
    </div>
  );
}

/** Monthly fundraising mini bars. */
function MomentumBars({ monthly }: { monthly: { month: string; receipts: number }[] }) {
  if (monthly.length < 2) return null;
  const max = Math.max(...monthly.map((m) => m.receipts));
  if (max <= 0) return null;
  const latest = monthly[monthly.length - 1].month;
  const monthLabel = (m: string) =>
    new Date(`${m}-15T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return (
    <div className="mt-3 border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
      <h3 className="font-mono text-xs font-bold uppercase tracking-widest">Monthly fundraising</h3>
      <div className="mt-2 flex h-20 items-end gap-1">
        {monthly.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month)}: ${fmt(m.receipts)}`}>
            <div
              style={{ height: `${Math.max(4, Math.round((100 * m.receipts) / max))}%` }}
            className={`w-full border border-border ${m.month === latest ? "bg-foreground" : "bg-muted-foreground/40"}`}
            />
            <span className="font-mono text-[9px] uppercase text-muted-foreground">
              {monthLabel(m.month)}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Monthly fundraising totals</caption>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              <td>{fmt(m.receipts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Non-interactive mini mix bar for the race comparison table. */
export function MixBarMini({ categories }: { categories: BreakdownCategory[] }) {
  const segments = computeSegments(categories);
  if (segments.length === 0) return null;
  return (
    <div
      className="flex h-4 w-28 overflow-hidden border border-border"
      role="img"
      aria-label={segments.map((s) => `${s.label} ${s.pct}%`).join(", ")}
    >
      {segments.map((s) => (
        <div key={s.key} style={{ width: `${s.pct}%`, backgroundColor: s.color }} className="h-full" />
      ))}
    </div>
  );
}

/** Shared legend for mini bars (render once above the race table). */
export function MixLegend({ keys }: { keys: string[] }) {
  const segments = computeSegments(
    keys.map((key) => ({ key, amount: 1, count: 1, topDonors: [] })),
  );
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {segments.map((s) => (
        <span key={s.key} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 border border-border" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Full candidate-page breakdown block. Renders nothing when no breakdown doc
 * exists (federal races and un-imported candidates look exactly like before).
 */
export function FinanceBreakdownSection({
  breakdown,
}: {
  breakdown?: Doc<"finance_breakdowns"> | null;
}) {
  if (!breakdown || breakdown.categories.length === 0) return null;
  return (
    <section className="mt-3">
      <Takeaways takeaways={breakdown.takeaways} />
      <FundingMixBar categories={breakdown.categories} />
      <SizeGeoTiles breakdown={breakdown} />
      <MomentumBars monthly={breakdown.monthly} />
    </section>
  );
}
```

- [ ] **Step 3: Render it on the candidate page** — in `src/app/candidates/[slug]/page.tsx`, import `FinanceBreakdownSection` from `@/components/guide/financeBreakdown`, and immediately after the `<FinanceDetail … />` element (~line 308) add:

```tsx
          <FinanceBreakdownSection
            breakdown={data.financeBreakdowns?.find((b) => b.source === "sunshine")}
          />
```

(Match the actual prop-source naming at the call site — the page holds the query result; mirror how `finance`/`contributions` reach `FinanceDetail`.)

- [ ] **Step 4: Verify with real dev data**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tests pass, no type errors.
Then: `pnpm dev` and open `http://localhost:3000/candidates/david-crowley` (dev deployment has breakdowns from Task 5 Step 2). Confirm: mix bar renders and segments sum visually to a full bar; tapping "Party committees" shows named donors; tiles and monthly bars render; geo tile shows "Unknown" dominating (state column arrives with the next fetch). Then open a federal candidate (e.g. `/candidates/gwen-moore`) and confirm the section is absent and the page is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/guide/financeBreakdown.tsx src/app/candidates/\[slug\]/page.tsx convex/public.ts convex/_generated
git commit -m "feat: candidate funding breakdown section with donor drill-down"
```

---

### Task 7: Race table "Where it's from" column

**Files:**
- Modify: `convex/public.ts` (race query at ~line 25: add breakdowns fetch)
- Modify: `src/components/guide/finance.tsx` (`FinanceRows`, `RaceFinanceTable`)
- Modify: `src/app/races/[slug]/page.tsx` (~line 272: pass breakdowns)

**Interfaces:**
- Consumes: `MixBarMini`, `MixLegend` (Task 6); `finance_breakdowns` docs.
- Produces: `RaceFinanceTable({ finance, candidates, breakdowns })` — `breakdowns?: Doc<"finance_breakdowns">[]` optional; table unchanged when absent/empty.

- [ ] **Step 1: Extend the race query** — in the race handler's `Promise.all` (finance_totals fetch ~line 41), add:

```ts
      ctx.db
        .query("finance_breakdowns")
        .withIndex("by_candidate", (q) => q.eq("raceId", raceId))
        .collect(),
```

Destructure as `financeBreakdowns`, include in the return object.

- [ ] **Step 2: Thread through the UI** — in `finance.tsx`:
  - `RaceFinanceTable` gains optional prop `breakdowns?: Doc<"finance_breakdowns">[]`; build `const breakdownBySlug = new Map((breakdowns ?? []).filter((b) => b.source === "sunshine").map((b) => [b.candidateSlug, b]));` and pass it to both `FinanceRows` calls. When `breakdownBySlug.size > 0`, render `<MixLegend keys={["individuals","party","union","pac","business","other"]} />` between the `<h2>` and the table.
  - `FinanceRows` gains `breakdownBySlug?: Map<string, Doc<"finance_breakdowns">>`. Add a `<th className="px-3 py-2 font-mono text-xs font-bold uppercase">Where it&apos;s from</th>` after "Raised", and in the body row after the Raised cell:

```tsx
              <td className="px-3 py-2">
                {(() => {
                  const b = breakdownBySlug?.get(t.candidateSlug);
                  return b ? <MixBarMini categories={b.categories} /> : <span className="font-mono text-xs">—</span>;
                })()}
              </td>
```

  Render the column only when `breakdownBySlug` has entries (otherwise keep today's exact table — header and cells both conditional on `breakdownBySlug?.size`).
  - Import `MixBarMini`, `MixLegend` from `./financeBreakdown`.

- [ ] **Step 3: Pass data on the race page** — at ~line 272 of `src/app/races/[slug]/page.tsx`: `<RaceFinanceTable finance={finance} candidates={candidates} breakdowns={data.financeBreakdowns} />` (mirror how `finance` reaches it today).

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Then in `pnpm dev`: `/races/wi-gov-2026` shows the legend + a mini bar per state candidate (Tiffany's visibly dominated by the party color) and `—` for none; a federal race (`/races/wi-us-house-d4-2026`) shows today's table unchanged, no legend, no column.

- [ ] **Step 5: Commit**

```bash
git add convex/public.ts src/components/guide/finance.tsx src/app/races/\[slug\]/page.tsx convex/_generated
git commit -m "feat: funding-mix comparison column on race money table"
```

---

### Task 8: Fresh fetch, prod import, live verification

**Files:** none created — operational.

- [ ] **Step 1: Regenerate the CSV with the state column**

Run: `node scripts/fetch-sunshine.mjs /tmp/sunshine-2026-aug3-v2.csv --dateFrom 2026-01-01 --dateTo 2026-08-03`
Expected: 13 committees, totals matching the Aug 3 import (Crowley receipts 1,135,725.66; Hong 1,126,758.43 — printed per committee).

- [ ] **Step 2: Deploy Convex schema/functions + site**

Deploy the Convex changes and the Next.js app the way this repo normally ships (`npx convex deploy` for prod Convex; site deploys via the existing Vercel flow on push). Confirm `npx convex run finance:financeGaps --prod` still returns `count: 0` afterward.

- [ ] **Step 3: Import breakdowns to prod**

Run: `node scripts/import-sunshine-breakdowns.mjs /tmp/sunshine-2026-aug3-v2.csv --prod --coverage "filings through Aug 3, 2026"`
Expected: 13 `✓` lines. **Editorial gate: read every printed takeaway sentence before proceeding.** Tiffany ≈ "Over 76% … party committees"; geo now populated (spot-check Hong's in-state share is plausible, 60–90%).

- [ ] **Step 4: Verify live** (ISR revalidate = 300s; fetch twice if stale)

Run: `curl -s https://badgerbrief.org/races/wi-gov-2026 | grep -c "Where it"` → ≥ 1
Run: `curl -s https://badgerbrief.org/candidates/david-crowley | grep -o "Where the money comes from"` → present
Check a federal page is unchanged: `curl -s https://badgerbrief.org/candidates/gwen-moore | grep -c "Where the money comes from"` → 0

- [ ] **Step 5: Commit any straggler generated files; done**

```bash
git status --short   # only files from this plan should appear; commit or leave per-file as appropriate
```

---

## Self-review notes

- Spec coverage: table/mutation (T1), state column (T2), pac-tags (T3), lib + takeaways (T4), CLI + eyeball gate + segment math (T5), candidate UI incl. callout/bar/tiles/momentum/drill-down + render-nothing (T6), race column + legend (T7), prod import + live check (T8). Out-of-scope items untouched.
- Spec's "component render tests" are implemented as pure-function tests on `computeSegments` (sum-to-100, absent → `[]`) because the repo has no DOM test environment; the render-nothing guard is a one-line conditional exercised in T6/T7 manual verification.
- Type/name consistency: `finance:upsertBreakdown`, `financeBreakdowns` query field, `FinanceBreakdownSection`, `MixBarMini`, `MixLegend`, `computeSegments`, `CATEGORY_META` used consistently across tasks.

## Post-review deviations resolved

- F1: the spec's coverage/basis micro-label under the breakdown section was a spec requirement this plan omitted from Task 6 — now rendered in `FinanceBreakdownSection`.
- F2: the spec's sub-1%-category collapse into `other` was a spec requirement this plan's `computeSegments` skipped — now implemented, with a `<1%` display guard as a belt-and-suspenders backstop.
