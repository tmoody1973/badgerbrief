# Ad Money, By Race — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present the tracked political-ad data **by race** so a citizen sees who is being boosted vs. buried, who is paying (own committee vs. outside money), and how far the money reaches — on each race page and on a restructured `/ads` overview.

**Architecture:** Pure aggregation (`convex/lib/adMoney.ts`) rolls attributed `ads` rows into per-candidate and per-race money summaries using range **midpoints**. Two Convex queries expose it (`adMoneyForRace`, `adMoneyOverview`). Server components render a layout-B candidate-money panel on the race page and a by-race overview on `/ads`; a client `YourRaces` band personalizes via existing ballot districts. Existing `/ads` analytics/list stays below the fold.

**Tech Stack:** Next.js (App Router, RSC, ISR `revalidate = 300`), Convex, TypeScript, Vitest + convex-test, Tailwind (neo-brutalist semantic tokens + dark mode).

## Global Constraints

- **No schema changes.** Everything derives from existing `ads` rows joined to `candidates`/`races`.
- **Honesty framing (non-negotiable):** show scale, direction (support/attack), who's paying, reach — **never** vote-effect. Spend/impressions are ranges → aggregates use **midpoints**, labeled "estimated." "Outside money" is a **heuristic** → labeled "estimated." Copy says *influence/pressure*, not *effect on results*.
- **Own-vs-outside is a heuristic:** sponsor text contains the candidate's surname → own committee. Reuse the exact logic from `defaultStance` in `src/components/admin/ad-review.tsx:34` (surname = last whitespace-token of name, lowercased; haystack = `pageOrCommittee + " " + (fundingEntity ?? "")`, lowercased; `hay.includes(surname)`).
- **Styling:** neo-brutalist semantic tokens only — `border-2 border-border`, `bg-card`, `bg-warning` (pairs with `text-foreground`), `bg-success`/`bg-destructive`, `text-muted-foreground`, `shadow-[var(--shadow-brutal)]`, `font-display`, `font-mono text-xs font-bold uppercase tracking-widest`. **Never** hardcode hex; **never** use `dark:` classes (the CSS-var override handles dark mode).
- **Only attributed ads are public:** rows without `candidateSlug` never surface. `stance` is optional; a stance-less attributed ad is excluded from support/attack/own/outside sums but counted in `adCount`.
- **Deploy order:** `npx convex codegen` after adding any Convex function → `npx convex deploy -y` → `npx vercel deploy --prod --yes`. Verify visually on prod (Governor race: ~$1M, mostly Tiffany own-committee, ~$70k outside attacking Tiffany).
- **Suite stays green:** `npx vitest run`, `npx tsc --noEmit`, `npx next build` all clean (baseline: 181 tests green).
- **Deferred (do NOT build):** geo-targeting ("aimed at your district"), spend-over-time timeline, standalone outside-vs-candidate leaderboard.

---

### Task 1: Pure aggregation library (`convex/lib/adMoney.ts`)

Pure functions + types, fully unit-tested in the node env. No Convex imports — takes plain arrays. This is the load-bearing piece; everything else consumes its types.

**Files:**
- Create: `convex/lib/adMoney.ts`
- Test: `convex/lib/adMoney.test.ts`

**Interfaces:**
- Consumes: nothing (plain data in).
- Produces (later tasks rely on these exact names/types):

```ts
export type AdRow = {
  candidateSlug?: string;
  stance?: "support" | "oppose";
  pageOrCommittee: string;
  fundingEntity?: string;
  spendLower?: number;
  spendUpper?: number;
  impressionsLower?: number;
  impressionsUpper?: number;
};
export type CandidateLite = { slug: string; name: string };

export type CandidateAdMoney = {
  slug: string;
  name: string;
  supportSpend: number;
  attackSpend: number;
  impressions: number;
  ownSpend: number;
  outsideSpend: number;
  adCount: number;
  unclassifiedCount: number; // attributed to this candidate but no stance
};
export type RaceAdMoney = {
  candidates: CandidateAdMoney[]; // only candidates with ≥1 attributed ad, desc by (support+attack) spend
  totalSpend: number;   // midpoint sum of all stanced ads in the race
  outsideSpend: number; // midpoint sum classified as outside money
  supportShare: number; // 0..1 of totalSpend that is support (0 when totalSpend 0)
  attackShare: number;  // 0..1 of totalSpend that is attack
  mostAttacked: string | null; // candidate slug with the largest attackSpend, null if none
  adCount: number;      // attributed ads in the race (incl. stance-less)
};

export function mid(lower?: number, upper?: number): number;
export function isOwnCommittee(sponsor: string, candidateName: string): boolean;
export function rollupCandidate(ads: AdRow[], candidate: CandidateLite): CandidateAdMoney;
export function rollupRace(ads: AdRow[], candidates: CandidateLite[]): RaceAdMoney;
```

