# MOO-412 Issue-Alignment On-Ramp (`/match`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/match` page where a voter picks issues and sees candidates on their ballot with sourced positions on those issues — statewide first, local races added by address — alignment, never endorsement.

**Architecture:** A new read-only Convex query returns candidates + published positions for a set of races. A pure `buildIssueMatch` helper (reusing MOO-411's `buildIssueComparison`) pivots that into issue-primary groups. A client page holds selected-issues + optional-districts state, calls the query reactively via `useQuery`, and renders the groups with the existing compare card idiom. No schema/data change.

**Tech Stack:** Next.js 16 App Router (RSC shell + client experience), TypeScript, Convex (`useQuery`), Vitest + convex-test, Tailwind (existing tokens).

## Global Constraints

- **No Convex schema/data change.** New read-only `query` only.
- **Non-partisan:** no scoring, ranking, agreement %, "best match", or party grouping. Issue-group order = the voter's selection order; races = ballot order (statewide first); candidates = alphabetical by last name.
- **Honest gaps:** a selected issue with zero coverage across the active ballot shows an explicit line, never a blank; candidates in a covered race without a position on that issue appear in a "no position on record" list.
- **Statewide = `level` `"State Executive"` or `"State Judicial"`** (always on ballot). **District = `"Federal"` (U.S. House) + `"State Legislative"`**, added via existing `relevantRaces(districts, races)`.
- **Route:** `/match`. Frame copy to avoid a "match score" reading ("see where candidates on your ballot stand — no rankings, no endorsements").
- **Stance values:** `support | oppose | mixed | evolving | unclear`.
- **Reuse:** `buildIssueComparison` (`src/lib/compare.ts`), `/api/geocode`, `relevantRaces` (`src/lib/districts.ts`), `SourceList`/`PartyBadge` (`src/components/guide/*`), `listIssueSlugs`/`listRaces`.
- Tests: Vitest; lib tests start `// @vitest-environment node`; convex tests use `convexTest(schema, modules)`.
- Deploy Tarik-gated; plan stops at verified-locally + committed on branch `tarikjmoody/moo-412-...`.

---

### Task 1: Extract shared candidate-order helpers

Pull `lastName`, a `byLastName` comparator, and `labelForSlug` out of `compare.ts` into one module so `buildIssueMatch` reuses them (DRY — both files need them now). Behavior must not change.

**Files:**
- Create: `src/lib/candidate-order.ts`
- Create: `src/lib/candidate-order.test.ts`
- Modify: `src/lib/compare.ts` (lines 16-35 area — replace the two local consts + `byLast` with imports)

**Interfaces:**
- Produces:
  ```ts
  export const lastName: (name: string) => string;
  export const byLastName: <T extends { name: string }>(a: T, b: T) => number;
  export const labelForSlug: (slug: string) => string;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/candidate-order.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lastName, byLastName, labelForSlug } from "./candidate-order";

describe("candidate-order", () => {
  it("lastName takes the final whitespace token, lowercased", () => {
    expect(lastName("Bo Barnes")).toBe("barnes");
    expect(lastName("  Ann  Marie  Smith ")).toBe("smith");
  });
  it("byLastName sorts by last name A–Z", () => {
    const xs = [{ name: "Cy Lee" }, { name: "Bo Barnes" }, { name: "Ann Smith" }];
    expect(xs.slice().sort(byLastName).map((x) => x.name)).toEqual(["Bo Barnes", "Cy Lee", "Ann Smith"]);
  });
  it("labelForSlug title-cases slug tokens", () => {
    expect(labelForSlug("gun-policy")).toBe("Gun Policy");
    expect(labelForSlug("abortion")).toBe("Abortion");
    expect(labelForSlug("economy_jobs")).toBe("Economy Jobs");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/candidate-order.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```ts
// src/lib/candidate-order.ts

// ponytail: last whitespace token as "last name" — approximation, fine for a
// neutral A–Z sort; revisit only if a real ordering complaint appears (suffixes).
export const lastName = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();

export const byLastName = <T extends { name: string }>(a: T, b: T) =>
  lastName(a.name).localeCompare(lastName(b.name));

// ponytail: slug -> Title Case; acronym-blind. Upgrade to a label map only if an
// issue slug reads wrong on the page.
export const labelForSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
```

- [ ] **Step 4: Refactor `compare.ts` to import them**

In `src/lib/compare.ts`: delete the local `lastName` (line ~18) and `labelForSlug` (lines ~22-27) consts, and add at the top of the file (after the type exports):

```ts
import { byLastName, labelForSlug } from "./candidate-order";
```

Then inside `buildIssueComparison` delete the local `byLast` definition (lines ~34-35) and replace both uses (`.sort((a, b) => byLast(a.candidate, b.candidate))` and `.sort(byLast)`) with `byLastName`:

```ts
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));

  // issueSlug -> candidateSlug -> position (first wins on duplicates)
  const grouped = new Map<string, Map<string, ComparePosition>>();
  for (const p of positions) {
    if (!bySlug.has(p.candidateSlug)) continue;
    let issue = grouped.get(p.issueSlug);
    if (!issue) grouped.set(p.issueSlug, (issue = new Map()));
    if (!issue.has(p.candidateSlug)) issue.set(p.candidateSlug, p);
  }

  const issues: IssueGroup[] = [...grouped.entries()].map(([issueSlug, byCand]) => {
    const onRecord = [...byCand.entries()]
      .map(([slug, position]) => ({ candidate: bySlug.get(slug)!, position }))
      .sort((a, b) => byLastName(a.candidate, b.candidate));
    const onSet = new Set(byCand.keys());
    const noRecord = candidates.filter((c) => !onSet.has(c.slug)).sort(byLastName);
    return { issueSlug, label: labelForSlug(issueSlug), onRecord, noRecord };
  });
