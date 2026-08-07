# Donor Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full donor drill-down for voters and journalists — searchable per-candidate rosters, cross-candidate donor pages (noindex), gift-level detail, CSV export, and voter-chat donor tools — live before the Aug 11 primary.

**Architecture:** One new Convex table `donor_totals` (one doc per donor+candidate+source, gifts embedded), written at import time by a new CLI that reuses the breakdowns lib's category/cycle helpers. Read paths are indexed-only public queries in `convex/donors.ts`; UI is a paginated client roster inside the existing money section plus server-rendered donor pages; chat gets two read-only tools gated by the golden-question eval. Spec: `docs/superpowers/specs/2026-08-07-donor-explorer-design.md`.

**Tech Stack:** Convex (paginated queries + search index), Next.js App Router, `convex/react` `usePaginatedQuery`, `convex/nextjs` `fetchQuery`, @convex-dev/agent chat tools, vitest (+ convex-test).

## Global Constraints

- `donorKey` = exact reported name, trimmed, whitespace-collapsed, lowercased. NO fuzzy merging; different spellings stay separate donors; disclosure copy covers it.
- Category assignment MUST reuse the exported helpers from `scripts/lib/breakdowns.mjs` — a donor's category can never disagree with the mix bar.
- Gifts embedded per doc, sorted date-ascending, capped at the 500 NEWEST with `giftsTruncated: true`; `total`/`giftCount` always computed from ALL gifts (exact even when the list is capped).
- All Convex reads indexed-only (`by_candidate_total`, `by_donor`, `search_name`) — no table scans, no unindexed filters.
- Donor pages: `robots: { index: false, follow: false }`, never added to `src/app/sitemap.ts`.
- Coverage label travels with donor numbers everywhere: roster footer, donor page footer, CSV comment line, chat tool output.
- Chat: read-only tools only (governance rule in voterHelp.ts header); donor facts only from tools; `convex/voterHelp.ts` gets AT MOST: one import, two tool-list entries, two instruction rules. The working tree's uncommitted voterHelp.ts edit stays untouched (work happens in a worktree from committed HEAD).
- Sunshine (state) data only in v1; `source: "openfec"` allowed by schema, nothing writes or renders it.
- No new npm dependencies. House styling: neo-brutalist classes copied from `finance.tsx` neighbors. Commit style `type: description`, no attribution footer. Commit after every task; only files the task names.
- Site deploys are MANUAL: `vercel --prod` from a clean checkout (git push does NOT deploy).

## File Map

| File | Action | Responsibility |
|---|---|---|
| `convex/schema.ts` | modify | `donor_totals` table + indexes + search index |
| `convex/finance.ts` | modify | `clearDonors`, `insertDonors` internal mutations |
| `convex/finance.test.ts` | modify | mutation tests |
| `scripts/lib/breakdowns.mjs` | modify | export `categoryFor`, `normalizeState`, `location`, `idx` |
| `scripts/lib/donors.mjs` | create | `donorKeyFor`, `computeDonorRosters` (pure) |
| `scripts/lib/donors.test.mjs` | create | roster computation tests |
| `scripts/import-sunshine-donors.mjs` | create | CLI: CSV → clear+insert batches |
| `convex/donors.ts` | create | public queries: roster, searchRoster, profile, searchDonors |
| `convex/donors.test.ts` | create | query tests (pagination order, profile totals) |
| `src/components/guide/donorRoster.tsx` | create | client roster (search, chips, load-more, CSV link) |
| `src/app/candidates/[slug]/page.tsx` | modify | mount roster after FinanceBreakdownSection |
| `src/app/donors/[key]/page.tsx` | create | donor profile page, noindex |
| `src/app/api/donors/route.ts` | create | CSV export |
| `convex/financeChatTools.ts` | create | `getCandidateDonors`, `getDonorProfile` tools |
| `convex/lib/agentTelemetry.ts` | modify | add shared `withToolSpan` (used by new tools) |
| `convex/voterHelp.ts` | modify | import + 2 tool entries + 2 instruction rules |
| `scripts/golden-questions.json` | modify | +3 donor questions |

---

### Task 1: Schema + clear/insert mutations

**Files:**
- Modify: `convex/schema.ts` (after the `finance_breakdowns` table)
- Modify: `convex/finance.ts` (after `upsertBreakdown`)
- Test: `convex/finance.test.ts`

**Interfaces:**
- Produces: table `donor_totals` (shape below); `finance:clearDonors({ raceId, candidateSlug, source, cursor: string|null })` → `{ deleted, continueCursor, isDone }`; `finance:insertDonors({ docs })` → number inserted. Later tasks rely on these exact names/shapes.

- [ ] **Step 1: Add the table to `convex/schema.ts`**

```ts
  // Full donor rosters (spec: 2026-08-07-donor-explorer). One doc per
  // (donor, candidate, source); gifts embedded, capped at the 500 newest
  // (giftsTruncated flags the cap; total/giftCount stay exact). donorKey is
  // the trimmed, whitespace-collapsed, LOWERCASED reported name — exact-name
  // identity, never fuzzy-merged.
  donor_totals: defineTable({
    donorKey: v.string(),
    donorName: v.string(),
    candidateSlug: v.string(),
    raceId: v.string(),
    source: v.union(v.literal("openfec"), v.literal("sunshine")),
    category: v.string(), // individuals | party | union | pac | business | other
    location: v.optional(v.string()),
    state: v.optional(v.string()), // normalized two-letter-ish code, e.g. "WI"
    total: v.number(),
    giftCount: v.number(),
    gifts: v.array(v.object({ date: v.optional(v.string()), amount: v.number() })),
    giftsTruncated: v.optional(v.boolean()),
    coverageEndDate: v.optional(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_candidate_total", ["raceId", "candidateSlug", "total"])
    .index("by_donor", ["donorKey"])
    .searchIndex("search_name", {
      searchField: "donorName",
      filterFields: ["raceId", "candidateSlug"],
    }),
```