**Classification rules (from the spec):**
- `mid`: both bounds present → `(lower+upper)/2`; one present → that value; neither → `0`.
- `isOwnCommittee(sponsor, name)`: surname = last whitespace-token of `name`, lowercased; return `surname !== "" && sponsor.toLowerCase().includes(surname)`.
- Per ad in `rollupCandidate` (only that candidate's ads):
  - `stance === "support"` & `isOwnCommittee(pageOrCommittee + " " + (fundingEntity ?? ""), name)` → `supportSpend += mid`, `ownSpend += mid`.
  - `stance === "support"` & NOT own → `supportSpend += mid`, `outsideSpend += mid` (outside support PAC).
  - `stance === "oppose"` → `attackSpend += mid`, `outsideSpend += mid` (you don't attack yourself → always outside).
  - `stance` missing → `unclassifiedCount += 1`, no spend sums.
  - Always: `impressions += mid(impressionsLower, impressionsUpper)`, `adCount += 1`.
- `rollupRace`: `rollupCandidate` per candidate, keep only those with `adCount > 0`, sort desc by `supportSpend+attackSpend`. `totalSpend = Σ(supportSpend+attackSpend)`; `outsideSpend = Σ outsideSpend`; `supportShare = totalSpend? Σsupport/totalSpend : 0`; `attackShare` likewise; `mostAttacked` = slug of max `attackSpend` (null if all 0); `adCount = Σ adCount`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/adMoney.test.ts
import { describe, expect, test } from "vitest";
import {
  mid,
  isOwnCommittee,
  rollupCandidate,
  rollupRace,
  type AdRow,
} from "./adMoney";

const ad = (o: Partial<AdRow>): AdRow => ({
  pageOrCommittee: "",
  ...o,
});

describe("mid", () => {
  test("averages both bounds", () => expect(mid(100, 200)).toBe(150));
  test("uses the single present bound", () => {
    expect(mid(100, undefined)).toBe(100);
    expect(mid(undefined, 200)).toBe(200);
  });
  test("no bounds → 0", () => expect(mid()).toBe(0));
});

describe("isOwnCommittee", () => {
  test("surname in sponsor → own", () =>
    expect(isOwnCommittee("Tiffany for Governor", "Tom Tiffany")).toBe(true));
  test("unrelated PAC → outside", () =>
    expect(isOwnCommittee("A Better Wisconsin Together", "Tom Tiffany")).toBe(false));
  test("empty name → outside", () =>
    expect(isOwnCommittee("Anything", "")).toBe(false));
});

describe("rollupCandidate", () => {
  const cand = { slug: "tom-tiffany", name: "Tom Tiffany" };
  test("own-committee support → own + support", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Tiffany for Governor", spendLower: 100, spendUpper: 300, impressionsLower: 1000, impressionsUpper: 3000 })],
      cand,
    );
    expect(r.supportSpend).toBe(200);
    expect(r.ownSpend).toBe(200);
    expect(r.outsideSpend).toBe(0);
    expect(r.impressions).toBe(2000);
    expect(r.adCount).toBe(1);
  });
  test("outside support PAC → support but outside", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Freedom PAC", spendLower: 50, spendUpper: 150 })],
      cand,
    );
    expect(r.supportSpend).toBe(100);
    expect(r.ownSpend).toBe(0);
    expect(r.outsideSpend).toBe(100);
  });
  test("attack → attack + outside", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", stance: "oppose", pageOrCommittee: "A Better Wisconsin Together", spendLower: 20, spendUpper: 40 })],
      cand,
    );
    expect(r.attackSpend).toBe(30);
    expect(r.outsideSpend).toBe(30);
    expect(r.supportSpend).toBe(0);
  });
  test("no stance → excluded from sums, counted in adCount + unclassified", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", pageOrCommittee: "Mystery", spendLower: 500, spendUpper: 500 })],
      cand,
    );
    expect(r.supportSpend).toBe(0);
    expect(r.attackSpend).toBe(0);
    expect(r.adCount).toBe(1);
    expect(r.unclassifiedCount).toBe(1);
  });
});