```

(Leave the `issues.sort(...)` coverage-desc line and `totalOnRecord` unchanged.)

- [ ] **Step 5: Run both test files to verify green**

Run: `npx vitest run src/lib/candidate-order.test.ts src/lib/compare.test.ts`
Expected: PASS (3 + 3). The existing `compare.test.ts` proves the refactor preserved behavior.

- [ ] **Step 6: Commit**

```bash
git add src/lib/candidate-order.ts src/lib/candidate-order.test.ts src/lib/compare.ts
git commit -m "refactor(compare): extract shared candidate-order helpers (MOO-412)"
```

---

### Task 2: `buildIssueMatch` helper

**Files:**
- Create: `src/lib/issue-match.ts`
- Test: `src/lib/issue-match.test.ts`

**Interfaces:**
- Consumes: `buildIssueComparison`, `CompareCandidate`, `ComparePosition` from `./compare`; `labelForSlug` from `./candidate-order`.
- Produces:
  ```ts
  export type RaceInput = { raceId: string; office: string; candidates: CompareCandidate[]; positions: ComparePosition[] };
  export type IssueMatchRace = {
    raceId: string; office: string;
    onRecord: { candidate: CompareCandidate; position: ComparePosition }[];
    noRecord: CompareCandidate[];
  };
  export type IssueMatchGroup = { issueSlug: string; label: string; races: IssueMatchRace[] };
  export function buildIssueMatch(
    races: RaceInput[], selectedIssueSlugs: string[],
  ): { groups: IssueMatchGroup[]; totalOnRecord: number };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/issue-match.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildIssueMatch, type RaceInput } from "./issue-match";

