# Feature A — "Make sense of the guide" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help a first-time / undecided voter understand what the guide shows, via tap-to-expand inline explainers plus an opt-in guided path — additive presentation only, no backend change.

**Architecture:** Two independent pieces. **Piece 1 (Tasks 1–4):** one `WhatThisMeans` component rendering a native `<details>` from a static neutral content map, placed next to the confusing concepts. **Piece 2 (Tasks 5–9):** a `/start` route + a `GuidedRail` client component mounted once in the root layout that renders only when `?guide=<step>` is in the URL. All state lives in the URL — guest-friendly, SSR-safe, no auth, no persistence.

**Tech Stack:** Next.js (App Router, non-stock — read `node_modules/next/dist/docs/` before App Router code), React, TypeScript, Tailwind (neo-brutalist tokens), Vitest (`vitest.config.mts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-26-feature-a-make-sense-of-the-guide-design.md`

## Global Constraints

- **No new dependencies.** No tooltip library — reuse the site's `<details>`/`<summary>` idiom.
- **No backend/schema/data/auth change.** Presentation only.
- **English v1.** `/es` deferred. The guided-path entry and `/start` are EN-only; gate any home-hero entry to `lang !== "es"`.
- **No endorsement/scoring/ranking.** Explainer copy is definitional only; finance copy states "money is not an endorsement."
- **Neo-brutalist idiom:** `border-2 border-border bg-card p-... shadow-[var(--shadow-brutal)]`; `font-mono text-xs font-bold uppercase tracking-widest` for quiet affordances; `press` on pressable controls.
- **`useSearchParams()` requires a `<Suspense>` boundary** to stay statically prerenderable under `revalidate` (session gotcha).
- **Commits:** conventional commits, no attribution (per repo git config).
- **After deploy, live-verify client-interactive pages in a browser** (`npx vercel --prod` does not deploy Convex — N/A here since no Convex change, but still build + live-verify).

## File Structure

- `src/lib/explainers.ts` — `ExplainerTopic` union + neutral content map (single source of copy). *One responsibility: explainer content.*
- `src/lib/explainers.test.ts` — content-map integrity.
- `src/components/guide/what-this-means.tsx` — dumb `<details>` renderer over the map.
- `src/lib/guide-step.ts` — pure `parseGuideStep(param)` + step model (labels, destinations). *One responsibility: the guided-path state machine, unit-testable without React.*
- `src/lib/guide-step.test.ts` — param parsing.
- `src/components/guide/guided-rail.tsx` — the rail UI; reads `?guide`, renders step chrome, carries the param.
- `src/app/start/page.tsx` — the `/start` intro route.
- Modify: `src/app/layout.tsx`, `src/app/candidates/[slug]/page.tsx`, `src/app/compare/[slug]/page.tsx`, `src/components/match/*`, `src/components/guide/home-guide.tsx`, `src/lib/i18n/home-en.ts`.

---

## PIECE 1 — Inline explainers

### Task 1: Explainer content map + integrity test

**Files:**
- Create: `src/lib/explainers.ts`
- Test: `src/lib/explainers.test.ts`

**Interfaces:**
- Produces: `type ExplainerTopic = "stance-labels" | "campaign-finance" | "voting-record" | "sourced-position-vs-claim"`; `EXPLAINERS: Record<ExplainerTopic, { summary: string; body: string; learnMore?: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/explainers.test.ts
import { describe, it, expect } from "vitest";
import { EXPLAINERS, type ExplainerTopic } from "./explainers";

const TOPICS: ExplainerTopic[] = [
  "stance-labels",
  "campaign-finance",
  "voting-record",
  "sourced-position-vs-claim",
];

describe("EXPLAINERS", () => {
  it("has a non-empty summary and body for every topic", () => {
    for (const t of TOPICS) {
      expect(EXPLAINERS[t].summary.length).toBeGreaterThan(0);
      expect(EXPLAINERS[t].body.length).toBeGreaterThan(0);
    }
  });

  it("only links to same-origin paths in learnMore", () => {
    for (const t of TOPICS) {
      const lm = EXPLAINERS[t].learnMore;
      if (lm) expect(lm.startsWith("/")).toBe(true);
    }
  });

  it("states money is not an endorsement in the finance explainer", () => {
    expect(EXPLAINERS["campaign-finance"].body.toLowerCase()).toContain("not an endorsement");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/explainers.test.ts`
Expected: FAIL — cannot import `./explainers`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/explainers.ts
export type ExplainerTopic =
  | "stance-labels"
  | "campaign-finance"
  | "voting-record"
  | "sourced-position-vs-claim";

export const EXPLAINERS: Record<
  ExplainerTopic,
  { summary: string; body: string; learnMore?: string }
> = {
  "stance-labels": {
    summary: "What do these stance labels mean?",
    body:
      "Each label describes how a candidate has spoken about an issue, drawn from a sourced statement — not our opinion. Support and oppose mean they've clearly taken that side. Mixed means their statements point both ways. Evolving means their stated position has changed over time. Unclear means we couldn't find a clear public statement. Every label links to the source it came from.",
    learnMore: "/methodology",
  },
  "campaign-finance": {
    summary: "How do I read these campaign-finance numbers?",
    body:
      "Individual contributions come from people; PAC (political action committee) money comes from organized groups. Cash-on-hand is what a campaign has left to spend. Money shows who is backing a campaign — it is not an endorsement by us, and more money does not mean a candidate is better.",
    learnMore: "/methodology",
  },
  "voting-record": {
    summary: "What is a voting record showing me?",
    body:
      "A roll-call vote is a recorded yes/no vote in the legislature; 'aye' means yes and 'no' means no. A 'deciding vote' is one that changed the outcome. These are the candidate's actual recorded votes, linked to the official record.",
    learnMore: "/methodology",
  },
  "sourced-position-vs-claim": {
    summary: "Sourced position vs. campaign claim — what's the difference?",
    body:
      "A sourced position is something we tied to a specific public statement, with a link. A campaign claim is what a candidate's own site says about their priorities. We keep them separate so you can see the difference between a documented stance and a self-description.",
    learnMore: "/methodology",
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/explainers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/explainers.ts src/lib/explainers.test.ts
git commit -m "feat(guide): neutral explainer content map + integrity test (Feature A)"
```

---

### Task 2: `WhatThisMeans` component

**Files:**
- Create: `src/components/guide/what-this-means.tsx`

**Interfaces:**
- Consumes: `EXPLAINERS`, `ExplainerTopic` from `src/lib/explainers.ts`.
- Produces: `WhatThisMeans({ topic, className }: { topic: ExplainerTopic; className?: string })` — a server-renderable `<details>`.

- [ ] **Step 1: Write the implementation** (presentational; covered by placement + the map test — no separate unit test per repo norm for a dumb `<details>`)

```tsx
// src/components/guide/what-this-means.tsx
import Link from "next/link";
import { EXPLAINERS, type ExplainerTopic } from "@/lib/explainers";

export function WhatThisMeans({
  topic,
  className,
}: {
  topic: ExplainerTopic;
  className?: string;
}) {
  const e = EXPLAINERS[topic];
  return (
    <details className={`mt-2 border-2 border-border bg-muted/40 px-3 py-2 ${className ?? ""}`}>
      <summary className="cursor-pointer select-none font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        ⓘ {e.summary}
      </summary>
      <p className="mt-2 max-w-[60ch] text-sm">{e.body}</p>
      {e.learnMore && (
        <Link
          href={e.learnMore}
          className="mt-2 inline-block text-sm font-bold underline decoration-2"
        >
          How we do this →
        </Link>
      )}
    </details>
  );
}
```

- [ ] **Step 2: Verify it type-checks and builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/what-this-means.tsx
git commit -m "feat(guide): WhatThisMeans tap-to-expand explainer component (Feature A)"
```

---

### Task 3: Place explainers on the candidate page

**Files:**
- Modify: `src/app/candidates/[slug]/page.tsx`

**Interfaces:**
- Consumes: `WhatThisMeans` from Task 2.

Insertion points (anchors verified in current file):
- `#positions` section — after the `<h2>` "Where does {name} stand…", before the positions grid: `stance-labels` and `sourced-position-vs-claim`. Guarded by the existing positions guard.
- Votes — immediately before `<VotingRecord … />` (inside its `{votingRecordSummary && …}` guard): `voting-record`.
- Finance — immediately before `<FinanceDetail … />` in the main column: `campaign-finance` (guard with `finance.length > 0`).

- [ ] **Step 1: Add the import**

```tsx
import { WhatThisMeans } from "@/components/guide/what-this-means";
```

- [ ] **Step 2: Positions explainers** — inside the `#positions` `<section>`, right after its `<h2>…</h2>`:

```tsx
            <WhatThisMeans topic="stance-labels" />
            <WhatThisMeans topic="sourced-position-vs-claim" />
```

- [ ] **Step 3: Votes explainer** — change the votes guard block to include the explainer:

```tsx
        {votingRecordSummary && (
          <>
            <WhatThisMeans topic="voting-record" className="mt-6" />
            <VotingRecord
              summary={votingRecordSummary}
              candidateSlug={candidate.slug}
              candidateName={candidate.name}
            />
          </>
        )}
```

- [ ] **Step 4: Finance explainer** — immediately before `<FinanceDetail`:

```tsx
          {finance.length > 0 && <WhatThisMeans topic="campaign-finance" />}
          <FinanceDetail
```

- [ ] **Step 5: Verify build + a real candidate renders**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; the candidate route compiles.

- [ ] **Step 6: Commit**

```bash
git add "src/app/candidates/[slug]/page.tsx"
git commit -m "feat(guide): inline explainers on candidate positions/finance/votes (Feature A)"
```

---

### Task 4: Place explainers on compare + `/match`

**Files:**
- Modify: `src/app/compare/[slug]/page.tsx`
- Modify: `src/components/match/*` (the results component that renders the issue/candidate cards)

**Interfaces:**
- Consumes: `WhatThisMeans` from Task 2.

- [ ] **Step 1: Compare page** — import `WhatThisMeans`, and place near the top of the issue-comparison area:

```tsx
<WhatThisMeans topic="stance-labels" />
<WhatThisMeans topic="sourced-position-vs-claim" />
```

(Place inside the main content wrapper, before the issue rows. Read the file first to find the exact issue-rows container.)

- [ ] **Step 2: `/match` results** — locate the results component under `src/components/match/` that renders candidate stance cards (grep for `stance` / the results render). Add near the results header:

```tsx
<WhatThisMeans topic="stance-labels" />
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/compare/[slug]/page.tsx" src/components/match
git commit -m "feat(guide): inline stance explainers on compare + match (Feature A)"
```

---

## PIECE 2 — Guided path

### Task 5: Guided-path step model + parser

**Files:**
- Create: `src/lib/guide-step.ts`
- Test: `src/lib/guide-step.test.ts`

**Interfaces:**
- Produces:
  - `type GuideStep = 1 | 2 | 3 | "done"`
  - `parseGuideStep(raw: string | null): GuideStep | null` — returns `null` for absent/invalid.
  - `GUIDE_STEPS: { step: GuideStep; label: string; href: string }[]` — the 3 ordered steps (destinations carry `?guide=<n>`), plus a `done` entry.
  - `nextHref(step: GuideStep): string | null`, `prevHref(step: GuideStep): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/guide-step.test.ts
import { describe, it, expect } from "vitest";
import { parseGuideStep, nextHref, prevHref, GUIDE_STEPS } from "./guide-step";

describe("parseGuideStep", () => {
  it("parses valid steps", () => {
    expect(parseGuideStep("1")).toBe(1);
    expect(parseGuideStep("2")).toBe(2);
    expect(parseGuideStep("3")).toBe(3);
    expect(parseGuideStep("done")).toBe("done");
  });
  it("returns null for absent or invalid", () => {
    expect(parseGuideStep(null)).toBeNull();
    expect(parseGuideStep("")).toBeNull();
    expect(parseGuideStep("9")).toBeNull();
    expect(parseGuideStep("abc")).toBeNull();
  });
});

describe("navigation", () => {
  it("advances 1 -> 2 -> 3 -> done", () => {
    expect(nextHref(1)).toBe("/match?guide=2");
    expect(nextHref(2)).toBe("/vote?guide=3");
    expect(nextHref(3)).toBe("/start?guide=done");
    expect(nextHref("done")).toBeNull();
  });
  it("goes back, and step 1 has no back", () => {
    expect(prevHref(1)).toBeNull();
    expect(prevHref(2)).toBe("/match?guide=1");
  });
  it("labels the three numbered steps", () => {
    expect(GUIDE_STEPS.filter((s) => s.step !== "done")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/guide-step.test.ts`
Expected: FAIL — cannot import `./guide-step`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/guide-step.ts
export type GuideStep = 1 | 2 | 3 | "done";

export const GUIDE_STEPS: { step: GuideStep; label: string; href: string }[] = [
  { step: 1, label: "Pick what matters to you", href: "/match?guide=1" },
  { step: 2, label: "Read a candidate", href: "/match?guide=2" },
  { step: 3, label: "Make your plan to vote", href: "/vote?guide=3" },
  { step: "done", label: "You're set", href: "/start?guide=done" },
];

export function parseGuideStep(raw: string | null): GuideStep | null {
  if (raw === "done") return "done";
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  if (raw === "3") return 3;
  return null;
}

function indexOf(step: GuideStep): number {
  return GUIDE_STEPS.findIndex((s) => s.step === step);
}

export function nextHref(step: GuideStep): string | null {
  const i = indexOf(step);
  return i >= 0 && i < GUIDE_STEPS.length - 1 ? GUIDE_STEPS[i + 1].href : null;
}

export function prevHref(step: GuideStep): string | null {
  const i = indexOf(step);
  return i > 0 ? GUIDE_STEPS[i - 1].href : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/guide-step.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guide-step.ts src/lib/guide-step.test.ts
git commit -m "feat(guide): guided-path step model + parser (Feature A)"
```

---

### Task 6: `GuidedRail` component

**Files:**
- Create: `src/components/guide/guided-rail.tsx`

**Interfaces:**
- Consumes: `parseGuideStep`, `nextHref`, `prevHref`, `GUIDE_STEPS` from Task 5.
- Produces: `GuidedRail` (default-safe: renders `null` when no valid `guide` param). Must be rendered inside a `<Suspense>` by its parent (Task 7) because it calls `useSearchParams()`.

- [ ] **Step 1: Write the implementation**

```tsx
// src/components/guide/guided-rail.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  parseGuideStep,
  nextHref,
  prevHref,
  GUIDE_STEPS,
  type GuideStep,
} from "@/lib/guide-step";

function stepNumber(step: GuideStep): string {
  return step === "done" ? "Done" : `Step ${step} of 3`;
}

export function GuidedRail() {
  const params = useSearchParams();
  const step = parseGuideStep(params.get("guide"));
  if (step === null) return null;

  const label = GUIDE_STEPS.find((s) => s.step === step)?.label ?? "";
  const prev = prevHref(step);
  const next = nextHref(step);

  return (
    <div className="border-b-2 border-border bg-secondary">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <span className="font-mono text-xs font-bold uppercase tracking-widest">
          {stepNumber(step)} · {label}
        </span>
        <div className="flex items-center gap-2">
          {prev && (
            <Link
              href={prev}
              className="border-2 border-border bg-card px-3 py-1 text-xs font-bold shadow-[var(--shadow-brutal)] press"
            >
              ← Back
            </Link>
          )}
          {next && (
            <Link
              href={next}
              className="border-2 border-border bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
            >
              {step === 3 ? "Finish" : "Next →"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/guide/guided-rail.tsx
git commit -m "feat(guide): GuidedRail param-driven step rail (Feature A)"
```

---

### Task 7: Mount `GuidedRail` in the root layout

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `GuidedRail` (Task 6). Must be wrapped in `<Suspense>` (uses `useSearchParams`).

- [ ] **Step 1: Add imports** at the top of `src/app/layout.tsx`:

```tsx
import { Suspense } from "react";
import { GuidedRail } from "@/components/guide/guided-rail";
```

- [ ] **Step 2: Mount it** — inside `<Providers>`, right after `<SiteHeader />` and before `<div className="flex-1">`:

```tsx
          <SiteHeader />
          <Suspense fallback={null}>
            <GuidedRail />
          </Suspense>
          <div className="flex-1">{children}</div>
```

- [ ] **Step 3: Verify build + static prerender** (this is the Suspense gotcha checkpoint)

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds with no "useSearchParams should be wrapped in a suspense boundary" error.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(guide): mount GuidedRail in root layout under Suspense (Feature A)"
```

---

### Task 8: `/start` route

**Files:**
- Create: `src/app/start/page.tsx`

**Interfaces:**
- Consumes: `GUIDE_STEPS` (Task 5) for the 3-step framing copy.

- [ ] **Step 1: Write the page** (server component, static, indexable; mirror the neo-brutalist idiom and SEO shape of other new routes — read a sibling like `src/app/methodology/page.tsx` first for the metadata/JSON-LD pattern):

```tsx
// src/app/start/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { GUIDE_STEPS } from "@/lib/guide-step";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Start here — new to the guide",
  description:
    "New to voting or to BadgerBrief? A simple 3-step path: pick what matters to you, read the candidates on your ballot, and make your plan to vote.",
  alternates: { canonical: "/start" },
};

export default function StartPage() {
  const steps = GUIDE_STEPS.filter((s) => s.step !== "done");
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)] sm:p-10">
        <h1 className="font-display text-4xl leading-none sm:text-5xl">New here? Start here.</h1>
        <p className="mt-4 max-w-2xl text-lg">
          BadgerBrief is a nonpartisan guide to the 2026 Wisconsin elections. We don&apos;t
          tell you who to vote for — we show you where the candidates on your ballot stand,
          from sourced statements. Here&apos;s a simple path.
        </p>
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li
              key={String(s.step)}
              className="border-2 border-border bg-secondary p-3 text-sm font-medium"
            >
              <span className="font-mono text-xs font-bold uppercase tracking-widest">
                Step {i + 1}
              </span>
              <span className="ml-2">{s.label}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/match?guide=1"
          className="mt-6 inline-block border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
        >
          Start step 1 →
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: `/start` route compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/start/page.tsx
git commit -m "feat(guide): /start guided-path intro route (Feature A)"
```

---

### Task 9: Home-hero "Start here" entry

**Files:**
- Modify: `src/lib/i18n/home-en.ts` (add optional `startHereCta` key)
- Modify: `src/components/guide/home-guide.tsx` (render the CTA, EN-only)

**Interfaces:**
- Consumes: the home `dict`.

- [ ] **Step 1: Add the dict key** — in `src/lib/i18n/home-en.ts`, add to the type (as optional so the ES dict isn't forced) and to `homeEn`:

```ts
  // in the HomeDict type
  startHereCta?: string;
```

```ts
  // in homeEn
  startHereCta: "New here? Start here →",
```

- [ ] **Step 2: Render the CTA** — in `src/components/guide/home-guide.tsx`, inside the hero CTA `<div className="mt-6 flex flex-wrap gap-3">`, add (EN-only so it doesn't dangle on `/es`):

```tsx
          {lang !== "es" && dict.startHereCta && (
            <Link
              href="/start"
              className="border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)] press"
            >
              {dict.startHereCta}
            </Link>
          )}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds; ES home page still builds (key optional, CTA gated).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/home-en.ts src/components/guide/home-guide.tsx
git commit -m "feat(guide): 'Start here' home-hero entry into guided path (Feature A)"
```

---

## Final verification (before claiming done)

- [ ] `npx vitest run` — all tests green (explainers + guide-step + existing suite).
- [ ] `npx tsc --noEmit && npm run build` — clean, no Suspense/prerender errors.
- [ ] Deploy preview/prod, then **live-verify in a browser**:
  - Home shows "New here? Start here →" → `/start` → "Start step 1 →" → `/match?guide=1` shows the rail "Step 1 of 3 · Pick what matters to you".
  - Rail Next: `/match?guide=1` → `/vote?guide=3` path works; Back works; step 1 has no Back.
  - A page loaded **without** `?guide=` shows **no** rail.
  - `?guide=9` / `?guide=abc` → no rail (not a broken bar).
  - Candidate page: "ⓘ What do these stance labels mean?" etc. expand on tap under positions, finance, and votes; each only appears when its section is present.
  - Compare + `/match` show the stance explainer.
  - No body horizontal scroll at 375px on `/start`, candidate, compare, `/match`.

## Self-Review notes

- **Spec coverage:** Piece 1 topics (stance-labels, campaign-finance, voting-record, sourced-position-vs-claim) → Tasks 1/3/4. Guided path (`/start`, `GuidedRail`, steps, entry) → Tasks 5–9. Suspense gotcha → Task 7 Step 3. Invalid-param edge → Task 5 test + Task 6 guard. Missing-map-entry edge → Task 1 test.
- **Step-2 "read a candidate" param persistence:** v1 keeps the rail alive via the URL param and rail-driven Back/Next between the fixed step destinations. Preserving `?guide` when a voter clicks an arbitrary candidate link from `/match` is **deferred** — it would mean threading the param through match result links; call it if live-verify shows the drop is jarring. `// ponytail:` note this in `guided-rail.tsx`.
- **Type consistency:** `GuideStep`, `ExplainerTopic`, `parseGuideStep`, `nextHref`/`prevHref` names are used identically across tasks.