- [ ] **Step 2: Write the failing tests in `convex/finance.test.ts`** (reuse the file's existing `convexTest(schema, modules)` harness):

```ts
const donorDoc = (n: number) => ({
  donorKey: `donor ${n}`,
  donorName: `Donor ${n}`,
  candidateSlug: "david-crowley",
  raceId: "WI-GOV-2026",
  source: "sunshine" as const,
  category: "individuals",
  total: n * 100,
  giftCount: 1,
  gifts: [{ date: "2026-07-01", amount: n * 100 }],
  coverageEndDate: "filings through Aug 3, 2026",
});

test("insertDonors stamps fetchedAt; clearDonors pages until done", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.insertDonors, {
    docs: [donorDoc(1), donorDoc(2), donorDoc(3)],
  });
  const rows = await t.run((ctx) => ctx.db.query("donor_totals").collect());
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.fetchedAt > 0)).toBe(true);

  let cursor: string | null = null;
  let deleted = 0;
  for (;;) {
    const res = await t.mutation(internal.finance.clearDonors, {
      raceId: "WI-GOV-2026",
      candidateSlug: "david-crowley",
      source: "sunshine",
      cursor,
    });
    deleted += res.deleted;
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  expect(deleted).toBe(3);
  const left = await t.run((ctx) => ctx.db.query("donor_totals").collect());
  expect(left).toHaveLength(0);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run convex/finance.test.ts -t "insertDonors"`
Expected: FAIL (`insertDonors` does not exist)

- [ ] **Step 4: Implement in `convex/finance.ts`**

```ts
const donorFields = {
  donorKey: v.string(),
  donorName: v.string(),
  candidateSlug: v.string(),
  raceId: v.string(),
  source: financeSource,
  category: v.string(),
  location: v.optional(v.string()),
  state: v.optional(v.string()),
  total: v.number(),
  giftCount: v.number(),
  gifts: v.array(v.object({ date: v.optional(v.string()), amount: v.number() })),
  giftsTruncated: v.optional(v.boolean()),
  coverageEndDate: v.optional(v.string()),
};

/** Delete one page of a candidate's donor rows for a source; loop via cursor. */
export const clearDonors = internalMutation({
  args: {
    raceId: v.string(),
    candidateSlug: v.string(),
    source: financeSource,
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { raceId, candidateSlug, source, cursor }) => {
    const page = await ctx.db
      .query("donor_totals")
      .withIndex("by_candidate_total", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .paginate({ cursor, numItems: 1000 });
    let deleted = 0;
    for (const row of page.page) {
      if (row.source !== source) continue;
      await ctx.db.delete(row._id);
      deleted++;
    }
    return { deleted, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const insertDonors = internalMutation({
  args: { docs: v.array(v.object(donorFields)) },
  handler: async (ctx, { docs }) => {
    const now = Date.now();
    for (const d of docs) {
      await ctx.db.insert("donor_totals", { ...d, fetchedAt: now });
    }
    return docs.length;
  },
});
```

- [ ] **Step 5: Run `npx vitest run convex/finance.test.ts`** — all pass (pre-existing included). Then `npx convex codegen`.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/finance.ts convex/finance.test.ts convex/_generated
git commit -m "feat: donor_totals table + clear/insert mutations"
```

---

### Task 2: Roster computation lib (TDD)

**Files:**
- Modify: `scripts/lib/breakdowns.mjs` (add `export` keyword to `categoryFor`, `normalizeState`, `location`, `idx` — no logic changes)
- Create: `scripts/lib/donors.mjs`
- Test: `scripts/lib/donors.test.mjs`

**Interfaces:**
- Consumes: `parseCsv` from `./sunshine.mjs`; `categoryFor`, `location`, `idx` from `./breakdowns.mjs` (exported in this task).
- Produces: `donorKeyFor(name): string`; `computeDonorRosters(csvText, pacTags, { cycle = "2026" } = {})` → `Map<committeeName, donorDoc[]>` where donorDoc = `{ donorKey, donorName, category, location?, state?, total, giftCount, gifts, giftsTruncated? }` sorted by total descending. Task 3's CLI consumes this.

- [ ] **Step 1: Export the shared helpers** — in `scripts/lib/breakdowns.mjs`, change `function categoryFor(`, `function normalizeState(`, `const location =`, `function idx(` to `export function` / `export const`. Run `npx vitest run scripts/lib/breakdowns.test.mjs` — still green (no behavior change).

- [ ] **Step 2: Write the failing tests** (`scripts/lib/donors.test.mjs`):

```js
import { describe, expect, test } from "vitest";
import { computeDonorRosters, donorKeyFor } from "./donors.mjs";

const HEADER =
  "ID,Transaction Date,Amount,Registrant Name,Transaction Type,Contributor Name,Contributor Entity Type,Contributor City,Contributor State,Related Ballot Event Name";
const row = (id, date, amount, committee, type, donor, entityType, city, state, event = "") =>
  [id, date, amount, committee, type, donor, entityType, city, state, event].join(",");

const CSV = [
  HEADER,
  row(1, "2026-01-15", 100, "Test Comm", "Contribution", "Alice A", "Individual", "Madison", "WI"),
  row(2, "2026-07-02", 150, "Test Comm", "Contribution", "alice  a", "Individual", "Madison", "Wisconsin"),
  row(3, "2026-07-10", 50, "Test Comm", "Contribution", "Bob B", "Individual", "Chicago", "IL"),
  row(4, "2026-07-11", 500, "Test Comm", "Contribution", "WEAC PAC", "Registrant", "Madison", "WI"),
  row(5, "2026-03-01", 999, "Test Comm", "Disbursement", "Vendor", "Business", "", ""),
  row(6, "2026-03-02", 777, "Test Comm", "Contribution", "Old Donor", "Individual", "", "", "2020 Fall General"),
].join("\n");

const TAGS = { "WEAC PAC": "union" };

describe("donorKeyFor", () => {
  test("trims, collapses whitespace, lowercases", () => {
    expect(donorKeyFor("  Alice   A ")).toBe("alice a");
  });
});

describe("computeDonorRosters", () => {
  const roster = computeDonorRosters(CSV, TAGS).get("Test Comm");

  test("aggregates case/whitespace variants under one donorKey", () => {
    const alice = roster.find((d) => d.donorKey === "alice a");
    expect(alice).toMatchObject({
      donorName: "Alice A", // first-seen display form
      category: "individuals",
      total: 250,
      giftCount: 2,
      location: "Madison, WI",
      state: "WI",
    });
    expect(alice.gifts).toEqual([
      { date: "2026-01-15", amount: 100 },
      { date: "2026-07-02", amount: 150 },
    ]);
  });

  test("category matches pac-tags path; sorted by total desc", () => {
    expect(roster[0]).toMatchObject({ donorKey: "weac pac", category: "union", total: 500 });
    expect(roster.map((d) => d.total)).toEqual([...roster.map((d) => d.total)].sort((a, b) => b - a));
  });

  test("disbursements and old-cycle rows excluded; state normalizes Wisconsin→WI", () => {
    expect(roster.find((d) => d.donorKey === "vendor")).toBeUndefined();
    expect(roster.find((d) => d.donorKey === "old donor")).toBeUndefined();
    expect(roster.find((d) => d.donorKey === "bob b").state).toBe("IL");
  });

  test("gifts capped at 500 newest with exact totals", () => {
    const many = [HEADER];
    for (let i = 1; i <= 600; i++) {
      const mm = String((i % 12) + 1).padStart(2, "0");
      const dd = String((i % 27) + 1).padStart(2, "0");
      many.push(row(i, `2026-${mm}-${dd}`, 1, "Big Comm", "Contribution", "Recurring R", "Individual", "", ""));
    }
    const big = computeDonorRosters(many.join("\n"), {}).get("Big Comm")[0];
    expect(big.giftCount).toBe(600);
    expect(big.total).toBe(600);
    expect(big.gifts).toHaveLength(500);
    expect(big.giftsTruncated).toBe(true);
    // capped list keeps the NEWEST gifts (still date-ascending)
    const dates = big.gifts.map((g) => g.date);
    expect(dates).toEqual([...dates].sort());
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run scripts/lib/donors.test.mjs` → FAIL (module not found)

- [ ] **Step 4: Implement `scripts/lib/donors.mjs`**

```js
/**
 * Full donor rosters from a Sunshine transactions CSV (fetch-sunshine.mjs
 * shape). Spec: docs/superpowers/specs/2026-08-07-donor-explorer-design.md.
 * Shares row filtering and category assignment with computeBreakdowns via the
 * exported helpers — a donor's category can never disagree with the mix bar.
 */
import { parseCsv } from "./sunshine.mjs";
import { categoryFor, idx, location } from "./breakdowns.mjs";

const GIFT_CAP = 500;

/** Exact-name identity: trimmed, whitespace-collapsed, lowercased. Never fuzzy. */
export const donorKeyFor = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

const stateCode = (s) => {
  const up = (s ?? "").trim().toUpperCase();
  if (!up) return undefined;
  return up === "WISCONSIN" ? "WI" : up;
};

export function computeDonorRosters(csvText, pacTags, { cycle = "2026" } = {}) {
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
  const tags = Object.fromEntries(Object.entries(pacTags).map(([k, v]) => [k.trim(), v]));

  // committee -> donorKey -> accumulating doc
  const perCommittee = new Map();
  for (const r of rows.slice(1)) {
    const committee = (r[iCommittee] ?? "").trim();
    const amount = Number((r[iAmount] ?? "").replace(/[$,]/g, ""));
    const type = iType >= 0 ? (r[iType] ?? "").trim().toLowerCase() : "";
    if (!committee || !Number.isFinite(amount)) continue;
    const isIn = !type || type.includes("contribution") || type.includes("receipt");
    if (!isIn) continue;
    const event = iEvent >= 0 ? (r[iEvent] ?? "").trim() : "";
    if (event && !event.includes(cycle)) continue;

    const rawName = (r[iDonor] ?? "").trim() || "(unnamed)";
    const key = donorKeyFor(rawName);
    const donors = perCommittee.get(committee) ?? new Map();
    const d = donors.get(key) ?? {
      donorKey: key,
      donorName: rawName,
      category: categoryFor(r[iEntity], rawName, tags),
      location: location(r[iCity], stateCode(r[iState])),
      state: stateCode(r[iState]),
      total: 0,
      giftCount: 0,
      gifts: [],
    };
    d.total = Math.round((d.total + amount) * 100) / 100;
    d.giftCount++;
    const date = (r[iDate] ?? "").trim() || undefined;
    d.gifts.push(date ? { date, amount } : { amount });
    if (!d.location) d.location = location(r[iCity], stateCode(r[iState]));
    if (!d.state) d.state = stateCode(r[iState]);
    donors.set(key, d);
    perCommittee.set(committee, donors);
  }

  const out = new Map();
  for (const [committee, donors] of perCommittee) {
    const list = [...donors.values()].map((d) => {
      d.gifts.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1));
      const doc = { ...d };
      if (doc.gifts.length > GIFT_CAP) {
        doc.gifts = doc.gifts.slice(-GIFT_CAP); // keep newest, still ascending
        doc.giftsTruncated = true;
      }
      if (doc.location === undefined) delete doc.location;
      if (doc.state === undefined) delete doc.state;
      return doc;
    });
    list.sort((a, b) => b.total - a.total);
    out.set(committee, list);
  }
  return out;
}
```

- [ ] **Step 5: Run `npx vitest run scripts/lib/donors.test.mjs scripts/lib/breakdowns.test.mjs`** — all pass. Then full suite once: `npx vitest run` — green.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/breakdowns.mjs scripts/lib/donors.mjs scripts/lib/donors.test.mjs
git commit -m "feat: donor roster computation lib"
```

---

### Task 3: Donor import CLI + dev import

**Files:**
- Create: `scripts/import-sunshine-donors.mjs`

**Interfaces:**
- Consumes: `computeDonorRosters` (Task 2); `finance:clearDonors` / `finance:insertDonors` (Task 1); `scripts/sunshine-committees.json`, `scripts/pac-tags.json` (existing).
- Produces: CLI `node scripts/import-sunshine-donors.mjs <export.csv> [--prod] [--coverage <label>]`. Task 9 runs it against prod.

- [ ] **Step 1: Write the CLI**

```js
#!/usr/bin/env node
/**
 * Import full donor rosters from a Sunshine transactions CSV into Convex
 * (donor_totals). Run AFTER import-sunshine.mjs, same CSV:
 *   node scripts/import-sunshine-donors.mjs <export.csv> [--prod] [--coverage <label>]
 * Clear-then-insert per committee (batches of 500; paged deletes).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { computeDonorRosters } from "./lib/donors.mjs";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error("Usage: node scripts/import-sunshine-donors.mjs <export.csv> [--prod] [--coverage <label>]");
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

const rosters = computeDonorRosters(readFileSync(csvPath, "utf8"), pacTags);
let committees = 0;
for (const [committee, donors] of rosters) {
  const match = mapping[committee];
  if (!match) continue; // import-sunshine.mjs already reports unmatched committees
  const base = { candidateSlug: match.candidateSlug, raceId: match.raceId, source: "sunshine" };

  let cursor = null;
  for (;;) {
    const out = JSON.parse(run("finance:clearDonors", { ...base, cursor }));
    if (out.isDone) break;
    cursor = out.continueCursor;
  }
  for (let i = 0; i < donors.length; i += 500) {
    const docs = donors.slice(i, i + 500).map((d) => ({ ...d, ...base, coverageEndDate: coverage }));
    run("finance:insertDonors", { docs });
  }
  committees++;
  console.log(
    `✓ ${committee} → ${match.candidateSlug}: ${donors.length.toLocaleString("en-US")} donors, ` +
      `top: ${donors[0]?.donorName} ($${(donors[0]?.total ?? 0).toLocaleString("en-US")})`,
  );
}
console.log(`\nImported rosters for ${committees} committees.`);
```

- [ ] **Step 2: Push functions to the dev deployment** — `npx convex dev --once` (never `--prod` in this task).

- [ ] **Step 3: Dev import with the real CSV** — the Aug 3 v2 CSV should be at `/tmp/sunshine-2026-aug3-v2.csv`; if missing, regenerate: `node scripts/fetch-sunshine.mjs /tmp/sunshine-2026-aug3-v2.csv --dateFrom 2026-01-01 --dateTo 2026-08-03`. Then:
`node scripts/import-sunshine-donors.mjs /tmp/sunshine-2026-aug3-v2.csv --coverage "filings through Aug 3, 2026"`
Expected: 13 ✓ lines; Hong ≈ 13k donors; Crowley's top donor a union PAC at $86,000. Takes a while (paged writes) — that's normal.

- [ ] **Step 4: Sanity-check dev data** — `npx convex data donor_totals --limit 3` shows docs with gifts arrays.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-sunshine-donors.mjs
git commit -m "feat: donor roster import CLI"
```

---

### Task 4: Public donor queries (TDD)

**Files:**
- Create: `convex/donors.ts`
- Test: `convex/donors.test.ts`

**Interfaces:**
- Produces (Tasks 5–8 rely on these exact names):
  - `api.donors.roster({ raceId, candidateSlug, paginationOpts })` → paginated `donor_totals` docs, total-descending.
  - `api.donors.searchRoster({ raceId, candidateSlug, term })` → up to 20 docs.
  - `api.donors.profile({ donorKey })` → `{ donors: Doc[], grandTotal: number } | null` (null when no rows).
  - `api.donors.searchDonors({ term })` → up to 20 docs (global).

- [ ] **Step 1: Write the failing tests** (`convex/donors.test.ts`, same harness as finance.test.ts — copy its imports):

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");

const doc = (key: string, total: number, slug = "david-crowley") => ({
  donorKey: key,
  donorName: key.toUpperCase(),
  candidateSlug: slug,
  raceId: "WI-GOV-2026",
  source: "sunshine" as const,
  category: "individuals",
  total,
  giftCount: 1,
  gifts: [{ date: "2026-07-01", amount: total }],
});

test("roster pages in descending total order", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.insertDonors, {
    docs: [doc("a", 50), doc("b", 500), doc("c", 200)],
  });
  const page = await t.query(api.donors.roster, {
    raceId: "WI-GOV-2026",
    candidateSlug: "david-crowley",
    paginationOpts: { cursor: null, numItems: 2 },
  });
  expect(page.page.map((d) => d.total)).toEqual([500, 200]);
  expect(page.isDone).toBe(false);
  const rest = await t.query(api.donors.roster, {
    raceId: "WI-GOV-2026",
    candidateSlug: "david-crowley",
    paginationOpts: { cursor: page.continueCursor, numItems: 2 },
  });
  expect(rest.page.map((d) => d.total)).toEqual([50]);
});

test("profile aggregates across candidates; null when unknown", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.insertDonors, {
    docs: [doc("weac pac", 86000, "kelda-roys"), doc("weac pac", 1000, "francesca-hong")],
  });
  const p = await t.query(api.donors.profile, { donorKey: "weac pac" });
  expect(p?.grandTotal).toBe(87000);
  expect(p?.donors.map((d) => d.candidateSlug).sort()).toEqual(["david-crowley", "francesca-hong", "kelda-roys"].filter((s) => s !== "david-crowley"));
  expect(await t.query(api.donors.profile, { donorKey: "nobody" })).toBeNull();
});
```

(Fix the second assertion to the plain form: `expect(p?.donors.map((d) => d.candidateSlug).sort()).toEqual(["francesca-hong", "kelda-roys"]);` — write it that way in the file.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run convex/donors.test.ts` → FAIL

- [ ] **Step 3: Implement `convex/donors.ts`**

```ts
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";

/** Public read-only donor queries (spec: 2026-08-07-donor-explorer). All
 * indexed-only — no table scans. */

export const roster = query({
  args: {
    raceId: v.string(),
    candidateSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { raceId, candidateSlug, paginationOpts }) =>
    await ctx.db
      .query("donor_totals")
      .withIndex("by_candidate_total", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .order("desc")
      .paginate(paginationOpts),
});

export const searchRoster = query({
  args: { raceId: v.string(), candidateSlug: v.string(), term: v.string() },
  handler: async (ctx, { raceId, candidateSlug, term }) => {
    if (term.trim().length < 2) return [];
    return await ctx.db
      .query("donor_totals")
      .withSearchIndex("search_name", (q) =>
        q.search("donorName", term).eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .take(20);
  },
});

export const profile = query({
  args: { donorKey: v.string() },
  handler: async (ctx, { donorKey }) => {
    const donors = await ctx.db
      .query("donor_totals")
      .withIndex("by_donor", (q) => q.eq("donorKey", donorKey))
      .collect();
    if (donors.length === 0) return null;
    donors.sort((a, b) => b.total - a.total);
    return {
      donors,
      grandTotal: Math.round(donors.reduce((s, d) => s + d.total, 0) * 100) / 100,
    };
  },
});

export const searchDonors = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    if (term.trim().length < 2) return [];
    return await ctx.db
      .query("donor_totals")
      .withSearchIndex("search_name", (q) => q.search("donorName", term))
      .take(20);
  },
});
```

- [ ] **Step 4: `npx vitest run convex/donors.test.ts`** — pass; `npx convex codegen`; full suite green.

- [ ] **Step 5: Commit**

```bash
git add convex/donors.ts convex/donors.test.ts convex/_generated
git commit -m "feat: public donor roster/profile/search queries"
```

---

### Task 5: DonorRoster component + candidate page mount

**Files:**
- Create: `src/components/guide/donorRoster.tsx`
- Modify: `src/app/candidates/[slug]/page.tsx` (immediately after `<FinanceBreakdownSection …/>`)

**Interfaces:**
- Consumes: `api.donors.roster`, `api.donors.searchRoster` (Task 4); `CATEGORY_META` from `@/lib/financeSegments`; `Doc<"finance_breakdowns">` for the donor count.
- Produces: `DonorRosterSection({ raceId, candidateSlug, breakdown })` — renders nothing when `breakdown` absent (donor count derives from it; no extra count query, a deliberate deviation from the spec's `rosterCount`, noted in the spec's terms: cheaper and equivalent).

- [ ] **Step 1: Create `src/components/guide/donorRoster.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { CATEGORY_META } from "@/lib/financeSegments";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const donorHref = (key: string) => `/donors/${encodeURIComponent(key)}`;

function DonorRow({ d }: { d: Doc<"donor_totals"> }) {
  const meta = CATEGORY_META[d.category];
  return (
    <li className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
      <span className="min-w-0">
        <Link href={donorHref(d.donorKey)} className="font-bold underline">
          {d.donorName}
        </Link>
        {d.location ? <span className="text-muted-foreground"> ({d.location})</span> : null}
        {meta && (
          <span className="ml-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
            <span className="inline-block h-2 w-2 border border-border" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono">
        {fmt(d.total)}
        <span className="ml-1 text-[10px] text-muted-foreground">·{d.giftCount}</span>
      </span>
    </li>
  );
}

function RosterBody({ raceId, candidateSlug }: { raceId: string; candidateSlug: string }) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const paged = usePaginatedQuery(
    api.donors.roster,
    { raceId, candidateSlug },
    { initialNumItems: 50 },
  );
  const searched = useQuery(
    api.donors.searchRoster,
    term.trim().length >= 2 ? { raceId, candidateSlug, term } : "skip",
  );
  const searching = term.trim().length >= 2;
  const rows = (searching ? (searched ?? []) : paged.results).filter(
    (d) => !category || d.category === category,
  );
  const coverage = rows[0]?.coverageEndDate ?? paged.results[0]?.coverageEndDate;
  return (
    <div className="mt-2 border-2 border-dashed border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search donors by name…"
          aria-label="Search donors by name"
          className="w-56 border-2 border-border bg-card px-2 py-1 text-sm"
        />
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            onClick={() => setCategory(category === key ? null : key)}
            className={`flex items-center gap-1 border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
              category === key ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            <span className="inline-block h-2 w-2 border border-border" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map((d) => (
          <DonorRow key={d._id} d={d} />
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {searching ? "No donors match that search." : "Loading donors…"}
        </p>
      )}
      {!searching && paged.status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => paged.loadMore(200)}
          className="mt-3 border-2 border-border bg-warning px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          Load more donors
        </button>
      )}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {coverage ? `Itemized contributions, ${coverage} · ` : ""}
        <a href={`/api/donors?race=${raceId}&candidate=${candidateSlug}`} className="underline">
          Download CSV
        </a>{" "}
        · Names as reported; the same person may appear under multiple spellings
      </p>
    </div>
  );
}

/** "See all N donors" expander under the candidate money section. */
export function DonorRosterSection({
  raceId,
  candidateSlug,
  breakdown,
}: {
  raceId: string;
  candidateSlug: string;
  breakdown?: Doc<"finance_breakdowns"> | null;
}) {
  const [open, setOpen] = useState(false);
  if (!breakdown || breakdown.categories.length === 0) return null;
  const donorCount = breakdown.categories.reduce((s, c) => s + c.count, 0);
  return (
    <section className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="border-2 border-border bg-card px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
      >
        {open ? "▾" : "▸"} See all {donorCount.toLocaleString("en-US")} donors
      </button>
      {open && <RosterBody raceId={raceId} candidateSlug={candidateSlug} />}
    </section>
  );
}
```

- [ ] **Step 2: Mount on the candidate page** — in `src/app/candidates/[slug]/page.tsx`, import `DonorRosterSection` from `@/components/guide/donorRoster` and render immediately after the existing `<FinanceBreakdownSection …/>`:

```tsx
          <DonorRosterSection
            raceId={candidate.raceId}
            candidateSlug={candidate.slug}
            breakdown={financeBreakdowns?.find((b) => b.source === "sunshine")}
          />
```

(Mirror the page's actual variable names — `financeBreakdowns` is already destructured there; the candidate object's accessor may differ, match what the page uses for raceId/slug.)

- [ ] **Step 3: Verify** — `npx vitest run && npx tsc --noEmit` clean. Then `pnpm dev`: on `/candidates/david-crowley`, the "See all N donors" button appears; opening it loads 50 rows sorted by amount (top ≈ $86,000 union PACs); searching "hendricks" filters; a category chip filters; "Load more donors" appends; donor names link to `/donors/…` (404 until Task 6 — expected). `/candidates/gwen-moore` unchanged (no button). Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/guide/donorRoster.tsx src/app/candidates/\[slug\]/page.tsx
git commit -m "feat: full searchable donor roster on candidate pages"
```

---

### Task 6: Donor profile pages (noindex)

**Files:**
- Create: `src/app/donors/[key]/page.tsx`

**Interfaces:**
- Consumes: `api.donors.profile`, `api.donors.searchDonors` (Task 4); `fetchQuery` from `convex/nextjs` (pattern: `src/lib/data.ts`); `CATEGORY_META`.
- Produces: route `/donors/[key]`; `robots: { index: false, follow: false }`; NOT added to `src/app/sitemap.ts`.

- [ ] **Step 1: Create `src/app/donors/[key]/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { CATEGORY_META } from "@/lib/financeSegments";

export const revalidate = 300;

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const profile = await fetchQuery(api.donors.profile, { donorKey: decodeURIComponent(key) });
  return {
    title: profile
      ? `${profile.donors[0].donorName} — campaign giving | BadgerBrief`
      : "Donor not found | BadgerBrief",
    robots: { index: false, follow: false }, // public record on-site, not Google-surfaced (spec)
  };
}

export default async function DonorPage({ params }: Props) {
  const { key } = await params;
  const donorKey = decodeURIComponent(key);
  const profile = await fetchQuery(api.donors.profile, { donorKey });

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-2xl">No donor found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No reported contributions under this exact name. Names must match the
          WI Ethics Commission filings exactly — try a search:
        </p>
        <form action="/donors" className="mt-3">
          {/* simple GET form: /donors?q=… handled below via searchParams on this same segment is not needed; link to candidate pages instead */}
        </form>
        <p className="mt-3 text-sm">
          Browse donors from any candidate&apos;s page — each money section has a
          full searchable donor list.{" "}
          <Link href="/races/wi-gov-2026" className="underline">
            Governor&apos;s race →
          </Link>
        </p>
      </main>
    );
  }

  const { donors, grandTotal } = profile;
  const display = donors[0];
  const gifts = donors
    .flatMap((d) => d.gifts.map((g) => ({ ...g, candidateSlug: d.candidateSlug })))
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
  const truncated = donors.some((d) => d.giftsTruncated);
  const coverage = display.coverageEndDate;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl">{display.donorName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {display.location ?? ""}
        {display.location ? " · " : ""}
        {CATEGORY_META[display.category]?.label ?? display.category}
      </p>
      <p className="mt-3 border-2 border-border bg-card p-3 font-mono text-xl shadow-[var(--shadow-brutal)]">
        {fmt(grandTotal)}{" "}
        <span className="text-xs text-muted-foreground">
          to {donors.length} campaign{donors.length === 1 ? "" : "s"} tracked by BadgerBrief
        </span>
      </p>

      <h2 className="mt-6 font-display text-xl">By candidate</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {donors.map((d) => (
          <li key={d._id} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
            <Link href={`/candidates/${d.candidateSlug}`} className="font-bold underline">
              {d.candidateSlug.replaceAll("-", " ")}
            </Link>
            <span className="font-mono">
              {fmt(d.total)} <span className="text-[10px] text-muted-foreground">·{d.giftCount} gifts</span>
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 font-display text-xl">Gifts</h2>
      <div className="mt-2 overflow-x-auto border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <table className="w-full min-w-[360px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-secondary text-left">
              <th className="px-3 py-2 font-mono text-xs font-bold uppercase">Date</th>
              <th className="px-3 py-2 font-mono text-xs font-bold uppercase">Amount</th>
              <th className="px-3 py-2 font-mono text-xs font-bold uppercase">To</th>
            </tr>
          </thead>
          <tbody>
            {gifts.map((g, i) => (
              <tr key={i} className="border-b border-dashed border-border">
                <td className="px-3 py-2 font-mono text-xs">{g.date ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{fmt(g.amount)}</td>
                <td className="px-3 py-2">{g.candidateSlug.replaceAll("-", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="mt-1 text-xs text-muted-foreground">
          Gift list truncated to the 500 most recent per campaign; totals include all gifts.
        </p>
      )}

      <p className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Names appear exactly as reported to the{" "}
        <a href="https://campaignfinance.wi.gov" className="underline" rel="noopener noreferrer" target="_blank">
          WI Ethics Commission (Sunshine)
        </a>
        ; the same person may appear under multiple spellings.
        {coverage ? ` Itemized contributions, ${coverage}.` : ""} Non-commercial voter education use.
      </p>
    </main>
  );
}
```

Remove the empty `<form>` placeholder block entirely before committing — the not-found state keeps only the prose + link (the global donor search box ships with the `/money` hub, out of scope here; do not build a dead form).

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. `pnpm dev`: visit a real donor from Crowley's roster (e.g. `/donors/weac%20pac` after Task 3's dev import — pick a key that exists); page shows grand total, per-candidate cards, gifts table; `curl -s localhost:PORT/donors/weac%20pac | grep -c 'noindex'` ≥ 1; a nonsense key shows the not-found state. Confirm `src/app/sitemap.ts` has no donor entries (no change made). Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/donors
git commit -m "feat: donor profile pages (noindex)"
```

---

### Task 7: CSV export route

**Files:**
- Create: `src/app/api/donors/route.ts`

**Interfaces:**
- Consumes: `api.donors.roster` via `fetchQuery` (pattern: `src/app/api/geocode/route.ts` for the handler shape).
- Produces: `GET /api/donors?race=<raceId>&candidate=<slug>` → `text/csv` attachment; 400 on bad params; 404 when no rows.

- [ ] **Step 1: Create `src/app/api/donors/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";

/**
 * CSV export of a candidate's full donor roster (spec: 2026-08-07-donor-
 * explorer). Public record; the statute note travels in the file header.
 */

const csvCell = (s: string | number | undefined) => {
  const v = String(s ?? "");
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export async function GET(req: NextRequest) {
  const race = req.nextUrl.searchParams.get("race")?.trim() ?? "";
  const candidate = req.nextUrl.searchParams.get("candidate")?.trim() ?? "";
  if (!/^[A-Z0-9-]{3,40}$/.test(race) || !/^[a-z0-9-]{2,60}$/.test(candidate)) {
    return NextResponse.json({ ok: false, error: "bad_params" }, { status: 400 });
  }

  const lines: string[] = [];
  let cursor: string | null = null;
  let coverage: string | undefined;
  for (;;) {
    const page = await fetchQuery(api.donors.roster, {
      raceId: race,
      candidateSlug: candidate,
      paginationOpts: { cursor, numItems: 500 },
    });
    for (const d of page.page) {
      coverage ??= d.coverageEndDate;
      const dates = d.gifts.map((g) => g.date ?? "").filter(Boolean).sort();
      lines.push(
        [
          csvCell(d.donorName),
          csvCell(d.category),
          csvCell(d.location),
          d.total,
          d.giftCount,
          csvCell(dates[0]),
          csvCell(dates[dates.length - 1]),
        ].join(","),
      );
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  if (lines.length === 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const header =
    `# BadgerBrief donor roster — ${candidate} (${race}) — Itemized contributions` +
    `${coverage ? `, ${coverage}` : ""} — Data: WI Ethics Commission (Sunshine), ` +
    `non-commercial use per Wis. Stat. § 11.1304(12)\n` +
    "donor,category,location,total,gift_count,first_gift,last_gift";
  return new NextResponse([header, ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${candidate}-donors.csv"`,
    },
  });
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. With `pnpm dev` running against dev data:
`curl -s "localhost:PORT/api/donors?race=WI-GOV-2026&candidate=david-crowley" | head -4` → statute header line + column header + rows sorted by total; `curl -s -o /dev/null -w "%{http_code}" "localhost:PORT/api/donors?race=;drop&candidate=x"` → 400; unknown-but-valid-shaped candidate → 404. Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/donors
git commit -m "feat: donor roster CSV export"
```

---

### Task 8: Chat donor tools + eval gate

**Files:**
- Modify: `convex/lib/agentTelemetry.ts` (add shared `withToolSpan`)
- Create: `convex/financeChatTools.ts`
- Modify: `convex/voterHelp.ts` (ONLY: one import line, two tool-list entries, two instruction rules)
- Modify: `scripts/golden-questions.json` (+3 questions)

**Interfaces:**
- Consumes: `api.donors.searchRoster`, `api.donors.roster`, `api.donors.searchDonors`, `api.donors.profile`; `donorKeyFor` logic (re-implemented as a one-liner, it's 1 expression); `tracer`/`ensureTelemetry` from `./lib/agentTelemetry`.
- Produces: `getCandidateDonors`, `getDonorProfile` createTools exported from `convex/financeChatTools.ts`; `withToolSpan(toolName, threadId, input, fn)` exported from `convex/lib/agentTelemetry.ts`.

- [ ] **Step 1: Move-share the span helper** — in `convex/lib/agentTelemetry.ts`, add (exact copy of voterHelp.ts's local `withToolSpan`, exported; leave voterHelp's local copy untouched — its removal is a post-merge cleanup once the user's in-flight voterHelp edit lands):

```ts
/** Manual TOOL span wrapper (no-op passthrough when telemetry is off). */
export async function withToolSpan(
  toolName: string,
  threadId: string | undefined,
  input: unknown,
  fn: () => Promise<string>,
): Promise<string> {
  return await tracer().startActiveSpan(toolName, async (span) => {
    span.setAttribute("openinference.span.kind", "TOOL");
    span.setAttribute("tool.name", toolName);
    if (threadId) span.setAttribute("session.id", threadId);
    span.setAttribute("input.value", JSON.stringify(input).slice(0, 4000));
    try {
      const out = await fn();
      span.setAttribute("output.value", out.slice(0, 4000));
      return out;
    } finally {
      span.end();
    }
  });
}
```

- [ ] **Step 2: Create `convex/financeChatTools.ts`**

```ts
"use node";
/**
 * Read-only donor tools for the Voter Help agent (spec: 2026-08-07-donor-
 * explorer). Governance: read-only, same as every voterHelp tool. Donor
 * identity is exact-reported-name; multiple spellings return as separate
 * entries, never merged.
 */
import { z } from "zod";
import { createTool } from "@convex-dev/agent";
import { api } from "./_generated/api";
import { withToolSpan } from "./lib/agentTelemetry";

const SITE = "https://badgerbrief.org";

const donorKeyFor = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const getCandidateDonors = createTool({
  description:
    'Look up who funds a candidate: the full donor roster for a state candidate by slug (e.g. "david-crowley"). Optionally filter by a donor-name search term or a category (individuals | party | union | pac | business | other). Returns top donors with exact totals, the coverage window, and the candidate page URL. Read-only. ALWAYS state the coverage window when quoting these numbers.',
  inputSchema: z.object({
    candidateSlug: z.string().describe('Candidate slug, e.g. "francesca-hong"'),
    searchTerm: z.string().optional().describe("Donor name to search within this candidate"),
    category: z
      .enum(["individuals", "party", "union", "pac", "business", "other"])
      .optional(),
  }),
  execute: async (ctx, { candidateSlug, searchTerm, category }): Promise<string> =>
    withToolSpan("getCandidateDonors", ctx.threadId, { candidateSlug, searchTerm, category }, async () => {
      const candidate = await ctx.runQuery(api.public.getCandidate, { slug: candidateSlug });
      if (!candidate) return JSON.stringify({ error: "unknown candidate slug" });
      const raceId = candidate.candidate.raceId;
      const rows = searchTerm
        ? await ctx.runQuery(api.donors.searchRoster, { raceId, candidateSlug, term: searchTerm })
        : (
            await ctx.runQuery(api.donors.roster, {
              raceId,
              candidateSlug,
              paginationOpts: { cursor: null, numItems: 50 },
            })
          ).page;
      const filtered = rows.filter((d) => !category || d.category === category).slice(0, 15);
      return JSON.stringify({
        candidate: candidateSlug,
        candidateUrl: `${SITE}/candidates/${candidateSlug}`,
        coverage: filtered[0]?.coverageEndDate ?? rows[0]?.coverageEndDate ?? null,
        donors: filtered.map((d) => ({
          name: d.donorName,
          category: d.category,
          location: d.location ?? null,
          total: d.total,
          gifts: d.giftCount,
          donorUrl: `${SITE}/donors/${encodeURIComponent(d.donorKey)}`,
        })),
        note: "Itemized state contributions only; names exactly as reported — the same person may appear under multiple spellings.",
      });
    }),
});

export const getDonorProfile = createTool({
  description:
    'Look up a donor by name and see every tracked 2026 campaign they gave to, with totals and the donor page URL. Matches the exact reported name (multiple spellings return as separate donors — present them separately, never merge). Read-only. ALWAYS state the coverage window when quoting these numbers.',
  inputSchema: z.object({
    donorName: z.string().describe('Donor name as reported, e.g. "WEAC PAC" or "Diane Hendricks"'),
  }),
  execute: async (ctx, { donorName }): Promise<string> =>
    withToolSpan("getDonorProfile", ctx.threadId, { donorName }, async () => {
      const exact = await ctx.runQuery(api.donors.profile, { donorKey: donorKeyFor(donorName) });
      const near = exact ? [] : await ctx.runQuery(api.donors.searchDonors, { term: donorName });
      if (!exact && near.length === 0) {
        return JSON.stringify({ found: false, note: "No reported contributions under this name in BadgerBrief's tracked races." });
      }
      const profiles = exact
        ? [exact]
        : await Promise.all(
            [...new Set(near.map((d) => d.donorKey))].slice(0, 3).map((key) =>
              ctx.runQuery(api.donors.profile, { donorKey: key }),
            ),
          );
      return JSON.stringify({
        found: true,
        matches: profiles.filter(Boolean).map((p) => ({
          name: p!.donors[0].donorName,
          donorUrl: `${SITE}/donors/${encodeURIComponent(p!.donors[0].donorKey)}`,
          coverage: p!.donors[0].coverageEndDate ?? null,
          grandTotal: p!.grandTotal,
          byCandidate: p!.donors.map((d) => ({
            candidate: d.candidateSlug,
            candidateUrl: `${SITE}/candidates/${d.candidateSlug}`,
            total: d.total,
            gifts: d.giftCount,
          })),
        })),
        note: "Separate spellings are separate entries — do not merge them.",
      });
    }),
});
```

(If `api.public.getCandidate`'s exact name/shape differs, check `convex/public.ts` — voterHelp's existing `getCandidateInfo` tool calls the real one; mirror that call and read `raceId` off its result.)

- [ ] **Step 3: Wire into `convex/voterHelp.ts`** — exactly three edits:
  1. Import: `import { getCandidateDonors, getDonorProfile } from "./financeChatTools";`
  2. Tools list (~line 525): add `getCandidateDonors, getDonorProfile` to the `tools: { … }` object.
  3. Instructions block (the numbered rules ~lines 506–517), append two rules following the existing numbering/style:
     - `13. DONOR QUESTIONS. For "who funds X" / "did Y donate" questions call getCandidateDonors or getDonorProfile and answer ONLY from their results, linking the donorUrl/candidateUrl they return. Always state the coverage window the tool returns. Never merge donors with different reported spellings — present them separately, as the tool does.`
     - `14. DONOR NUMBERS ARE ITEMIZED-ONLY. Donor totals cover itemized state contributions in the covered window; if a voter asks about money the tools don't show, say BadgerBrief doesn't have it rather than estimating.`

- [ ] **Step 4: Add 3 golden questions** to `scripts/golden-questions.json` (same schema as existing entries):

```json
{
  "question": "Who are David Crowley's biggest campaign donors?",
  "race_id": "WI-GOV-2026",
  "expected_topic": "finance",
  "must_mention": "union",
  "must_use_tool": true,
  "must_not": "invent donor names or amounts not in the tool results",
  "difficulty": "medium"
},
{
  "question": "Has WEAC PAC donated to any candidates in the governor's race?",
  "race_id": "WI-GOV-2026",
  "expected_topic": "finance",
  "must_mention": "Roys",
  "must_use_tool": true,
  "must_not": "claim donations to candidates the tool did not return",
  "difficulty": "medium"
},
{
  "question": "Where does Francesca Hong's campaign money come from?",
  "race_id": "WI-GOV-2026",
  "expected_topic": "finance",
  "must_mention": "under $200",
  "must_use_tool": true,
  "must_not": "speculate beyond the coverage window the tools state",
  "difficulty": "medium"
}
```

- [ ] **Step 5: Verify + eval gate** — `npx convex codegen && npx tsc --noEmit && npx vitest run` all clean, then push to dev (`npx convex dev --once`) and run the gate against dev:
`node scripts/eval-gate.mjs --name donor-tools --dev --baseline sonnet-5-tuned`
Expected: no regression vs baseline (per docs/eval-gate.md: majority-verdict scoring; regression = don't ship) and the 3 new questions pass. If the gate regresses, tune ONLY the two new instruction rules and re-run; report BLOCKED if two tuning rounds don't clear it.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/agentTelemetry.ts convex/financeChatTools.ts convex/voterHelp.ts scripts/golden-questions.json convex/_generated
git commit -m "feat: voter-chat donor tools + golden questions"
```

---

### Task 9: Prod deploy, prod import, live verification

**Files:** none — operational.

- [ ] **Step 1:** `npx convex deploy -y` (prod schema + functions), then confirm `npx convex run finance:financeGaps --prod` still returns `count: 0`.
- [ ] **Step 2:** Prod donor import (CSV from `/tmp/sunshine-2026-aug3-v2.csv`, regenerate via fetch-sunshine.mjs if missing):
`node scripts/import-sunshine-donors.mjs /tmp/sunshine-2026-aug3-v2.csv --prod --coverage "filings through Aug 3, 2026"`
Expected: 13 ✓ lines; eyeball per-candidate donor counts and top donors (Crowley top ≈ $86k union PACs; Hong ≈ 13k donors).
- [ ] **Step 3:** Deploy the site: from the repo, `git worktree add --detach ../badgerbrief-deploy HEAD && cp -r .vercel ../badgerbrief-deploy/.vercel && cd ../badgerbrief-deploy && vercel --prod --yes`, then `git worktree remove --force ../badgerbrief-deploy` (established flow — git push does NOT deploy).
- [ ] **Step 4:** Live checks:
  - `curl -s https://badgerbrief.org/candidates/david-crowley | grep -c "See all"` ≥ 1
  - `curl -s "https://badgerbrief.org/api/donors?race=WI-GOV-2026&candidate=francesca-hong" | head -2` → statute header + column header
  - a real donor page returns content and `grep -c noindex` ≥ 1
  - `curl -s https://badgerbrief.org/candidates/gwen-moore | grep -c "See all"` → 0
  - `curl -s https://badgerbrief.org/sitemap.xml | grep -c donors` → 0
- [ ] **Step 5:** Ask one donor question in the live chat UI (e.g. "who funds David Crowley?") and confirm the answer cites tool-sourced donors with links and the coverage window.

---

## Self-review notes

- Spec coverage: table/mutations (T1), lib + shared helpers (T2), CLI + dev import (T3), queries (T4), roster UI (T5), donor pages + noindex + not-found (T6), CSV export + statute header (T7), chat tools + minimal voterHelp touch + golden questions + eval gate (T8), prod ops + live checks (T9). Deviation from spec, deliberate: no `rosterCount` query — the button count derives from the breakdown doc already on the page (sum of category donor-counts; can differ by a hair from roster rows when case-variants merge under one donorKey — acceptable for a button label). The spec's "global donor search box on the not-found page" is deferred with the `/money` hub; the not-found page links to candidate rosters instead (noted in T6).
- Placeholder scan: T6 Step 1 contains an explicit instruction to delete the placeholder form block before commit; no TBDs remain.
- Type consistency: `donorKey/donorName/giftCount/gifts/giftsTruncated`, `clearDonors({...cursor})→{deleted,continueCursor,isDone}`, `roster/searchRoster/profile/searchDonors`, `DonorRosterSection` used consistently across tasks.
