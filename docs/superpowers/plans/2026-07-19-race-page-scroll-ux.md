# Race-Page Scroll UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the race page from 5.8 to ≤3 mobile screens via a sticky jump nav, compact 2-up candidate tiles, a collapsed not-on-ballot fold, and a top-5 finance table.

**Architecture:** Frontend-only change to the race page (`/races/[slug]`). A new pure classifier `isOnBallot()` + section-id helper live in `src/lib/ballot-status.ts`; a new presentational `RaceSectionNav` renders sticky anchor chips; `CandidateCard` gains a `compact` variant; the race page composes them. Everything stays in the DOM (native `<details>` folds, no new JS behavior, no scroll-spy).

**Tech Stack:** Next.js App Router (RSC), Tailwind, Convex `Doc` types, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-19-race-page-scroll-ux-design.md`

## Global Constraints

- **Accuracy rule:** Withdrawn (Rodriguez) and Suspended (Hughes) candidates stay in the VISIBLE grid with badges — they are on the printed ballot per WEC's official contest list. Only "not on" / "did not file" statuses fold.
- `isOnBallot` returns `false` **only** when status contains "not on" or "did not file" (case-insensitive); `true` otherwise (undefined, Active, Withdrawn, Suspended → `true`). It deliberately mirrors `StatusBadge`'s label logic in `src/components/guide/labels.tsx:46-64`.
- `CandidateCard` default variant stays `"full"` — zero behavior change for existing call sites (home page, etc.).
- All content stays in the DOM (SEO + find-in-page). Native `<details>`, no IntersectionObserver, no tabs.
- Section anchor ids: `#democratic-primary`, `#republican-primary`, `#independent`, `#candidates` (non-partisan), `#money`, `#sources`. Anchored sections get `scroll-mt-16` so headings aren't hidden under the sticky bar.
- No horizontal scroll at 320px or 390px viewports; tiles use `min-w-0` so long names wrap inside.
- Existing design tokens only (`border-border`, `bg-card`, `shadow-[var(--shadow-brutal)]`, `press`, `font-display`, `font-mono`).
- Frontend-only: **eval gate NOT required** (no agent prompt/model change).
- Commits go straight to `main` (project convention). Deploy order: `npx convex deploy -y` before `npx vercel deploy --prod --yes` (retry vercel once if it errors).
- Acceptance: `/races/wi-gov-2026` at 390×844 ≤ **3 screens** of scroll (from 5.8); at 1280×800 ≤ 2.5 (from 3.3).
- One deliberate deviation from the spec: `RaceSectionNav` is spec'd as a "client component", but v1 has no interactivity (plain anchors, no scroll-spy), so it ships **without** `"use client"` — a server component. Add the directive only if scroll-spy arrives later.

---

### Task 1: `isOnBallot` + `partySectionId` helpers

**Files:**
- Create: `src/lib/ballot-status.ts`
- Test: `src/lib/ballot-status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isOnBallot(status?: string): boolean` and `partySectionId(party: string): string` — imported by Task 3 (nav) and Task 4 (page).

- [ ] **Step 1: Write the failing test**

Create `src/lib/ballot-status.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isOnBallot, partySectionId } from "./ballot-status";

describe("isOnBallot", () => {
  it("treats undefined and Active as on-ballot", () => {
    expect(isOnBallot(undefined)).toBe(true);
    expect(isOnBallot("Active")).toBe(true);
  });

  it("keeps Withdrawn and Suspended on-ballot (printed ballot per WEC)", () => {
    expect(isOnBallot("Withdrawn")).toBe(true);
    expect(isOnBallot("Suspended campaign")).toBe(true);
  });

  it("folds did-not-file and not-on-ballot statuses", () => {
    expect(
      isOnBallot("Did not file by June 1, 2026 deadline — not on primary ballot"),
    ).toBe(false);
    expect(isOnBallot("Not on ballot")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isOnBallot("NOT ON BALLOT")).toBe(false);
    expect(isOnBallot("DID NOT FILE")).toBe(false);
  });
});

describe("partySectionId", () => {
  it("appends -primary for partisan primaries", () => {
    expect(partySectionId("Democratic")).toBe("democratic-primary");
    expect(partySectionId("Republican")).toBe("republican-primary");
  });

  it("Independent gets no -primary suffix (general election only)", () => {
    expect(partySectionId("Independent")).toBe("independent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ballot-status.test.ts`
