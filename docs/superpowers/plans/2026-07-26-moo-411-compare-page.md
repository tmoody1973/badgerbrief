# MOO-411 Issue-by-Issue Compare Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/compare/[slug]` from a thin candidate×column table into an issue-by-issue side-by-side of every candidate's sourced position, with honest gap labels.

**Architecture:** One pure helper (`src/lib/compare.ts`) groups the `positions` already returned by `getRace` into issue sections (coverage-sorted, candidates alpha by last name). The page (`src/app/compare/[slug]/page.tsx`) renders those sections as neo-brutalist candidate cards under a sticky `SectionNav`, reusing existing guide components. No Convex or schema change.

**Tech Stack:** Next.js 16 App Router (RSC, `revalidate = 300`), TypeScript, Convex (read-only via `getRace`), Vitest, Tailwind (existing design tokens).

## Global Constraints

- **No Convex/schema/data change** — `getRace(raceId)` already returns `{ race, candidates, positions }`. Read-only.
- **Non-partisan:** no scoring, ranking, agreement %, or party grouping. Ordering is data-coverage + alphabetical only.
- **Honest gaps:** never a silent blank — candidates without a position on an issue render as a labeled "No position on record" list.
- **Reuse, don't rebuild:** `SectionNav`, `SourceList`, `PartyBadge`, `LastUpdated` already exist and are the site idiom.
- **Stance values** are exactly `support | oppose | mixed | evolving | unclear`.
- **Tests** run under Vitest; lib tests start with `// @vitest-environment node` (global env is edge-runtime).
- Deploy is Tarik-gated — the plan stops at verified-locally + committed on branch `tarikjmoody/moo-411-...`.

---

### Task 1: `buildIssueComparison` grouping helper

**Files:**
- Create: `src/lib/compare.ts`
- Test: `src/lib/compare.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  export type CompareCandidate = { slug: string; name: string; party?: string; incumbent?: boolean };
  export type ComparePosition = {
    candidateSlug: string; issueSlug: string; stance: string; summary: string;
    sources: { name: string; url: string }[];
  };
  export type IssueGroup = {
    issueSlug: string;
    label: string;
    onRecord: { candidate: CompareCandidate; position: ComparePosition }[];
    noRecord: CompareCandidate[];
  };
  export function buildIssueComparison(
    candidates: CompareCandidate[],
    positions: ComparePosition[],
  ): { issues: IssueGroup[]; totalOnRecord: number };
  ```
  (Params are structural subsets of the Convex `Doc<"candidates">` / `Doc<"candidate_positions_published">`, so the page passes the real Docs directly.)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/compare.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildIssueComparison, type CompareCandidate, type ComparePosition } from "./compare";

const cands: CompareCandidate[] = [
  { slug: "smith", name: "Ann Smith" },
  { slug: "barnes", name: "Bo Barnes" },
  { slug: "lee", name: "Cy Lee" },
];
const pos = (candidateSlug: string, issueSlug: string): ComparePosition => ({
  candidateSlug, issueSlug, stance: "support", summary: `${candidateSlug} on ${issueSlug}`, sources: [],
});