describe("rollupRace", () => {
  const candidates = [
    { slug: "tom-tiffany", name: "Tom Tiffany" },
    { slug: "jane-doe", name: "Jane Doe" },
  ];
  const ads: AdRow[] = [
    ad({ candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Tiffany for Governor", spendLower: 800000, spendUpper: 834000 }),
    ad({ candidateSlug: "tom-tiffany", stance: "oppose", pageOrCommittee: "A Better Wisconsin Together", spendLower: 60000, spendUpper: 80000 }),
    ad({ candidateSlug: "jane-doe", stance: "support", pageOrCommittee: "Doe for WI", spendLower: 10000, spendUpper: 10000 }),
  ];
  test("totals, shares, most-attacked", () => {
    const r = rollupRace(ads, candidates);
    // support: 817000 (Tiffany own) + 10000 (Doe) = 827000; attack: 70000
    expect(r.totalSpend).toBe(897000);
    expect(r.outsideSpend).toBe(70000); // only the attack is outside here
    expect(r.mostAttacked).toBe("tom-tiffany");
    expect(Math.round(r.supportShare * 1000)).toBe(922); // 827000/897000
    expect(r.candidates[0].slug).toBe("tom-tiffany"); // sorted desc by spend
  });
  test("no attributed ads → empty candidates, zero totals, null mostAttacked", () => {
    const r = rollupRace([], candidates);
    expect(r.candidates).toEqual([]);
    expect(r.totalSpend).toBe(0);
    expect(r.mostAttacked).toBeNull();
    expect(r.supportShare).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/adMoney.test.ts`
Expected: FAIL — `Cannot find module './adMoney'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/adMoney.ts
// Pure, Convex-free aggregation of attributed political ads into per-candidate
// and per-race "money" summaries. Spend/impressions are platform-disclosed
// ranges → we use midpoints (labeled "estimated" in the UI). Own-vs-outside is
// a name heuristic mirroring defaultStance in src/components/admin/ad-review.tsx.

export type AdRow = {
  candidateSlug?: string;
  stance?: "support" | "oppose";
  pageOrCommittee: string;
  fundingEntity?: string;
  spendLower?: number;
  spendUpper?: number;
  impressionsLower?: number;
  impressionsUpper?: number;
};
export type CandidateLite = { slug: string; name: string };

export type CandidateAdMoney = {
  slug: string;
  name: string;
  supportSpend: number;
  attackSpend: number;
  impressions: number;
  ownSpend: number;
  outsideSpend: number;
  adCount: number;
  unclassifiedCount: number;
};
export type RaceAdMoney = {
  candidates: CandidateAdMoney[];
  totalSpend: number;
  outsideSpend: number;
  supportShare: number;
  attackShare: number;
  mostAttacked: string | null;
  adCount: number;
};

/** Range midpoint; one bound → that value; none → 0. */
export function mid(lower?: number, upper?: number): number {
  if (lower !== undefined && upper !== undefined) return (lower + upper) / 2;
  if (lower !== undefined) return lower;
  if (upper !== undefined) return upper;
  return 0;
}

/** Sponsor text contains the candidate's surname → treat as the candidate's own committee. */
export function isOwnCommittee(sponsor: string, candidateName: string): boolean {
  const surname = candidateName.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return surname !== "" && sponsor.toLowerCase().includes(surname);
}

export function rollupCandidate(ads: AdRow[], candidate: CandidateLite): CandidateAdMoney {
  const acc: CandidateAdMoney = {
    slug: candidate.slug,
    name: candidate.name,
    supportSpend: 0,
    attackSpend: 0,
    impressions: 0,
    ownSpend: 0,
    outsideSpend: 0,
    adCount: 0,
    unclassifiedCount: 0,
  };
  for (const ad of ads) {
    acc.adCount += 1;
    acc.impressions += mid(ad.impressionsLower, ad.impressionsUpper);
    const spend = mid(ad.spendLower, ad.spendUpper);
    if (ad.stance === "support") {
      acc.supportSpend += spend;
      const sponsor = `${ad.pageOrCommittee} ${ad.fundingEntity ?? ""}`;
      if (isOwnCommittee(sponsor, candidate.name)) acc.ownSpend += spend;
      else acc.outsideSpend += spend;
    } else if (ad.stance === "oppose") {
      acc.attackSpend += spend;
      acc.outsideSpend += spend;
    } else {
      acc.unclassifiedCount += 1;
    }
  }
  return acc;
}

export function rollupRace(ads: AdRow[], candidates: CandidateLite[]): RaceAdMoney {
  const byCandidate = new Map<string, AdRow[]>();
  for (const ad of ads) {
    if (!ad.candidateSlug) continue;
    const list = byCandidate.get(ad.candidateSlug) ?? [];
    list.push(ad);
    byCandidate.set(ad.candidateSlug, list);
  }
  const rolled = candidates
    .map((c) => rollupCandidate(byCandidate.get(c.slug) ?? [], c))
    .filter((c) => c.adCount > 0)
    .sort((a, b) => b.supportSpend + b.attackSpend - (a.supportSpend + a.attackSpend));

  const totalSupport = rolled.reduce((s, c) => s + c.supportSpend, 0);
  const totalAttack = rolled.reduce((s, c) => s + c.attackSpend, 0);
  const totalSpend = totalSupport + totalAttack;
  const outsideSpend = rolled.reduce((s, c) => s + c.outsideSpend, 0);
  const adCount = rolled.reduce((s, c) => s + c.adCount, 0);

  let mostAttacked: string | null = null;
  let maxAttack = 0;
  for (const c of rolled) {
    if (c.attackSpend > maxAttack) {
      maxAttack = c.attackSpend;
      mostAttacked = c.slug;
    }
  }

  return {
    candidates: rolled,
    totalSpend,
    outsideSpend,
    supportShare: totalSpend ? totalSupport / totalSpend : 0,
    attackShare: totalSpend ? totalAttack / totalSpend : 0,
    mostAttacked,
    adCount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/adMoney.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/adMoney.ts convex/lib/adMoney.test.ts
git commit -m "feat: pure ad-money aggregation lib (MOO-309)"
```

---

### Task 2: Convex queries (`convex/adMoney.ts`)

Expose the aggregation to pages: one query per race, one statewide overview. Bounded reads (single `ads` scan for the overview; indexed read for a single race).

**Files:**
- Create: `convex/adMoney.ts`
- Test: `convex/adMoney.test.ts`
- Reference: `convex/public.ts:23` (`getRace` — candidate `by_race` index), `convex/ads.ts:676` (`adsForCandidate` — `by_candidate` index), `convex/schema.ts:238` (ads index `by_candidate = [raceId, candidateSlug]`).

**Interfaces:**
- Consumes: `rollupRace`, `RaceAdMoney`, `AdRow`, `CandidateLite` from `convex/lib/adMoney.ts` (Task 1).
- Produces (later tasks rely on these):
  - `api.adMoney.adMoneyForRace({ raceId: string }) → RaceAdMoney` (empty rollup shape when no ads).
  - `api.adMoney.adMoneyOverview() → { races: RaceOverview[]; statewide: { totalSpend; outsideSpend; mostAttacked: { slug; name; office; attackSpend } | null } }` where
    ```ts
    type RaceOverview = {
      raceId: string;
      office: string;
      level: string;
      totalSpend: number;
      outsideSpend: number;
      supportShare: number;
      attackShare: number;
      adCount: number;
      mostAttacked: string | null;
    };
    ```
    `races` includes only races with `adCount > 0`, sorted desc by `totalSpend`.

**Notes for the implementer:**
- Map an `ads` Doc to `AdRow` by passing the fields through (Doc is structurally compatible; construct an explicit object to be safe).
- `adMoneyForRace`: read the race (`races` `by_race_id`), its candidates (`candidates` `by_race`), and the race's attributed ads via `ads` `by_candidate` with `q.eq("raceId", raceId)` (prefix match on the compound index returns all candidateSlugs). Cap `.take(2000)`.
- `adMoneyOverview`: `ctx.db.query("ads").take(2000)`, keep rows with `candidateSlug`, group by `raceId`. Load all `races` and `candidates` once; group candidates by `raceId`. `rollupRace` per race that has ads. Statewide `totalSpend`/`outsideSpend` = sums across race rollups; `mostAttacked` = the candidate (across all races) with the single largest `attackSpend` (look it up from the winning race's candidate rollup + its race office/candidate name).

- [ ] **Step 1: Write the failing test**

```ts
// convex/adMoney.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof setup>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", { raceId: "WI-GOV-2026", office: "Governor", level: "State Executive" } as any);
    await ctx.db.insert("candidates", { raceId: "WI-GOV-2026", slug: "tom-tiffany", name: "Tom Tiffany" } as any);
    await ctx.db.insert("candidates", { raceId: "WI-GOV-2026", slug: "jane-doe", name: "Jane Doe" } as any);
    const base = { platform: "meta" as const, firstSeenAt: 0, lastSeenAt: 0 };
    await ctx.db.insert("ads", { ...base, platformAdId: "a1", raceId: "WI-GOV-2026", candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Tiffany for Governor", spendLower: 800000, spendUpper: 834000 });
    await ctx.db.insert("ads", { ...base, platformAdId: "a2", raceId: "WI-GOV-2026", candidateSlug: "tom-tiffany", stance: "oppose", pageOrCommittee: "A Better Wisconsin Together", spendLower: 60000, spendUpper: 80000 });
    // Unattributed row must be ignored (no candidateSlug):
    await ctx.db.insert("ads", { ...base, platformAdId: "a3", pageOrCommittee: "Random PAC", spendLower: 999999, spendUpper: 999999 });
  });
}

describe("adMoneyForRace", () => {
  test("aggregates the race's attributed ads", async () => {
    const t = setup();
    await seed(t);
    const r = await t.query(api.adMoney.adMoneyForRace, { raceId: "WI-GOV-2026" });
    expect(r.totalSpend).toBe(887000); // 817000 support + 70000 attack
    expect(r.outsideSpend).toBe(70000);
    expect(r.mostAttacked).toBe("tom-tiffany");
    expect(r.candidates.map((c) => c.slug)).toEqual(["tom-tiffany"]);
  });
  test("race with no ads → empty rollup", async () => {
    const t = setup();
    await seed(t);
    const r = await t.query(api.adMoney.adMoneyForRace, { raceId: "WI-DOES-NOT-EXIST" });
    expect(r.candidates).toEqual([]);
    expect(r.totalSpend).toBe(0);
  });
});

describe("adMoneyOverview", () => {
  test("ranks races and computes statewide outside money + most-attacked", async () => {
    const t = setup();
    await seed(t);
    const o = await t.query(api.adMoney.adMoneyOverview, {});
    expect(o.races).toHaveLength(1);
    expect(o.races[0].raceId).toBe("WI-GOV-2026");
    expect(o.statewide.totalSpend).toBe(887000);
    expect(o.statewide.outsideSpend).toBe(70000);
    expect(o.statewide.mostAttacked?.slug).toBe("tom-tiffany");
    expect(o.statewide.mostAttacked?.office).toBe("Governor");
  });
}
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/adMoney.test.ts`
Expected: FAIL — `api.adMoney` is undefined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/adMoney.ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { rollupRace, type AdRow, type CandidateLite, type RaceAdMoney } from "./lib/adMoney";

const toAdRow = (a: Doc<"ads">): AdRow => ({
  candidateSlug: a.candidateSlug,
  stance: a.stance,
  pageOrCommittee: a.pageOrCommittee,
  fundingEntity: a.fundingEntity,
  spendLower: a.spendLower,
  spendUpper: a.spendUpper,
  impressionsLower: a.impressionsLower,
  impressionsUpper: a.impressionsUpper,
});
const toLite = (c: Doc<"candidates">): CandidateLite => ({ slug: c.slug, name: c.name });

/** Per-race ad-money rollup for the race page. Empty shape when nothing is tracked. */
export const adMoneyForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }): Promise<RaceAdMoney> => {
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    const ads = await ctx.db
      .query("ads")
      .withIndex("by_candidate", (q) => q.eq("raceId", raceId))
      .take(2000);
    return rollupRace(ads.map(toAdRow), candidates.map(toLite));
  },
});

export type RaceOverview = {
  raceId: string;
  office: string;
  level: string;
  totalSpend: number;
  outsideSpend: number;
  supportShare: number;
  attackShare: number;
  adCount: number;
  mostAttacked: string | null;
};

/** Statewide by-race overview for /ads: race summaries + statewide headline stats. */
export const adMoneyOverview = query({
  args: {},
  handler: async (ctx) => {
    const [ads, races, candidates] = await Promise.all([
      ctx.db.query("ads").take(2000),
      ctx.db.query("races").collect(),
      ctx.db.query("candidates").collect(),
    ]);
    const candidatesByRace = new Map<string, Doc<"candidates">[]>();
    for (const c of candidates) {
      const list = candidatesByRace.get(c.raceId) ?? [];
      list.push(c);
      candidatesByRace.set(c.raceId, list);
    }
    const adsByRace = new Map<string, AdRow[]>();
    for (const a of ads) {
      if (!a.candidateSlug || !a.raceId) continue;
      const list = adsByRace.get(a.raceId) ?? [];
      list.push(toAdRow(a));
      adsByRace.set(a.raceId, list);
    }

    const raceOverviews: RaceOverview[] = [];
    let statewideOutside = 0;
    let statewideTotal = 0;
    let mostAttacked: { slug: string; name: string; office: string; attackSpend: number } | null = null;

    for (const race of races) {
      const raceAds = adsByRace.get(race.raceId);
      if (!raceAds || raceAds.length === 0) continue;
      const roll = rollupRace(raceAds, (candidatesByRace.get(race.raceId) ?? []).map(toLite));
      if (roll.adCount === 0) continue;
      statewideTotal += roll.totalSpend;
      statewideOutside += roll.outsideSpend;
      raceOverviews.push({
        raceId: race.raceId,
        office: race.office,
        level: race.level,
        totalSpend: roll.totalSpend,
        outsideSpend: roll.outsideSpend,
        supportShare: roll.supportShare,
        attackShare: roll.attackShare,
        adCount: roll.adCount,
        mostAttacked: roll.mostAttacked,
      });
      for (const c of roll.candidates) {
        if (c.attackSpend > (mostAttacked?.attackSpend ?? 0)) {
          mostAttacked = { slug: c.slug, name: c.name, office: race.office, attackSpend: c.attackSpend };
        }
      }
    }

    raceOverviews.sort((a, b) => b.totalSpend - a.totalSpend);
    return {
      races: raceOverviews,
      statewide: { totalSpend: statewideTotal, outsideSpend: statewideOutside, mostAttacked },
    };
  },
});
```

- [ ] **Step 4: Regenerate Convex types, then run tests**

Run: `npx convex codegen && npx vitest run convex/adMoney.test.ts`
Expected: codegen succeeds; tests PASS. (If `api.adMoney` still errors, codegen didn't pick up the file — re-run it.)

- [ ] **Step 5: Commit**

```bash
git add convex/adMoney.ts convex/adMoney.test.ts convex/_generated
git commit -m "feat: adMoneyForRace + adMoneyOverview queries (MOO-309)"
```

---

### Task 3: Race-page money panel (`RaceAdMoney` + wire-in)

The layout-B panel: one card per candidate (For $, Against $, reach, own-vs-outside split bar) + a race-level "who's paying" takeaway. No component unit test in this repo — verified by tsc/build here and visually in Task 6 (spec: "No new e2e; verify visually").

**Files:**
- Create: `src/components/guide/race-ad-money.tsx`
- Modify: `src/lib/data.ts` (add fetcher), `src/app/races/[slug]/page.tsx` (render section + SectionNav entry)
- Reference patterns: `src/components/guide/ads-analytics.tsx` (usd/compact/StatTile/BarList helpers, `mid`), `src/app/races/[slug]/page.tsx:90-107` (SectionNav), `src/app/races/[slug]/page.tsx:184` (`RaceFinanceTable` placement — put the ad-money section right after it).

**Interfaces:**
- Consumes: `api.adMoney.adMoneyForRace` (Task 2), `RaceAdMoney`/`CandidateAdMoney` types from `convex/lib/adMoney.ts`.
- Produces: `<RaceAdMoney data={RaceAdMoney} />` React server component; `getAdMoneyForRace(raceId)` fetcher.

- [ ] **Step 1: Add the server fetcher**

In `src/lib/data.ts`, after the `listAds` line (`src/lib/data.ts:15`):

```ts
export const getAdMoneyForRace = (raceId: string) =>
  fetchQuery(api.adMoney.adMoneyForRace, { raceId });
export const getAdMoneyOverview = () => fetchQuery(api.adMoney.adMoneyOverview, {});
```

- [ ] **Step 2: Create the component**

```tsx
// src/components/guide/race-ad-money.tsx
import type { CandidateAdMoney, RaceAdMoney } from "../../../convex/lib/adMoney";

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

function SplitBar({ own, outside }: { own: number; outside: number }) {
  const total = own + outside;
  const ownPct = total ? Math.round((own / total) * 100) : 0;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border-2 border-border">
        <div className="bg-secondary" style={{ width: `${ownPct}%` }} />
        <div className="bg-warning" style={{ width: `${100 - ownPct}%` }} />
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {usd(own)} own committee · {usd(outside)} outside <span className="italic">(estimated)</span>
      </p>
    </div>
  );
}

function CandidateMoneyCard({ c }: { c: CandidateAdMoney }) {
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h3 className="font-display text-lg">{c.name}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-mono text-lg font-bold text-foreground">{usd(c.supportSpend)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Supporting</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-foreground">{usd(c.attackSpend)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Attacking</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-foreground">{compact(c.impressions)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Reach</p>
        </div>
      </div>
      <div className="mt-3">
        <SplitBar own={c.ownSpend} outside={c.outsideSpend} />
      </div>
      {c.unclassifiedCount > 0 && (
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {c.unclassifiedCount} ad(s) not yet classified support/attack.
        </p>
      )}
    </div>
  );
}

/** Layout-B per-race ad-money panel: candidate money cards + a "who's paying" takeaway. */
export function RaceAdMoney({ data }: { data: RaceAdMoney }) {
  if (data.candidates.length === 0) {
    return (
      <section id="ad-money" className="mt-8 scroll-mt-16">
        <h2 className="font-display text-2xl">Ad money in this race</h2>
        <p className="mt-3 border-2 border-dashed border-border p-6 text-center text-muted-foreground">
          No ads tracked in this race yet.
        </p>
      </section>
    );
  }
  const mostAttackedName = data.mostAttacked
    ? data.candidates.find((c) => c.slug === data.mostAttacked)?.name
    : null;
  const outsidePct = data.totalSpend ? Math.round((data.outsideSpend / data.totalSpend) * 100) : 0;
  return (
    <section id="ad-money" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Ad money in this race</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Who is paying to influence this race — supporting or attacking each candidate, and how much
        is a candidate&apos;s own committee vs. outside groups. Spend and reach are platform-disclosed
        ranges; figures are estimated midpoints. This shows pressure, not who wins.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.candidates.map((c) => (
          <CandidateMoneyCard key={c.slug} c={c} />
        ))}
      </div>
      <div className="mt-4 border-2 border-border bg-warning p-4 text-sm text-foreground shadow-[var(--shadow-brutal)]">
        <strong>Who&apos;s paying.</strong> {usd(data.totalSpend)} in tracked ads
        {outsidePct > 0 && <> — an estimated {outsidePct}% from outside groups</>}
        {mostAttackedName && <>. {mostAttackedName} is the most-attacked candidate here</>}.
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the race page**

In `src/app/races/[slug]/page.tsx`:

1. Add imports near the other guide imports (after line 6):
```tsx
import { RaceAdMoney } from "@/components/guide/race-ad-money";
```
and add `getAdMoneyForRace` to the existing `@/lib/data` import (line 13):
```tsx
import { getAdMoneyForRace, getRace, listRaces } from "@/lib/data";
```

2. In the page body (the `default async function`), fetch the data alongside the existing `getRace`. Find where `data`/`race` is resolved and add:
```tsx
const adMoney = await getAdMoneyForRace(slugToRaceId(slug));
```
(Place it after `notFound()` guard so we know the race exists.)

3. Add the section render right after `<RaceFinanceTable ... />` (line 184):
```tsx
<RaceAdMoney data={adMoney} />
```

4. Add a SectionNav entry. In the `navSections` array (line 90), add after the `money` entry (line 105):
```tsx
...(adMoney.candidates.length > 0 ? [{ id: "ad-money", label: "Ad money" }] : []),
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean. (If `next build` can't reach Convex for ISR data, that's fine — pages render at request time; the type/compile check is what matters here.)

- [ ] **Step 5: Commit**

```bash
git add src/components/guide/race-ad-money.tsx src/lib/data.ts "src/app/races/[slug]/page.tsx"
git commit -m "feat: per-race ad-money panel on race pages (MOO-309)"
```

---

### Task 4: `/ads` by-race overview (`AdsOverview`)

Restructure `/ads`: statewide headline (total, outside money, most-attacked) + race cards (spend + outside-money pill + for/against mini-bar → link to the race). Existing analytics + browser stay below the fold. Server component. Personalization comes in Task 5.

**Files:**
- Create: `src/components/guide/ads-overview.tsx`
- Modify: `src/app/ads/page.tsx`
- Reference: `src/lib/site.ts` (`raceIdToSlug` — for race-card links, already used in the race page import list), `src/components/guide/ads-analytics.tsx` (StatTile pattern).

**Interfaces:**
- Consumes: `api.adMoney.adMoneyOverview` via `getAdMoneyOverview()` (Task 3 fetcher), the overview return type from Task 2.
- Produces: `<AdsOverview overview={Awaited<ReturnType<typeof getAdMoneyOverview>>} />`.

- [ ] **Step 1: Create the component**

```tsx
// src/components/guide/ads-overview.tsx
import Link from "next/link";
import { raceIdToSlug } from "@/lib/site";
import type { getAdMoneyOverview } from "@/lib/data";

type Overview = Awaited<ReturnType<typeof getAdMoneyOverview>>;
type RaceCard = Overview["races"][number];

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-2xl font-bold text-foreground">{value}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** support-vs-attack mini bar for a race card. */
function ForAgainstBar({ supportShare, attackShare }: { supportShare: number; attackShare: number }) {
  return (
    <div className="mt-2 flex h-2 w-full overflow-hidden border-2 border-border">
      <div className="bg-success" style={{ width: `${Math.round(supportShare * 100)}%` }} />
      <div className="bg-destructive" style={{ width: `${Math.round(attackShare * 100)}%` }} />
    </div>
  );
}

export function RaceMoneyCard({ race }: { race: RaceCard }) {
  const outsidePct = race.totalSpend ? Math.round((race.outsideSpend / race.totalSpend) * 100) : 0;
  return (
    <Link
      href={`/races/${raceIdToSlug(race.raceId)}#ad-money`}
      className="press block border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg leading-tight">{race.office}</h3>
        {outsidePct > 0 && (
          <span className="shrink-0 border-2 border-border bg-warning px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-foreground">
            {outsidePct}% outside
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">{usd(race.totalSpend)}</p>
      <ForAgainstBar supportShare={race.supportShare} attackShare={race.attackShare} />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {race.adCount} ads · estimated
      </p>
    </Link>
  );
}

/** By-race overview: statewide headline + race cards. Personalized band handled by <YourRaces>. */
export function AdsOverview({ overview }: { overview: Overview }) {
  const { statewide, races } = overview;
  return (
    <section className="mt-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total tracked ad spend" value={usd(statewide.totalSpend)} note="Estimated (range midpoints)." />
        <StatTile label="Outside money (estimated)" value={usd(statewide.outsideSpend)} note="Not a candidate's own committee." />
        <StatTile
          label="Most-attacked candidate"
          value={statewide.mostAttacked ? statewide.mostAttacked.name : "—"}
          note={statewide.mostAttacked ? `${statewide.mostAttacked.office} · ${usd(statewide.mostAttacked.attackSpend)} against` : undefined}
        />
      </div>
      <h2 className="font-display mt-8 text-2xl">Ad money, race by race</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Each race, ranked by tracked ad spend. The pill shows the estimated share from outside
        groups; the bar shows supporting (green) vs. attacking (red) spend. Tap a race for the
        candidate breakdown.
      </p>
      {races.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {races.map((r) => (
            <RaceMoneyCard key={r.raceId} race={r} />
          ))}
        </div>
      ) : (
        <p className="mt-4 border-2 border-dashed border-border p-6 text-center text-muted-foreground">
          No races with tracked ads yet.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into `/ads` page**

In `src/app/ads/page.tsx`:

1. Add to the `@/lib/data` import: `getAdMoneyOverview`.
2. Add `AdsOverview` import: `import { AdsOverview } from "@/components/guide/ads-overview";`
3. In the data fetch (currently `const [ads, candidates] = await Promise.all([listAds(), candidateDirectory()]);`) add the overview:
```tsx
const [ads, candidates, overview] = await Promise.all([
  listAds(),
  candidateDirectory(),
  getAdMoneyOverview(),
]);
```
4. Render `<AdsOverview overview={overview} />` immediately **after** the "How to read this" `<section>` warning block and **before** the existing `{ads.length > 0 && (<div className="mt-10"><AdsAnalytics .../></div>)}` block. Add a divider before the old analytics:
```tsx
<AdsOverview overview={overview} />

<hr className="mt-10 border-t-2 border-dashed border-border" />
<h2 className="font-display mt-8 text-2xl">Statewide detail</h2>
```
(The existing `AdsAnalytics` + "Browse every ad" stay exactly as they are, now under "Statewide detail".)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/guide/ads-overview.tsx src/app/ads/page.tsx
git commit -m "feat: /ads by-race overview (statewide headline + race cards) (MOO-309)"
```

---

### Task 5: "Your races" personalization band (`YourRaces`)

Client component: highlight the viewer's races when districts are known (signed-in via `user_preferences`; or an address entered here via `/api/geocode`), else show the existing "Find your races" prompt. Never blocks the statewide overview. Reuses `relevantRaces` + `getMine` + `/api/geocode` — no new geocoding.

**Files:**
- Create: `src/components/guide/your-races.tsx`
- Modify: `src/app/ads/page.tsx` (render band above `AdsOverview`)
- Reference: `src/components/guide/ballot-finder.tsx` (`useQuery(api.preferences.getMine)`, `/api/geocode` fetch shape, `applyDistricts`), `src/lib/districts.ts` (`relevantRaces`, `Districts`, `parseGeocoderResponse` is server-side — here use the `/api/geocode` JSON directly: `{ ok, congressional, senate, assembly }`).

**Interfaces:**
- Consumes: overview `races` (passed from the server page as `RaceCard[]`), `api.preferences.getMine`, `relevantRaces`.
- Produces: `<YourRaces races={RaceCard[]} />` (client component). Reuses `RaceMoneyCard` from Task 4 for consistent cards.

**Notes:**
- The overview `RaceCard` lacks `districts`; `relevantRaces` needs `{ raceId, level, districts? }`. For v1, match on the fields present: statewide (`level === "State Executive" | "State Judicial"`) always included; Federal by `raceId === WI-US-HOUSE-D{congressional}-2026`; State Legislative by raceId containing the district number is unavailable here (no `districts` on the card) → include State Legislative races only when the raceId encodes the district (fall back: include the US House + statewide, which is the honest v1 per the spec's "your US House, plus statewide"). Keep it simple: build a `RaceLike` from each card with `districts: undefined` and let `relevantRaces` include statewide + matching US House. This is acceptable for v1 (assembly/senate personalization is a fast-follow — note it in a `// ponytail:` comment).

- [ ] **Step 1: Create the component**

```tsx
// src/components/guide/your-races.tsx
"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { relevantRaces, type Districts } from "@/lib/districts";
import { RaceMoneyCard } from "@/components/guide/ads-overview";
import type { getAdMoneyOverview } from "@/lib/data";

type RaceCard = Awaited<ReturnType<typeof getAdMoneyOverview>>["races"][number];

// ponytail: v1 personalizes to statewide + your US House race. State
// Senate/Assembly matching needs per-race district data on the card — a
// fast-follow (add districts to RaceOverview when we surface leg. races).
function pick(races: RaceCard[], districts: Districts): RaceCard[] {
  const likes = races.map((r) => ({ raceId: r.raceId, level: r.level, districts: undefined }));
  const keep = new Set(relevantRaces(districts, likes).map((r) => r.raceId));
  return races.filter((r) => keep.has(r.raceId));
}

export function YourRaces({ races }: { races: RaceCard[] }) {
  const prefs = useQuery(api.preferences.getMine, {});
  const [entered, setEntered] = useState<Districts | null>(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const districts: Districts | null =
    entered ??
    (prefs?.congressionalDistrict
      ? {
          congressional: Number(prefs.congressionalDistrict),
          senate: Number(prefs.stateSenateDistrict),
          assembly: Number(prefs.stateAssemblyDistrict),
        }
      : null);

  const mine = districts ? pick(races, districts) : [];

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.ok) {
        setEntered({ congressional: data.congressional, senate: data.senate, assembly: data.assembly });
      } else {
        setError("We couldn't match that address. Try the street, city, and ZIP.");
      }
    } catch {
      setError("Address lookup is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  if (districts && mine.length > 0) {
    return (
      <section className="mt-8">
        <h2 className="font-display text-2xl">Ad money in your races</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((r) => (
            <RaceMoneyCard key={r.raceId} race={r} />
          ))}
        </div>
      </section>
    );
  }

  // No districts (or none of your races have tracked ads) → prompt, never blocks the statewide view.
  return (
    <section className="mt-8 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl">See the ad money in your races</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your address to highlight the races on your ballot. We only use it to look up your
        districts — we never store the address for anonymous visitors.
      </p>
      <form onSubmit={lookup} className="mt-3 flex flex-wrap gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Madison, WI"
          className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-2"
          aria-label="Your address"
        />
        <button type="submit" className="press border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)]">
          {loading ? "Looking up…" : "Find my races"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {districts && mine.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No tracked ads in your races yet.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render the band on `/ads`**

In `src/app/ads/page.tsx`:
1. Add import: `import { YourRaces } from "@/components/guide/your-races";`
2. Render `<YourRaces races={overview.races} />` immediately **before** `<AdsOverview overview={overview} />` (personalized band leads, statewide overview follows).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/guide/your-races.tsx src/app/ads/page.tsx
git commit -m "feat: 'your races' personalization band on /ads (MOO-309)"
```

---

### Task 6: Full verification + deploy + prod visual check

Gate the whole feature: suite green, types clean, build clean, deploy, and verify against real prod data (Governor race is the natural check).

**Files:** none (verification only).

- [ ] **Step 1: Full test + type + build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all tests PASS (baseline 181 + the new adMoney unit/convex tests), tsc clean, build clean.

- [ ] **Step 2: Deploy Convex then Vercel**

Run: `npx convex deploy -y && npx vercel deploy --prod --yes`
Expected: both succeed. (Convex first so the new queries exist before the site calls them.)

- [ ] **Step 3: Prod visual check — Governor race page**

Open `https://badgerbrief.vercel.app/races/governor` (or the correct Governor slug — confirm via `raceIdToSlug("WI-GOV-2026")`). Confirm the "Ad money" section:
- Appears in the SectionNav.
- Shows Tiffany's card with ~$817k supporting (mostly own committee — split bar heavily "own"), ~$70k attacking.
- "Who's paying" takeaway names Tiffany as most-attacked, with an estimated outside %.
- Every figure reads as estimated / influence-not-effect.

- [ ] **Step 4: Prod visual check — /ads overview**

Open `https://badgerbrief.vercel.app/ads`. Confirm:
- Statewide tiles: total tracked spend (~$3.5M–$4.3M), outside money (estimated), most-attacked candidate.
- "Your races" band renders (prompt when signed out with no address; races when an address is entered).
- Race cards ranked by spend, each with outside-money pill + for/against mini-bar, linking to `/races/<slug>#ad-money`.
- The old analytics + "Browse every ad" still render below under "Statewide detail."

- [ ] **Step 5: Final commit (if any lockfile/generated changes)**

```bash
git add -A
git commit -m "chore: ad-money-by-race verified on prod (MOO-309)" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Per-race layout-B panel (support/attack/reach/own-vs-outside + takeaway) → Task 3. ✓
- `/ads` statewide headline (total, outside, most-attacked) + race cards (spend + outside pill + for/against bar → link) → Task 4. ✓
- "Your races" hybrid personalization (getMine + /api/geocode + relevantRaces + fallback prompt) → Task 5. ✓
- Pure aggregation (`isOwnCommittee`, `rollupCandidate`, `rollupRace`) unit-tested → Task 1. ✓
- Convex queries (`adMoneyForRace`, `adMoneyOverview`) convex-test covered → Task 2. ✓
- Honesty framing (midpoints, "estimated", influence-not-effect) → constraints + copy in Tasks 3/4/5. ✓
- Edge cases: no-ads race (quiet empty state, Tasks 3/4), stance-less ad excluded but counted (Task 1 test + `unclassifiedCount` surfaced in Task 3), personalization failure falls back (Task 5). ✓
- No schema changes, ISR `revalidate = 300` (pages already set it). ✓
- Deferred items (geo-targeting, timeline, leaderboard) not built. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has complete code. The one deliberate v1 simplification (Senate/Assembly personalization) is marked with a `// ponytail:` comment and named as a fast-follow, per the spec's deferral of leg-district precision. ✓

**3. Type consistency:** `RaceAdMoney`/`CandidateAdMoney`/`AdRow`/`CandidateLite` defined in Task 1, consumed unchanged in Tasks 2–5. `adMoneyForRace`/`adMoneyOverview` names consistent across Tasks 2–5. `RaceMoneyCard` defined in Task 4, imported in Task 5. `getAdMoneyForRace`/`getAdMoneyOverview` fetchers defined in Task 3, used in Tasks 3–5. ✓