const pos = (candidateSlug: string, issueSlug: string) => ({
  candidateSlug, issueSlug, stance: "support", summary: `${candidateSlug}/${issueSlug}`, sources: [],
});
const races: RaceInput[] = [
  {
    raceId: "WI-GOV-2026", office: "Governor",
    candidates: [{ slug: "barnes", name: "Mandela Barnes" }, { slug: "roys", name: "Kelda Roys" }],
    positions: [pos("barnes", "healthcare"), pos("roys", "healthcare"), pos("barnes", "abortion")],
  },
  {
    raceId: "WI-AG-2026", office: "Attorney General",
    candidates: [{ slug: "kaul", name: "Josh Kaul" }, { slug: "toney", name: "Eric Toney" }],
    positions: [pos("kaul", "healthcare")],
  },
];

describe("buildIssueMatch", () => {
  it("groups issue-primary in selection order; races with coverage only; on/noRecord per race", () => {
    const { groups, totalOnRecord } = buildIssueMatch(races, ["healthcare", "abortion"]);
    expect(groups.map((g) => g.issueSlug)).toEqual(["healthcare", "abortion"]);
    expect(groups[0].label).toBe("Healthcare");
    // healthcare: both races have coverage
    expect(groups[0].races.map((r) => r.raceId)).toEqual(["WI-GOV-2026", "WI-AG-2026"]);
    // gov healthcare onRecord alpha by last name: Barnes, Roys
    expect(groups[0].races[0].onRecord.map((r) => r.candidate.slug)).toEqual(["barnes", "roys"]);
    // AG healthcare: kaul on record, toney no record
    expect(groups[0].races[1].onRecord.map((r) => r.candidate.slug)).toEqual(["kaul"]);
    expect(groups[0].races[1].noRecord.map((c) => c.slug)).toEqual(["toney"]);
    // abortion: only Governor has coverage -> AG dropped from this group
    expect(groups[1].races.map((r) => r.raceId)).toEqual(["WI-GOV-2026"]);
    expect(totalOnRecord).toBe(4); // gov healthcare 2 + ag healthcare 1 + gov abortion 1
  });

  it("selecting an uncovered issue yields no group; dup selections dedupe", () => {
    expect(buildIssueMatch(races, ["immigration"])).toEqual({ groups: [], totalOnRecord: 0 });
    const { groups } = buildIssueMatch(races, ["abortion", "abortion"]);
    expect(groups).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/issue-match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/issue-match.ts
import { buildIssueComparison, type CompareCandidate, type ComparePosition } from "./compare";
import { labelForSlug } from "./candidate-order";

export type RaceInput = {
  raceId: string;
  office: string;
  candidates: CompareCandidate[];
  positions: ComparePosition[];
};
export type IssueMatchRace = {
  raceId: string;
  office: string;
  onRecord: { candidate: CompareCandidate; position: ComparePosition }[];
  noRecord: CompareCandidate[];
};
export type IssueMatchGroup = { issueSlug: string; label: string; races: IssueMatchRace[] };

export function buildIssueMatch(
  races: RaceInput[],
  selectedIssueSlugs: string[],
): { groups: IssueMatchGroup[]; totalOnRecord: number } {
  // Compute each race's full issue breakdown once, then look issues up.
  const perRace = races.map((race) => ({
    race,
    issues: buildIssueComparison(race.candidates, race.positions).issues,
  }));

  const groups: IssueMatchGroup[] = [];
  let totalOnRecord = 0;
  const seen = new Set<string>();

  for (const issueSlug of selectedIssueSlugs) {
    if (seen.has(issueSlug)) continue; // dedupe, preserve selection order
    seen.add(issueSlug);

    const raceRows: IssueMatchRace[] = [];
    for (const { race, issues } of perRace) {
      const match = issues.find((i) => i.issueSlug === issueSlug);
      if (!match || match.onRecord.length === 0) continue; // drop races with no coverage on this issue
      raceRows.push({
        raceId: race.raceId,
        office: race.office,
        onRecord: match.onRecord,
        noRecord: match.noRecord,
      });
      totalOnRecord += match.onRecord.length;
    }
    if (raceRows.length > 0) {
      groups.push({ issueSlug, label: labelForSlug(issueSlug), races: raceRows });
    }
  }
  return { groups, totalOnRecord };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/issue-match.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/issue-match.ts src/lib/issue-match.test.ts
git commit -m "feat(match): issue-primary buildIssueMatch helper (MOO-412)"
```

---

### Task 3: `positionsForRaces` Convex query

**Files:**
- Modify: `convex/public.ts` (add export near `getRace`)
- Test: `convex/positionsForRaces.test.ts`

**Interfaces:**
- Produces: `api.public.positionsForRaces({ raceIds: string[] })` → array of
  `{ raceId, office, level, candidates: {slug,name,party?,incumbent?}[], positions: {candidateSlug,issueSlug,stance,summary,sources}[] }`, one entry per existing race id (missing ids skipped), in the input id order.

- [ ] **Step 1: Write the failing test**

```ts
// convex/positionsForRaces.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

test("positionsForRaces returns candidates + published positions per race, in id order", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026", electionSlug: "wi-2026", office: "Governor",
      level: "State Executive", sources: [], dataAsOf: "2026-07-26",
    });
    await ctx.db.insert("candidates", {
      slug: "barnes", raceId: "WI-GOV-2026", name: "Mandela Barnes", party: "Democratic",
      sources: [], dataAsOf: "2026-07-26",
    });
    await ctx.db.insert("candidate_positions_published", {
      candidateSlug: "barnes", raceId: "WI-GOV-2026", issueSlug: "healthcare",
      stance: "support", summary: "…", confidence: 0.8,
      sources: [{ name: "Site", url: "https://x" }],
      draftId: "k" as never, publishedAt: 1, lastReviewedAt: 1,
    });
  });

  const out = await t.query(api.public.positionsForRaces, { raceIds: ["WI-GOV-2026", "MISSING"] });
  expect(out).toHaveLength(1);
  expect(out[0].raceId).toBe("WI-GOV-2026");
  expect(out[0].office).toBe("Governor");
  expect(out[0].level).toBe("State Executive");
  expect(out[0].candidates).toEqual([{ slug: "barnes", name: "Mandela Barnes", party: "Democratic", incumbent: undefined }]);
  expect(out[0].positions[0]).toMatchObject({ candidateSlug: "barnes", issueSlug: "healthcare", stance: "support" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/positionsForRaces.test.ts`
Expected: FAIL — `positionsForRaces` is not a function on `api.public`.

- [ ] **Step 3: Implement the query**

Add to `convex/public.ts` (after `getRace`; `query`/`v` are already imported in that file):

```ts
export const positionsForRaces = query({
  args: { raceIds: v.array(v.string()) },
  handler: async (ctx, { raceIds }) => {
    const out: {
      raceId: string; office: string; level: string;
      candidates: { slug: string; name: string; party?: string; incumbent?: boolean }[];
      positions: { candidateSlug: string; issueSlug: string; stance: string; summary: string; sources: { name: string; url: string }[] }[];
    }[] = [];
    for (const raceId of raceIds) {
      const race = await ctx.db
        .query("races")
        .withIndex("by_race_id", (q) => q.eq("raceId", raceId))
        .unique();
      if (!race) continue;
      const [candidates, positions] = await Promise.all([
        ctx.db.query("candidates").withIndex("by_race", (q) => q.eq("raceId", raceId)).collect(),
        ctx.db
          .query("candidate_positions_published")
          .withIndex("by_candidate_issue", (q) => q.eq("raceId", raceId))
          .collect(),
      ]);
      out.push({
        raceId: race.raceId,
        office: race.office,
        level: race.level,
        candidates: candidates.map((c) => ({ slug: c.slug, name: c.name, party: c.party, incumbent: c.incumbent })),
        positions: positions.map((p) => ({
          candidateSlug: p.candidateSlug, issueSlug: p.issueSlug, stance: p.stance, summary: p.summary, sources: p.sources,
        })),
      });
    }
    return out;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/positionsForRaces.test.ts`
Expected: PASS. (If the codegen types lag, run `npx convex codegen` first.)

- [ ] **Step 5: Commit**

```bash
git add convex/public.ts convex/positionsForRaces.test.ts
git commit -m "feat(match): positionsForRaces query for cross-race issue matching (MOO-412)"
```

---

### Task 4: `/match` page — issue picker + statewide results (URL-synced)

Delivers a working `/match` for statewide races: pick issues → see statewide candidates' sourced positions. No address step yet (Task 5 adds it).

**Files:**
- Create: `src/app/match/page.tsx` (server shell)
- Create: `src/components/match/match-experience.tsx` (client)
- Create: `src/components/match/issue-picker.tsx` (client)
- Create: `src/components/match/match-results.tsx` (client)

**Interfaces:**
- Consumes: `buildIssueMatch`/`RaceInput`/`IssueMatchGroup` (`@/lib/issue-match`), `api.public.positionsForRaces` + `api.public.listIssueSlugs` (`useQuery`), `listRaces` (`@/lib/data`), `labelForSlug` (`@/lib/candidate-order`), `SourceList` (`@/components/guide/sources`), `PartyBadge` (`@/components/guide/labels`), `Doc` type.
- Produces: the `/match` route. `MatchResults` is reused by Task 5.

- [ ] **Step 1: Server shell — `src/app/match/page.tsx`**

```tsx
import type { Metadata } from "next";
import { listRaces } from "@/lib/data";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { MatchExperience } from "@/components/match/match-experience";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "What matters to you? — Wisconsin 2026 candidates by issue",
  description:
    "Pick the issues you care about and see where the candidates on your Wisconsin ballot stand — every position linked to its source. No rankings, no endorsements.",
  alternates: { canonical: "/match" },
};

export default async function MatchPage() {
  const races = await listRaces();
  // Pass only what the client needs (raceId, office, level) — keep the payload small.
  const raceMeta = races.map((r) => ({ raceId: r.raceId, office: r.office, level: r.level }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "What matters to you", path: "/match" },
          ]),
        ]}
      />
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">
        What matters to you?
      </h1>
      <p className="mt-2 max-w-2xl">
        Pick the issues you care about. We&apos;ll show where the candidates on your
        ballot stand — every position linked to its source. This is not a ranking or
        an endorsement.
      </p>
      <MatchExperience raceMeta={raceMeta} />
    </main>
  );
}
```

- [ ] **Step 2: Issue picker — `src/components/match/issue-picker.tsx`**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { labelForSlug } from "@/lib/candidate-order";

export function IssuePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  const slugs = useQuery(api.public.listIssueSlugs, {});
  if (slugs === undefined) {
    return <p className="mt-4 font-mono text-xs text-muted-foreground">Loading issues…</p>;
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Issues you care about">
      {slugs.map((slug) => {
        const on = selected.includes(slug);
        return (
          <button
            key={slug}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(slug)}
            className={`press border-2 border-border px-3 py-1.5 text-sm font-bold shadow-[var(--shadow-brutal)] ${
              on ? "bg-foreground text-background" : "bg-card"
            }`}
          >
            {labelForSlug(slug)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Results — `src/components/match/match-results.tsx`**

```tsx
"use client";

import Link from "next/link";
import { PartyBadge } from "@/components/guide/labels";
import { SourceList } from "@/components/guide/sources";
import type { IssueMatchGroup } from "@/lib/issue-match";

export function MatchResults({ groups }: { groups: IssueMatchGroup[] }) {
  return (
    <div className="mt-8 space-y-10">
      {groups.map((group) => (
        <section key={group.issueSlug} className="scroll-mt-16">
          <h2 className="font-display text-2xl">{group.label}</h2>
          <div className="mt-3 space-y-5">
            {group.races.map((race) => (
              <div key={race.raceId}>
                <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {race.office}
                </h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {race.onRecord.map(({ candidate, position }) => (
                    <div
                      key={candidate.slug}
                      className="flex flex-col border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/candidates/${candidate.slug}`}
                          className="font-bold underline decoration-2 underline-offset-2"
                        >
                          {candidate.name}
                        </Link>
                        <PartyBadge party={candidate.party} />
                      </div>
                      <span className="mt-2 w-fit border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
                        {position.stance}
                      </span>
                      <p className="mt-2 max-w-[54ch] text-sm">{position.summary}</p>
                      <div className="mt-auto pt-2">
                        <SourceList sources={position.sources} title="Position sources" collapsible />
                      </div>
                    </div>
                  ))}
                </div>
                {race.noRecord.length > 0 && (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    No position on record: {race.noRecord.map((c) => c.name).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Experience — `src/components/match/match-experience.tsx`** (statewide only for now)

```tsx
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { buildIssueMatch, type RaceInput } from "@/lib/issue-match";
import { IssuePicker } from "./issue-picker";
import { MatchResults } from "./match-results";

type RaceMeta = { raceId: string; office: string; level: string };
const STATEWIDE = new Set(["State Executive", "State Judicial"]);

export function MatchExperience({ raceMeta }: { raceMeta: RaceMeta[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selected = useMemo(
    () => (params.get("issues") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    [params],
  );

  const setSelected = useCallback(
    (next: string[]) => {
      const q = next.join(",");
      router.replace(q ? `${pathname}?issues=${encodeURIComponent(q)}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const toggle = useCallback(
    (slug: string) =>
      setSelected(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]),
    [selected, setSelected],
  );

  // Statewide races are on every ballot; ordered statewide-first (they're the only
  // ones here until Task 5 adds district races).
  const activeRaceIds = useMemo(
    () => raceMeta.filter((r) => STATEWIDE.has(r.level)).map((r) => r.raceId),
    [raceMeta],
  );

  const data = useQuery(
    api.public.positionsForRaces,
    selected.length > 0 ? { raceIds: activeRaceIds } : "skip",
  );

  const result = useMemo(() => {
    if (!data) return null;
    return buildIssueMatch(data as RaceInput[], selected);
  }, [data, selected]);

  return (
    <>
      <IssuePicker selected={selected} onToggle={toggle} />

      {selected.length === 0 ? (
        <p className="mt-8 border-2 border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Pick one or more issues above to see where candidates stand.
        </p>
      ) : result === null ? (
        <p className="mt-8 font-mono text-xs text-muted-foreground">Finding positions…</p>
      ) : result.totalOnRecord === 0 ? (
        <p className="mt-8 border-2 border-border bg-warning p-4 text-sm font-bold">
          None of the statewide candidates have a sourced position on{" "}
          {selected.length > 1 ? "these issues" : "this issue"} on record yet. We only show
          positions we can link to a source.
        </p>
      ) : (
        <MatchResults groups={result.groups} />
      )}
    </>
  );
}
```

- [ ] **Step 5: Typecheck + live verify**

Run: `npx tsc --noEmit` → no errors.
Run `npx next dev`, then:
```bash
curl -s "localhost:3000/match?issues=healthcare" | grep -o "What matters to you" | head -1
```
In a browser at 375px: pick issues → statewide issue sections render with sourced cards + "No position on record" lines; the `?issues=` URL updates and survives reload; no body horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add src/app/match/page.tsx src/components/match/
git commit -m "feat(match): /match page — issue picker + statewide results (MOO-412)"
```

---

### Task 5: Progressive ballot step — add the voter's district races

Adds an address/manual-district control that appends the voter's U.S. House + legislative races to the active set. Reuses `/api/geocode` + `relevantRaces`.

**Files:**
- Create: `src/components/match/ballot-control.tsx` (client)
- Modify: `src/components/match/match-experience.tsx` (hold `districts` state, widen `activeRaceIds`)

**Interfaces:**
- Consumes: `/api/geocode` (returns on success `{ ok: true, congressional, senate, assembly, matchedAddress }`; on failure `{ ok: false, error }`), `relevantRaces` + `Districts` (`@/lib/districts`).
- Produces: `<BallotControl onFound={(d: Districts, matchedAddress?: string) => void} />`.

- [ ] **Step 1: Ballot control — `src/components/match/ballot-control.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Districts } from "@/lib/districts";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function BallotControl({
  onFound,
}: {
  onFound: (districts: Districts, matchedAddress?: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState({ congressional: 0, senate: 0, assembly: 0 });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.ok) {
        onFound(
          { congressional: data.congressional, senate: data.senate, assembly: data.assembly },
          data.matchedAddress,
        );
      } else {
        setError(
          data.error === "not_wisconsin"
            ? "That address isn't in Wisconsin."
            : "Couldn't match that address — pick your districts below.",
        );
        setManual(true);
      }
    } catch {
      setError("Address lookup is unavailable — pick your districts below.");
      setManual(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-lg">Add your local races</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional — your address adds your U.S. House and legislative races. We never store it.
      </p>
      <form onSubmit={lookup} className="mt-3 flex flex-wrap gap-3">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Milwaukee, WI"
          aria-label="Your address"
          required
          minLength={5}
          className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="press border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] disabled:opacity-60"
        >
          {busy ? "Looking…" : "Add my races"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 border-2 border-border bg-warning p-3 text-sm font-bold">
          {error}
        </p>
      )}

      {manual && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {(
            [
              ["U.S. House", "congressional", 8],
              ["State Senate", "senate", 33],
              ["Assembly", "assembly", 99],
            ] as const
          ).map(([label, key, max]) => (
            <label key={key} className="text-sm font-bold">
              {label}
              <select
                value={picked[key] || ""}
                onChange={(e) => setPicked({ ...picked, [key]: Number(e.target.value) })}
                className="mt-1 block border-2 border-border bg-background px-2 py-1.5"
              >
                <option value="" disabled>
                  Pick
                </option>
                {range(max).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={!picked.congressional || !picked.senate || !picked.assembly}
            onClick={() => onFound(picked)}
            className="press border-2 border-border bg-secondary px-3 py-1.5 font-bold shadow-[var(--shadow-brutal)] disabled:opacity-60"
          >
            Show my races
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire districts into `match-experience.tsx`**

Add `Districts`/`relevantRaces` imports and district state; widen the active race set. Replace the imports block and the `activeRaceIds` memo:

```tsx
import { useCallback, useMemo, useState } from "react";
// …existing imports…
import { relevantRaces, type Districts } from "@/lib/districts";
import { BallotControl } from "./ballot-control";
```

```tsx
  const [districts, setDistricts] = useState<Districts | null>(null);

  // Statewide always; when the voter adds an address, relevantRaces returns their
  // full personalized set (statewide + U.S. House + legislative), statewide-first
  // in raceMeta order.
  const activeRaceIds = useMemo(() => {
    const chosen = districts
      ? relevantRaces(districts, raceMeta as { raceId: string; level: string; districts?: { district?: number }[] | null }[])
      : raceMeta.filter((r) => STATEWIDE.has(r.level));
    return chosen.map((r) => r.raceId);
  }, [districts, raceMeta]);
```

Then render `<BallotControl onFound={(d) => setDistricts(d)} />` directly under `<IssuePicker .../>` (only meaningful once ≥1 issue is picked, but showing it always is fine and cheap):

```tsx
      <IssuePicker selected={selected} onToggle={toggle} />
      <BallotControl onFound={(d) => setDistricts(d)} />
```

Note: `relevantRaces` needs each race's `level`, `raceId`, and optional `districts`. `raceMeta` carries `raceId` + `level`; the old chamber-wide `districts` blob isn't in `raceMeta`, but the 2026 data uses per-district legislative races (matched by raceId), so the blob path isn't exercised — pass `districts: undefined` implicitly. If a future dataset reintroduces chamber-wide rows, add `districts` to `raceMeta` in `page.tsx`.

- [ ] **Step 3: Typecheck + live verify**

Run: `npx tsc --noEmit` → no errors.
Browser: pick an issue → statewide results; enter a valid WI address (or use manual district pickers) → the voter's U.S. House + legislative races appear under the relevant issues; a not-Wisconsin address shows the error and statewide results stay.

- [ ] **Step 4: Commit**

```bash
git add src/components/match/ballot-control.tsx src/components/match/match-experience.tsx
git commit -m "feat(match): progressive address step adds local races (MOO-412)"
```

---

### Task 6: Entry points — home hero + compare page links

**Files:**
- Modify: `src/components/guide/home-guide.tsx` (hero CTA area, ~lines 56-67)
- Modify: `src/app/compare/[slug]/page.tsx` (under the intro paragraph)

- [ ] **Step 1: Add a `/match` CTA in the home hero**

In `src/components/guide/home-guide.tsx`, add a third CTA link alongside the existing two hero `<Link>`s (match their styling; use the primary treatment so it stands out as the on-ramp):

```tsx
          <Link
            href="/match"
            className="press border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]"
          >
            What matters to you? →
          </Link>
```

- [ ] **Step 2: Add a `/match` link on the compare page**

In `src/app/compare/[slug]/page.tsx`, immediately after the intro `<p>` (the "The N candidates side by side…" paragraph), add:

```tsx
      <p className="mt-3">
        <Link
          href="/match"
          className="font-mono text-xs font-bold uppercase tracking-widest underline underline-offset-2"
        >
          Or start from the issues you care about →
        </Link>
      </p>
```

- [ ] **Step 3: Typecheck + full suite + live verify**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → all pass (prior 502 + candidate-order 3 + issue-match 2 + positionsForRaces 1 = ~508; report actual).
Browser: home hero shows the "What matters to you?" CTA → `/match`; a compare page shows the issues link → `/match`.

- [ ] **Step 4: Commit**

```bash
git add src/components/guide/home-guide.tsx "src/app/compare/[slug]/page.tsx"
git commit -m "feat(match): home + compare entry links to /match (MOO-412)"
```

---

## Self-Review

- **Spec coverage:** dedicated `/match` page (Task 4) ✓; statewide-first progressive (Task 4 statewide + Task 5 address) ✓; issue-primary results (Task 2 helper + Task 3 render) ✓; `positionsForRaces` query (Task 3) ✓; `buildIssueMatch` reusing `buildIssueComparison` (Task 2) ✓; extract `candidate-order.ts` (Task 1) ✓; reuse `/api/geocode` + `relevantRaces` (Task 5) ✓; issue picker from `listIssueSlugs` + URL `?issues=` (Task 4) ✓; honest gaps / empty states (Task 4 + Task 3 render) ✓; entry links home + compare (Task 6) ✓; non-partisan (no scoring/party grouping anywhere; selection-order groups, alpha candidates) ✓; no schema/data change ✓.
- **Placeholder scan:** none — all steps carry complete code. The one no-unit-test surface (the client page) is verified by tsc + live checks, consistent with the tested helper underneath.
- **Type consistency:** `RaceInput`/`IssueMatchGroup`/`IssueMatchRace` defined in Task 2 and consumed unchanged in Tasks 3-4; `positionsForRaces` return shape (Task 3) is assignable to `RaceInput[]` (has `raceId, office, candidates, positions`; extra `level` is ignored by the helper); `byLastName`/`labelForSlug` (Task 1) used by Tasks 2 and existing compare; `STATEWIDE` levels match the spec's classification; `Districts`/`relevantRaces` signatures match `src/lib/districts.ts`.
```