Expected: FAIL — cannot resolve `./ballot-status`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/ballot-status.ts`:

```ts
/**
 * Ballot-status classification for the race page.
 *
 * Mirrors StatusBadge's label logic in components/guide/labels.tsx: only
 * "not on" / "did not file" statuses mean off the printed ballot. Withdrawn
 * and Suspended candidates STAY on it per WEC's official contest list
 * (MOO-314 verification) — they must remain visible, not folded.
 */
export function isOnBallot(status?: string): boolean {
  if (!status) return true;
  const low = status.toLowerCase();
  return !low.includes("not on") && !low.includes("did not file");
}

/**
 * Anchor id for a party section on the race page. Shared by the section
 * headings (ids) and RaceSectionNav (hrefs) so they can't drift apart.
 * Independent has no primary — it links to the general-election section.
 */
export function partySectionId(party: string): string {
  const slug = party.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return party === "Independent" ? slug : `${slug}-primary`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ballot-status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ballot-status.ts src/lib/ballot-status.test.ts
git commit -m "feat: isOnBallot classifier + party section-id helper"
```

---

### Task 2: `CandidateCard` compact variant

**Files:**
- Modify: `src/components/guide/cards.tsx:44-72` (the `CandidateCard` function)

**Interfaces:**
- Consumes: existing `PartyBadge`, `StatusBadge` from `./labels`.
- Produces: `CandidateCard({ candidate, variant })` where `variant?: "full" | "compact"` defaults to `"full"`. Task 4 renders `<CandidateCard candidate={c} variant="compact" />`.

- [ ] **Step 1: Replace the `CandidateCard` function**

Replace the entire existing `CandidateCard` in `src/components/guide/cards.tsx` with:

```tsx
export function CandidateCard({
  candidate,
  variant = "full",
}: {
  candidate: Doc<"candidates">;
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    return (
      <Link
        href={`/candidates/${candidate.slug}`}
        className="press block min-w-0 border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
      >
        <h3 className="font-display text-sm leading-tight">{candidate.name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <PartyBadge party={candidate.party} />
          <StatusBadge status={candidate.status} />
        </div>
        {candidate.currentOccupation &&
          candidate.currentOccupation !== "Unknown" && (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {candidate.currentOccupation}
            </p>
          )}
      </Link>
    );
  }
  return (
    <Link
      href={`/candidates/${candidate.slug}`}
      className="press block border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base leading-tight">
          {candidate.name}
        </h3>
        {candidate.incumbent && (
          <span className="border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
            Incumbent
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <PartyBadge party={candidate.party} />
        <StatusBadge status={candidate.status} />
      </div>
      {candidate.currentOccupation &&
        candidate.currentOccupation !== "Unknown" && (
          <p className="mt-2 text-sm text-muted-foreground">
            {candidate.currentOccupation}
          </p>
        )}
    </Link>
  );
}
```

Notes: the `full` branch is byte-identical to today's markup. Compact drops the Incumbent chip per spec (name + party + status + one-line occupation only). `min-w-0` + `truncate` keep 2-up tiles from overflowing at 320px.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/cards.tsx
git commit -m "feat: CandidateCard compact variant (default full unchanged)"
```

---

### Task 3: `RaceSectionNav` sticky jump nav

**Files:**
- Create: `src/components/guide/race-section-nav.tsx`

**Interfaces:**
- Consumes: nothing (pure presentational; ids are computed by the page via `partySectionId`).
- Produces: `RaceSectionNav({ sections })` with exported type `RaceNavSection = { id: string; label: string; count?: number }`. Task 4 builds the `sections` array and renders `<RaceSectionNav sections={navSections} />`.

- [ ] **Step 1: Create the component**

Create `src/components/guide/race-section-nav.tsx` (no `"use client"` — see Global Constraints):

```tsx
export type RaceNavSection = { id: string; label: string; count?: number };

/**
 * Sticky in-page jump nav for the race page. Plain anchor chips, no
 * scroll-spy in v1. Target sections must carry scroll-mt-16 so anchored
 * headings land below this bar (it is ~48px tall; 64px margin is safe).
 */
export function RaceSectionNav({ sections }: { sections: RaceNavSection[] }) {
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Sections on this page"
      className="sticky top-0 z-40 -mx-4 mb-2 overflow-x-auto border-b-2 border-border bg-background px-4 py-2"
    >
      <ul className="flex w-max gap-2">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="press inline-block whitespace-nowrap border-2 border-border bg-card px-3 py-1 text-sm font-bold shadow-[var(--shadow-brutal)]"
            >
              {s.label}
              {s.count !== undefined ? ` (${s.count})` : ""}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Notes: `-mx-4` + `px-4` bleeds the bar to the viewport edge inside the page's `px-4` container so the chip row scrolls edge-to-edge on mobile. `w-max` keeps chips on one scrollable line.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/race-section-nav.tsx
git commit -m "feat: RaceSectionNav sticky anchor-chip jump nav"
```

---

### Task 4: Race page integration (nav + compact grids + not-on-ballot fold)

**Files:**
- Modify: `src/app/races/[slug]/page.tsx`

**Interfaces:**
- Consumes: `isOnBallot`, `partySectionId` from `@/lib/ballot-status` (Task 1); `CandidateCard` `variant="compact"` (Task 2); `RaceSectionNav`, `RaceNavSection` from `@/components/guide/race-section-nav` (Task 3).
- Produces: sections with ids `democratic-primary` / `republican-primary` / `independent` / `candidates` / `sources` (Task 5 adds `money`).

- [ ] **Step 1: Add imports**

At the top of `src/app/races/[slug]/page.tsx`, add to the existing imports:

```tsx
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  RaceSectionNav,
  type RaceNavSection,
} from "@/components/guide/race-section-nav";
import { isOnBallot, partySectionId } from "@/lib/ballot-status";
```

- [ ] **Step 2: Add the shared grid+fold renderer**

Add above `export default async function RacePage` (module scope, after imports):

```tsx
/** On-ballot candidates in a compact 2-up grid; the rest in a collapsed fold. */
function CandidateGrid({ list }: { list: Doc<"candidates">[] }) {
  const onBallot = list.filter((c) => isOnBallot(c.status));
  const offBallot = list.filter((c) => !isOnBallot(c.status));
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {onBallot.map((c) => (
          <CandidateCard key={c.slug} candidate={c} variant="compact" />
        ))}
      </div>
      {offBallot.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Not on the Aug 11 ballot ({offBallot.length})
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {offBallot.map((c) => (
              <CandidateCard key={c.slug} candidate={c} variant="compact" />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
```

- [ ] **Step 3: Build the nav sections and render the nav**

Inside `RacePage`, after the `nonPartisan` line (`page.tsx:46`), add:

```tsx
const byParty = (party: string) =>
  candidates.filter((c) => c.primaryParty === party);
const partyChipLabel = (party: string) =>
  party === "Democratic"
    ? "Democrats"
    : party === "Republican"
      ? "Republicans"
      : party;

const navSections: RaceNavSection[] = [
  ...parties.map((party) => ({
    id: partySectionId(party),
    label: partyChipLabel(party),
    count: byParty(party).filter((c) => isOnBallot(c.status)).length,
  })),
  ...(nonPartisan.length > 0
    ? [
        {
          id: "candidates",
          label: "Candidates",
          count: nonPartisan.filter((c) => isOnBallot(c.status)).length,
        },
      ]
    : []),
  ...(finance.length > 0 ? [{ id: "money", label: "The money" }] : []),
  { id: "sources", label: "Sources" },
];
```

Then render the nav as the first element inside `<main>`, directly above the `<JsonLd …/>` line:

```tsx
<RaceSectionNav sections={navSections} />
```

- [ ] **Step 4: Rewrite the party and non-partisan sections**

Replace the `{parties.map(…)}` block (`page.tsx:100-115`) with:

```tsx
{parties.map((party) => (
  <section key={party} id={partySectionId(party)} className="mt-8 scroll-mt-16">
    <h2 className="font-display text-2xl">
      {/* Independents don't run in Wisconsin's partisan primary — they
          go straight to the Nov 3 general (MOO-314 launch check). */}
      {party === "Independent" ? "Independent — November general election only" : `${party} primary`}
    </h2>
    <CandidateGrid list={byParty(party)} />
  </section>
))}
```

Replace the `{nonPartisan.length > 0 && (…)}` block (`page.tsx:117-126`) with:

```tsx
{nonPartisan.length > 0 && (
  <section id="candidates" className="mt-8 scroll-mt-16">
    <h2 className="font-display text-2xl">Candidates</h2>
    <CandidateGrid list={nonPartisan} />
  </section>
)}
```

- [ ] **Step 5: Anchor the sources section**

Replace the closing `<div className="mt-10 space-y-3">` block (`page.tsx:141-144`) with:

```tsx
<section id="sources" className="mt-10 scroll-mt-16 space-y-3">
  <SourceList sources={race.sources} />
  <LastUpdated date={race.dataAsOf} />
</section>
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean.

- [ ] **Step 7: Visual smoke check on dev**

Start `pnpm dev` (port 3001), open `http://localhost:3001/races/wi-gov-2026`, verify: nav chips render (`Democrats (7) · Republicans (2) · Independent (1) · The money · Sources`), 2-up compact tiles, Rodriguez + Hughes visible in the Democratic grid with badges, a collapsed "Not on the Aug 11 ballot (4)" fold containing Jacobson, Hulsey, Roper, Strnad.

- [ ] **Step 8: Commit**

```bash
git add src/app/races/[slug]/page.tsx
git commit -m "feat: race page jump nav, compact 2-up tiles, not-on-ballot fold"
```

---

### Task 5: Finance table top-5 + show-all, `#money` anchor

**Files:**
- Modify: `src/components/guide/finance.tsx:212-259` (the `RaceFinanceTable` function)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RaceFinanceTable` unchanged signature; section now has `id="money"` + `scroll-mt-16` (target of the Task 4 nav chip).

- [ ] **Step 1: Replace `RaceFinanceTable`**

Replace the entire existing `RaceFinanceTable` in `src/components/guide/finance.tsx` with:

```tsx
function FinanceRows({
  rows,
  nameBySlug,
  headerHidden,
}: {
  rows: Doc<"finance_totals">[];
  nameBySlug: Map<string, string>;
  headerHidden?: boolean;
}) {
  return (
    <div className="overflow-x-auto border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead className={headerHidden ? "sr-only" : undefined}>
          <tr className="border-b-2 border-border bg-secondary text-left">
            <th className="p-3 font-display text-sm">Candidate</th>
            <th className="p-3 font-mono text-xs font-bold uppercase">Raised</th>
            <th className="p-3 font-mono text-xs font-bold uppercase">Spent</th>
            <th className="p-3 font-mono text-xs font-bold uppercase">Cash on hand</th>
            <th className="p-3 font-mono text-xs font-bold uppercase">Through</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t._id} className="border-b border-dashed border-border">
              <td className="p-3 font-bold">
                {nameBySlug.get(t.candidateSlug) ?? t.candidateSlug}
              </td>
              <td className="p-3 font-mono">{fmt(t.receipts)}</td>
              <td className="p-3 font-mono">{fmt(t.disbursements)}</td>
              <td className="p-3 font-mono">{fmt(t.cashOnHand)}</td>
              <td className="p-3 font-mono text-xs">{t.coverageEndDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RaceFinanceTable({
  finance,
  candidates,
}: {
  finance: Doc<"finance_totals">[];
  candidates: Doc<"candidates">[];
}) {
  if (finance.length === 0) return null;
  const nameBySlug = new Map(candidates.map((c) => [c.slug, c.name]));
  const rows = [...finance].sort(
    (a, b) => (b.receipts ?? 0) - (a.receipts ?? 0),
  );
  const top = rows.slice(0, 5);
  const rest = rows.slice(5);
  return (
    <section id="money" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Who has raised the most money?</h2>
      <div className="mt-3">
        <FinanceRows rows={top} nameBySlug={nameBySlug} />
      </div>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Show all {rows.length} candidates
          </summary>
          {/* ponytail: second table inside <details> (a <details> can't live
              in <tbody>); columns may not align exactly with the top table. */}
          <div className="mt-2">
            <FinanceRows rows={rest} nameBySlug={nameBySlug} headerHidden />
          </div>
        </details>
      )}
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Federal data: FEC. State data: WI Ethics Commission Sunshine
        (non-commercial voter education use).
      </p>
    </section>
  );
}
```

Notes: when `rows.length ≤ 5`, `rest` is empty and the page renders exactly as today (one table, no fold). The hidden-header continuation table keeps column semantics for screen readers via `sr-only`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/finance.tsx
git commit -m "feat: finance table top-5 with show-all fold, #money anchor"
```

---

### Task 6: Full verification, deploy, live acceptance measurement

**Files:**
- Create: `.playwright-mcp/measure-race-page.js` (gitignored scratch script)

**Interfaces:**
- Consumes: everything above, deployed to prod.
- Produces: evidence for the Linear issue (screen counts, screenshots).

- [ ] **Step 1: Full local gate**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: **121 tests** pass (120 prior + the new ballot-status file counts as added tests — verify with the real run and record the actual number), tsc clean, build clean.

- [ ] **Step 2: Deploy**

```bash
npx convex deploy -y
npx vercel deploy --prod --yes
```

Convex first, then Vercel. If the first vercel attempt errors, retry once.

- [ ] **Step 3: Measure scroll depth on prod (Playwright MCP)**

Write `.playwright-mcp/measure-race-page.js` in the Playwright-style `async (page) => {}` form (no `require()` in `browser_run_code_unsafe`):

```js
async (page) => {
  const results = {};
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("https://badgerbrief.vercel.app/races/wi-gov-2026", {
      waitUntil: "networkidle",
    });
    const height = await page.evaluate(() => document.body.scrollHeight);
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    results[`${w}x${h}`] = { screens: +(height / h).toFixed(2), hasHScroll };
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("https://badgerbrief.vercel.app/races/wi-gov-2026", {
    waitUntil: "networkidle",
  });
  results["320-hscroll"] = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  return results;
};
```

Expected: `390x844` screens ≤ **3.0**, `1280x800` ≤ **2.5**, all `hasHScroll` false.

- [ ] **Step 4: Verify chip landings and fold contents on prod**

Still via Playwright at 390×844: click each nav chip; after each click assert the target section's `<h2>` is fully inside the viewport (below the sticky bar, y ≥ nav height). Open the Democratic fold and confirm Jacobson, Hulsey, Roper, Strnad are inside it; confirm Rodriguez (Withdrawn) and Hughes (Suspended) are in the visible grid. Screenshot 390×844 top-of-page for evidence.

- [ ] **Step 5: Spot-check an unaffected small race**

Load a race with ≤5 candidates and ≤5 finance rows (e.g. a congressional race) at 390×844: no fold, no "Show all", nav still renders with correct chips, nothing broken.

- [ ] **Step 6: Record evidence**

Attach to the Linear issue: before/after screen counts (5.8 → measured), h-scroll results, screenshots, test count. Mark the issue Done with the evidence comment (linear-build convention).