describe("buildIssueComparison", () => {
  it("sorts issues by coverage desc, then label asc; candidates alpha by last name", () => {
    const positions = [
      pos("smith", "education"),                          // education: 1
      pos("smith", "abortion"), pos("barnes", "abortion"), // abortion: 2
    ];
    const { issues, totalOnRecord } = buildIssueComparison(cands, positions);
    expect(issues.map((i) => i.issueSlug)).toEqual(["abortion", "education"]); // coverage 2 before 1
    expect(issues[0].label).toBe("Abortion");
    // abortion onRecord alpha by last name: Barnes, Smith
    expect(issues[0].onRecord.map((r) => r.candidate.slug)).toEqual(["barnes", "smith"]);
    // Lee has no abortion position -> noRecord
    expect(issues[0].noRecord.map((c) => c.slug)).toEqual(["lee"]);
    expect(totalOnRecord).toBe(3);
  });

  it("multi-word label and duplicate position for one candidate/issue keeps the first", () => {
    const positions = [pos("smith", "gun-policy"), pos("smith", "gun-policy")];
    const { issues } = buildIssueComparison(cands, positions);
    expect(issues[0].label).toBe("Gun Policy");
    expect(issues[0].onRecord).toHaveLength(1);
  });

  it("no positions -> no issues, totalOnRecord 0", () => {
    expect(buildIssueComparison(cands, [])).toEqual({ issues: [], totalOnRecord: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/compare.test.ts`
Expected: FAIL — `buildIssueComparison` not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/compare.ts
export type CompareCandidate = { slug: string; name: string; party?: string; incumbent?: boolean };
export type ComparePosition = {
  candidateSlug: string;
  issueSlug: string;
  stance: string;
  summary: string;
  sources: { name: string; url: string }[];
};
export type IssueGroup = {
  issueSlug: string;
  label: string;
  onRecord: { candidate: CompareCandidate; position: ComparePosition }[];
  noRecord: CompareCandidate[];
};

// ponytail: last whitespace token as "last name" — approximation, fine for a
// neutral A–Z sort; revisit only if a real ordering complaint appears (suffixes).
const lastName = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();

// ponytail: slug -> Title Case; acronym-blind (edu-ok). Upgrade to a label map
// only if an issue slug reads wrong on the page.
const labelForSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export function buildIssueComparison(
  candidates: CompareCandidate[],
  positions: ComparePosition[],
): { issues: IssueGroup[]; totalOnRecord: number } {
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const byLast = (a: CompareCandidate, b: CompareCandidate) =>
    lastName(a.name).localeCompare(lastName(b.name));

  // issueSlug -> candidateSlug -> position (first wins on duplicates)
  const grouped = new Map<string, Map<string, ComparePosition>>();
  for (const p of positions) {
    if (!bySlug.has(p.candidateSlug)) continue; // stale slug not in this race
    let issue = grouped.get(p.issueSlug);
    if (!issue) grouped.set(p.issueSlug, (issue = new Map()));
    if (!issue.has(p.candidateSlug)) issue.set(p.candidateSlug, p);
  }

  const issues: IssueGroup[] = [...grouped.entries()].map(([issueSlug, byCand]) => {
    const onRecord = [...byCand.entries()]
      .map(([slug, position]) => ({ candidate: bySlug.get(slug)!, position }))
      .sort((a, b) => byLast(a.candidate, b.candidate));
    const onSet = new Set(byCand.keys());
    const noRecord = candidates.filter((c) => !onSet.has(c.slug)).sort(byLast);
    return { issueSlug, label: labelForSlug(issueSlug), onRecord, noRecord };
  });

  issues.sort(
    (a, b) => b.onRecord.length - a.onRecord.length || a.label.localeCompare(b.label),
  );

  const totalOnRecord = issues.reduce((n, i) => n + i.onRecord.length, 0);
  return { issues, totalOnRecord };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/compare.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare.ts src/lib/compare.test.ts
git commit -m "feat(compare): issue-by-issue grouping helper (MOO-411)"
```

---

### Task 2: Rebuild the compare page

**Files:**
- Modify (full rewrite of the render): `src/app/compare/[slug]/page.tsx`

**Interfaces:**
- Consumes: `buildIssueComparison`, `IssueGroup` from `@/lib/compare` (Task 1); `getRace` from `@/lib/data`; `SectionNav`/`NavSection` from `@/components/guide/section-nav`; `SourceList` from `@/components/guide/sources`; `PartyBadge` + `LastUpdated` from `@/components/guide/labels`; `raceIdToSlug`/`slugToRaceId` from `@/lib/site`.
- Produces: the rendered route (no exports consumed downstream).

Component signatures (verified, do not guess):
- `NavSection = { id: string; label: string; count?: number }`
- `<SourceList sources={{name,url}[]} title?="Sources" collapsible? />`
- `<PartyBadge party?={string} />`
- `<LastUpdated date={string} />`

- [ ] **Step 1: Write the failing test — a static-params + metadata sanity is already covered by build; assert the helper wiring instead**

No new page-level unit test (RSC + Convex fetch is covered by the Task 1 helper test and the live curl verify in Step 4). Skip to implementation. _(This is a deliberate no-test step: the page is thin glue over a tested helper + existing components; TDD value lives in Task 1.)_

- [ ] **Step 2: Replace the page body**

Rewrite `src/app/compare/[slug]/page.tsx` to:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LastUpdated, PartyBadge } from "@/components/guide/labels";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { buildIssueComparison } from "@/lib/compare";
import { getRace, listRaces } from "@/lib/data";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { raceIdToSlug, slugToRaceId } from "@/lib/site";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const races = await listRaces();
  return races.map((r) => ({ slug: raceIdToSlug(r.raceId) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) return {};
  return {
    title: `Compare ${data.race.office} candidates — Wisconsin 2026`,
    description: `Where the ${data.candidates.length} candidates for ${data.race.office} stand, issue by issue — every stance linked to its source.`,
    alternates: { canonical: `/compare/${slug}` },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data || data.candidates.length === 0) notFound();
  const { race, candidates, positions } = data;
  const { issues, totalOnRecord } = buildIssueComparison(candidates, positions);

  const navSections: NavSection[] = issues.map((i) => ({
    id: i.issueSlug,
    label: i.label,
    count: i.onRecord.length,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: race.office, path: `/races/${slug}` },
            { name: "Compare", path: `/compare/${slug}` },
          ]),
        ]}
      />

      {totalOnRecord > 0 && <SectionNav sections={navSections} />}

      <Link
        href={`/races/${slug}`}
        className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground underline-offset-2 hover:underline"
      >
        ← {race.office}
      </Link>
      <h1 className="font-display mt-2 text-3xl leading-tight">
        How do the {race.office} candidates compare?
      </h1>
      <p className="mt-2 max-w-2xl">
        The {candidates.length} candidates side by side, issue by issue. Every
        stance is a sourced summary — follow the source links to read it in
        context. This is not a ranking or endorsement.
      </p>

      {totalOnRecord === 0 ? (
        <div className="mt-6 border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
          <p className="font-display text-lg">
            No sourced positions on record yet for these candidates.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            When candidates publish positions we can source, they&apos;ll appear
            here issue by issue. In the meantime, see each candidate&apos;s page
            for background, finance, and coverage.
          </p>
          <Link
            href={`/races/${slug}`}
            className="mt-4 inline-block font-mono text-xs font-bold uppercase tracking-widest underline underline-offset-2"
          >
            ← Back to {race.office}
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {issues.map((issue) => (
            <section key={issue.issueSlug} id={issue.issueSlug} className="scroll-mt-16">
              <h2 className="font-display text-2xl">{issue.label}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {issue.onRecord.map(({ candidate, position }) => (
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
                      {candidate.incumbent && (
                        <span className="border border-border bg-secondary px-1 font-mono text-[10px] font-bold uppercase">
                          Inc.
                        </span>
                      )}
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
              {issue.noRecord.length > 0 && (
                <NoRecordLine names={issue.noRecord.map((c) => c.name)} />
              )}
            </section>
          ))}
        </div>
      )}

      <div className="mt-10">
        <LastUpdated date={race.dataAsOf} />
      </div>
    </main>
  );
}

function NoRecordLine({ names }: { names: string[] }) {
  const HEAD = 3;
  const head = names.slice(0, HEAD);
  const rest = names.slice(HEAD);
  return (
    <p className="mt-3 font-mono text-xs text-muted-foreground">
      No position on record: {head.join(", ")}
      {rest.length > 0 && (
        <>
          {", "}
          <span className="whitespace-nowrap">+{rest.length} more</span>
          {/* full list stays in the DOM for scanners/screen readers */}
          <span className="sr-only"> — {rest.join(", ")}</span>
        </>
      )}
    </p>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `race.dataAsOf` type differs, match the field name used on the candidate page's `<LastUpdated date={candidate.dataAsOf} />` — races expose the same `dataAsOf` string.)

- [ ] **Step 4: Verify locally (build + curl)**

Run: `npx next build` then serve, OR `npx next dev` and:
```bash
curl -s localhost:3000/compare/governor | grep -o "No position on record" | head -1   # gap label present
curl -s localhost:3000/compare/governor | grep -o "How do the" | head -1              # renders
```
Expected: governor page shows issue `<section>`s with sourced summaries and a "No position on record" line; a sparse race shows the empty-state panel. No horizontal body scroll on a 375px viewport (spot-check in browser).

- [ ] **Step 5: Run the full test suite (no regressions)**

Run: `npx vitest run`
Expected: prior 496 + 3 new pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/compare/[slug]/page.tsx
git commit -m "feat(compare): rebuild /compare issue-by-issue with sourced positions (MOO-411)"
```

---

## Self-Review

- **Spec coverage:** issue grouping + coverage sort (Task 1) ✓; pull from published positions not priorities (Task 2 uses `positions`) ✓; "No position on record" labeling (`NoRecordLine`) ✓; source-linked + non-partisan (SourceList + no scoring/party grouping) ✓; mobile-first (grid `sm:`/`xl:`, SectionNav, sr-only fold) ✓; empty-state panel ✓; reuse SectionNav/SourceList/PartyBadge/LastUpdated ✓; no Convex change ✓.
- **Placeholder scan:** none — all code shown. The one no-test step (Task 2 Step 1) is justified inline.
- **Type consistency:** `buildIssueComparison`, `IssueGroup`, `CompareCandidate`, `ComparePosition` names match between Task 1 and Task 2; `NavSection`, `SourceList`, `PartyBadge`, `LastUpdated` signatures verified against source.
```
