# MOO-305 OpenUI Component Library + Brief Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An OpenUI `defineComponent` registry of RetroUI-styled components that take entity IDs only and resolve published Convex data at render, plus a Clerk-gated `/brief` page that renders stored OpenUI Lang source with streaming skeletons and a print stylesheet.

**Architecture:** `src/lib/brief/library.tsx` defines the registry (`@openuidev/react-lang`); renderers live in `src/components/brief/` as client components calling `useQuery(api.public.*)` — `undefined` = skeleton, `null` = safe fallback. `/brief` page shell is a server component; a client `<BriefLoader />` loads the saved brief (or fixture) and hands it to `<BriefRenderer />` (OpenUI `<Renderer />`). Parser-level tests use `createParser` from the same package — no DOM needed.

**Tech Stack:** Next.js App Router, Convex (`convex/react` `useQuery`), Clerk v7 middleware, `@openuidev/react-lang@^0.2.8`, zod 4, vitest, Tailwind v4 (RetroUI brutal style).

## Global Constraints

- **pnpm, never npm** (npm crashes on the .pnpm layout). Local dev runs on **:3001**.
- Package manager install: `pnpm add @openuidev/react-lang` — do NOT add any other new dependency.
- All component data reads go through `api.public.*` (published tables only). Components never mutate.
- Only `AssistantNote` accepts free text. Every other component prop is an ID or enum.
- Convex dev deployment: `greedy-armadillo-714`. Do not deploy prod in this plan.
- Tests: `npx vitest run` — 12 currently pass; they must all still pass at every commit.
- Commit messages end with `(MOO-305)`.
- TS gotcha: annotate return types on same-file `ctx.runQuery` calls (not expected here, but if you add one).
- Verified API facts (from `@openuidev/react-lang@0.2.8` type declarations — do not re-derive):
  - `defineComponent({ name, description, props: z.object(...), component: ({ props, renderNode }) => ReactNode })`
  - `createLibrary({ root: "<ComponentName>", components: [...] })` → `Library` with `.prompt(options?)` and `.toJSONSchema()`
  - `createParser(library.toJSONSchema())` → `parser.parse(source)` → `ParseResult` with `root`, `meta.errors`, `meta.unresolved`, `meta.incomplete`
  - `<Renderer library={...} response={string|null} isStreaming={bool} onError={(errors: OpenUIError[]) => void} />`
  - Positional args in OpenUI Lang map to Zod object key order — put required props first.
  - If `z.array(z.any())` children don't render via `renderNode`, consult https://www.openui.com/docs/openui-lang/defining-components for the `.ref` composition pattern (`z.array(Component.ref)`).

---

### Task 1: Registry core — layout/static components + parser tests

**Files:**
- Create: `src/components/brief/chrome.tsx`
- Create: `src/lib/brief/library.tsx`
- Test: `src/lib/brief/library.test.ts`
- Modify: `package.json` (dependency add via pnpm)

**Interfaces:**
- Consumes: `SourceTrustLabel` from `@/components/guide/labels` (existing: `{ kind: string }`).
- Produces: `briefLibrary` (OpenUI `Library`) exported from `src/lib/brief/library.tsx`; `BriefSkeleton({ lines?: number })`, `NotFoundCard({ entity: string })` exported from `src/components/brief/chrome.tsx`. Later tasks append components to the `components` array in `createLibrary`.

- [ ] **Step 1: Install the dependency**

```bash
pnpm add @openuidev/react-lang
```

Expected: lockfile updated, no peer warnings for react 19 / zod 4.

- [ ] **Step 2: Write the failing tests**

`src/lib/brief/library.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createParser } from "@openuidev/react-lang";
import { briefLibrary } from "./library";

const parse = (source: string) =>
  createParser(briefLibrary.toJSONSchema()).parse(source);

describe("brief library parser", () => {
  it("parses a valid composition with zero errors", () => {
    const result = parse(
      [
        `root = Stack([note, label])`,
        `note = AssistantNote("Here is your guide.")`,
        `label = SourceTrustLabel("official")`,
      ].join("\n"),
    );
    expect(result.root).not.toBeNull();
    expect(result.meta.errors).toHaveLength(0);
  });

  it("rejects an off-registry component", () => {
    const result = parse(
      [`root = Stack([bad])`, `bad = TotallyMadeUpChart("x")`].join("\n"),
    );
    expect(result.meta.errors.length).toBeGreaterThan(0);
  });

  it("treats a truncated stream as incomplete with unresolved refs (skeleton case)", () => {
    const result = parse(
      `root = Stack([note, missing])\nnote = AssistantNote("hi")`,
    );
    expect(result.root).not.toBeNull();
    expect(result.meta.unresolved).toContain("missing");
  });

  it("prompt() names every registry component", () => {
    const prompt = briefLibrary.prompt();
    for (const name of ["Stack", "Grid", "AssistantNote", "SourceTrustLabel"]) {
      expect(prompt).toContain(name);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/brief/library.test.ts`
Expected: FAIL — cannot resolve `./library`.

- [ ] **Step 4: Write chrome components**

`src/components/brief/chrome.tsx`:

```tsx
"use client";

/** Shared chrome for brief components: loading skeleton + safe fallback. */

export function BriefSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="animate-pulse border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
      aria-busy="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="mt-2 h-4 w-full bg-muted first:mt-0" />
      ))}
    </div>
  );
}

/** Rendered when an entity ID resolves to nothing — never crash, never invent. */
export function NotFoundCard({ entity }: { entity: string }) {
  return (
    <div className="border-2 border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest">
        Not available
      </p>
      <p className="mt-1">
        We couldn&apos;t find published data for {entity}. It may have been
        removed or renamed.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Write the registry core**

`src/lib/brief/library.tsx`:

```tsx
"use client";

import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod";

/**
 * MOO-305 registry. Safety contract: props are entity IDs and enums only —
 * AssistantNote is the single free-text exception. Data components resolve
 * published Convex records at render time; the LLM never writes facts.
 */

export const Stack = defineComponent({
  name: "Stack",
  description: "Vertical layout container. Children render top to bottom.",
  props: z.object({
    children: z.array(z.any()).describe("child components in order"),
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-col gap-6">
      {(props.children as unknown[]).map((child, i) => (
        <div key={i}>{renderNode(child)}</div>
      ))}
    </div>
  ),
});

export const Grid = defineComponent({
  name: "Grid",
  description: "Two-column grid on wide screens, single column on mobile.",
  props: z.object({
    children: z.array(z.any()).describe("child components"),
  }),
  component: ({ props, renderNode }) => (
    <div className="grid gap-6 md:grid-cols-2">
      {(props.children as unknown[]).map((child, i) => (
        <div key={i}>{renderNode(child)}</div>
      ))}
    </div>
  ),
});

export const AssistantNote = defineComponent({
  name: "AssistantNote",
  description:
    "The ONLY free-text component. Short assistant commentary (section intro, why this matters). Visually distinct from sourced data.",
  props: z.object({ text: z.string().describe("1-3 sentences of plain text") }),
  component: ({ props }) => (
    <aside className="border-2 border-dashed border-border bg-secondary/40 p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Assistant note
      </p>
      <p className="mt-1 text-sm">{props.text}</p>
    </aside>
  ),
});

export const SourceTrustLabel = defineComponent({
  name: "SourceTrustLabel",
  description:
    "Small trust label naming the kind of source backing nearby content. Data components already carry their own source footers — use this only for standalone labeling.",
  props: z.object({
    kind: z.string().describe("source kind, e.g. \"official\", \"FEC\", \"news\""),
  }),
  component: ({ props }) => <GuideSourceTrustLabel kind={props.kind} />,
});

export const briefLibrary = createLibrary({
  root: "Stack",
  components: [Stack, Grid, AssistantNote, SourceTrustLabel],
  // Tasks 2-4 append: BriefHeader, DeadlineBanner, VotingChecklist, RaceCard,
  // CandidateCompareCard, IssueStanceCard, QuoteCard, FinanceSnapshot.
});
```

with `import { SourceTrustLabel as GuideSourceTrustLabel } from "@/components/guide/labels";` at the top. (The Linear acceptance list names `SourceTrustLabel` as a library component; the design additionally bakes source footers into every data component — both hold.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/brief/library.test.ts`
Expected: 4 PASS. If `children: z.array(z.any())` breaks parsing or rendering, switch to the documented `.ref` union pattern (see Global Constraints) and re-run.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: 16 passing (12 existing + 4 new).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/brief src/components/brief
git commit -m "feat: OpenUI brief registry core — layout primitives, parser tests (MOO-305)"
```

---

### Task 2: Voting components — BriefHeader, DeadlineBanner, VotingChecklist

**Files:**
- Create: `src/components/brief/voting.tsx`
- Modify: `src/lib/brief/library.tsx` (register components)
- Test: `src/lib/brief/library.test.ts` (extend prompt test)

**Interfaces:**
- Consumes: `api.public.getElection` (no args → election doc with `primaryDate: string` e.g. "2026-08-11"), `api.public.getVotingInfo` (no args → `voting_info` doc: `primaryDate`, `pollsOpen?`, `pollsClose?`, `voterRegistration?`, `absenteeRequestDeadline?`, `absenteeReturnDeadline?`, `earlyVoting?` — the deadline fields are `Record<string, string>` maps — plus `officialVoterInfoUrl: string`), `BriefSkeleton`/`NotFoundCard` from Task 1.
- Produces: `BriefHeaderView`, `DeadlineBannerView`, `VotingChecklistView` React components; registry entries `BriefHeader` (no props), `DeadlineBanner({ kind })`, `VotingChecklist` (no props). `DeadlineKind` = `"registration" | "absentee_request" | "absentee_return" | "early_voting"`.

- [ ] **Step 1: Extend the prompt test (failing first)**

In `src/lib/brief/library.test.ts`, extend the component-name list:

```ts
    for (const name of [
      "Stack",
      "Grid",
      "BriefHeader",
      "AssistantNote",
      "DeadlineBanner",
      "VotingChecklist",
    ]) {
      expect(prompt).toContain(name);
    }
```

Run: `npx vitest run src/lib/brief/library.test.ts` — Expected: FAIL on missing names (unless BriefHeader landed in Task 1; then only the two new names fail).

- [ ] **Step 2: Write the components**

`src/components/brief/voting.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BriefSkeleton, NotFoundCard } from "./chrome";

export type DeadlineKind =
  | "registration"
  | "absentee_request"
  | "absentee_return"
  | "early_voting";

const KIND_LABEL: Record<DeadlineKind, string> = {
  registration: "Voter registration",
  absentee_request: "Absentee ballot request",
  absentee_return: "Absentee ballot return",
  early_voting: "Early voting",
};

const rows = (map: unknown): [string, string][] =>
  map && typeof map === "object"
    ? Object.entries(map as Record<string, string>).map(([k, v]) => [
        k.replaceAll("_", " "),
        String(v),
      ])
    : [];

export function BriefHeaderView() {
  const election = useQuery(api.public.getElection, {});
  if (election === undefined) return <BriefSkeleton lines={2} />;
  if (election === null) return <NotFoundCard entity="the election" />;
  const days = Math.ceil(
    (new Date(`${election.primaryDate}T00:00:00-05:00`).getTime() - Date.now()) /
      86_400_000,
  );
  return (
    <header className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Your Wisconsin primary brief
      </p>
      <h1 className="font-display mt-1 text-3xl">
        Primary day: {election.primaryDate}
      </h1>
      {days >= 0 && (
        <p className="mt-2 inline-block border-2 border-border bg-warning px-2 py-0.5 text-sm font-bold">
          {days === 0 ? "Election day is today" : `${days} days to go`}
        </p>
      )}
    </header>
  );
}

export function DeadlineBannerView({ kind }: { kind: DeadlineKind }) {
  const info = useQuery(api.public.getVotingInfo, {});
  if (info === undefined) return <BriefSkeleton lines={2} />;
  if (info === null) return <NotFoundCard entity="voting information" />;
  const map: Record<DeadlineKind, unknown> = {
    registration: info.voterRegistration,
    absentee_request: info.absenteeRequestDeadline,
    absentee_return: info.absenteeReturnDeadline,
    early_voting: info.earlyVoting,
  };
  const entries = rows(map[kind]);
  if (entries.length === 0) return <NotFoundCard entity={KIND_LABEL[kind]} />;
  return (
    <div className="border-2 border-border bg-warning p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest">
        Deadline — {KIND_LABEL[kind]}
      </p>
      <dl className="mt-2 text-sm">
        {entries.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="capitalize">{label}</dt>
            <dd className="font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide">
        Source:{" "}
        <a href={info.officialVoterInfoUrl} className="underline" rel="noopener noreferrer" target="_blank">
          official election info
        </a>
      </p>
    </div>
  );
}

export function VotingChecklistView() {
  const info = useQuery(api.public.getVotingInfo, {});
  if (info === undefined) return <BriefSkeleton lines={5} />;
  if (info === null) return <NotFoundCard entity="voting information" />;
  const items: [string, [string, string][]][] = [
    ["Register to vote", rows(info.voterRegistration)],
    ["Request an absentee ballot", rows(info.absenteeRequestDeadline)],
    ["Return your absentee ballot", rows(info.absenteeReturnDeadline)],
    ["Vote early in person", rows(info.earlyVoting)],
  ];
  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl">Your voting checklist</h2>
      <ol className="mt-3 space-y-3">
        {items
          .filter(([, entries]) => entries.length > 0)
          .map(([title, entries]) => (
            <li key={title} className="border-b border-border pb-2 last:border-b-0">
              <p className="font-bold">☐ {title}</p>
              <dl className="mt-1 text-sm text-muted-foreground">
                {entries.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="capitalize">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        <li>
          <p className="font-bold">
            ☐ Vote on {info.primaryDate}
            {info.pollsOpen && info.pollsClose && (
              <span className="font-normal text-muted-foreground">
                {" "}
                — polls {info.pollsOpen}–{info.pollsClose}
              </span>
            )}
          </p>
        </li>
      </ol>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Source:{" "}
        <a href={info.officialVoterInfoUrl} className="underline" rel="noopener noreferrer" target="_blank">
          official election info
        </a>
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Register in the library**

In `src/lib/brief/library.tsx` add (imports at top, definitions before `createLibrary`, names into `components`):

```tsx
import {
  BriefHeaderView,
  DeadlineBannerView,
  VotingChecklistView,
} from "@/components/brief/voting";

export const BriefHeader = defineComponent({
  name: "BriefHeader",
  description:
    "Brief masthead with primary date and days-to-election countdown. Always place first. Takes no arguments.",
  props: z.object({}),
  component: () => <BriefHeaderView />,
});

export const DeadlineBanner = defineComponent({
  name: "DeadlineBanner",
  description: "High-visibility banner for one voting deadline.",
  props: z.object({
    kind: z.enum([
      "registration",
      "absentee_request",
      "absentee_return",
      "early_voting",
    ]),
  }),
  component: ({ props }) => <DeadlineBannerView kind={props.kind} />,
});

export const VotingChecklist = defineComponent({
  name: "VotingChecklist",
  description:
    "Actionable checklist of registration, absentee, early-voting and election-day steps with official deadlines. Place near the top. Takes no arguments.",
  props: z.object({}),
  component: () => <VotingChecklistView />,
});
```

and `components: [Stack, Grid, AssistantNote, BriefHeader, DeadlineBanner, VotingChecklist]`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief src/components/brief
git commit -m "feat: voting brief components — header, deadline banner, checklist (MOO-305)"
```

---

### Task 3: Race components — RaceCard, CandidateCompareCard

**Files:**
- Create: `src/components/brief/race.tsx`
- Modify: `src/lib/brief/library.tsx`
- Test: `src/lib/brief/library.test.ts` (extend prompt-name list with `RaceCard`, `CandidateCompareCard` — same pattern as Task 2 Step 1; run, watch it fail, then implement)

**Interfaces:**
- Consumes: `api.public.getRace({ raceId })` → `{ race, candidates, positions, finance } | null` where `candidates: Doc<"candidates">[]` (fields: `slug`, `name`, `party?`, `status?`, `incumbent?`, `currentOccupation?`, `keyPriorities?: string[]`), `finance: Doc<"finance_totals">[]` (fields incl. `candidateSlug`, `cashOnHand?`, `source`); guide `RaceCard` from `@/components/guide/cards` (`{ race, candidateCount? }`); `PartyBadge`, `StatusBadge` from `@/components/guide/labels`; `raceIdToSlug` from `@/lib/site`.
- Produces: `BriefRaceCardView({ raceId })`, `CandidateCompareCardView({ raceId, candidateSlugs })`; registry entries `RaceCard({ raceId })`, `CandidateCompareCard({ raceId, candidateSlugs })` (max 4 slugs).

- [ ] **Step 1: Extend prompt test, run, verify FAIL** (same pattern as Task 2 Step 1)

- [ ] **Step 2: Write the components**

`src/components/brief/race.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RaceCard as GuideRaceCard } from "@/components/guide/cards";
import { PartyBadge, StatusBadge } from "@/components/guide/labels";
import { raceIdToSlug } from "@/lib/site";
import { BriefSkeleton, NotFoundCard } from "./chrome";

export function BriefRaceCardView({ raceId }: { raceId: string }) {
  const data = useQuery(api.public.getRace, { raceId });
  if (data === undefined) return <BriefSkeleton lines={4} />;
  if (data === null) return <NotFoundCard entity={`race ${raceId}`} />;
  return (
    <div>
      <GuideRaceCard race={data.race} candidateCount={data.candidates.length} />
      {data.candidates.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {data.candidates.map((c) => c.name).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function CandidateCompareCardView({
  raceId,
  candidateSlugs,
}: {
  raceId: string;
  candidateSlugs: string[];
}) {
  const data = useQuery(api.public.getRace, { raceId });
  if (data === undefined) return <BriefSkeleton lines={6} />;
  if (data === null) return <NotFoundCard entity={`race ${raceId}`} />;
  const picked = candidateSlugs
    .slice(0, 4)
    .map((slug) => data.candidates.find((c) => c.slug === slug))
    .filter((c) => c !== undefined);
  if (picked.length === 0)
    return <NotFoundCard entity={`candidates in ${raceId}`} />;
  const cash = (slug: string) =>
    data.finance.find(
      (f) => f.candidateSlug === slug && f.cashOnHand !== undefined,
    )?.cashOnHand;
  const fmt = (n?: number) =>
    n === undefined
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(n);
  return (
    <section className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h3 className="font-display text-lg">{data.race.office} — compare</h3>
      <div className="mt-3 overflow-x-auto">
        <div
          className="grid min-w-[36rem] gap-3"
          style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0, 1fr))` }}
        >
          {picked.map((c) => (
            <div key={c.slug} className="border-2 border-border p-3">
              <Link href={`/candidates/${c.slug}`} className="font-display text-base underline">
                {c.name}
              </Link>
              <div className="mt-2 flex flex-wrap gap-1">
                <PartyBadge party={c.party} />
                <StatusBadge status={c.status} />
              </div>
              {c.currentOccupation && c.currentOccupation !== "Unknown" && (
                <p className="mt-2 text-xs text-muted-foreground">{c.currentOccupation}</p>
              )}
              {c.keyPriorities && c.keyPriorities.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs">
                  {c.keyPriorities.slice(0, 2).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Cash on hand
              </p>
              <p className="font-display">{fmt(cash(c.slug))}</p>
            </div>
          ))}
        </div>
      </div>
      {data.candidates.length > picked.length && (
        <Link
          href={`/races/${raceIdToSlug(raceId)}`}
          className="mt-3 inline-block border-2 border-border bg-secondary px-2 py-1 text-sm font-bold"
        >
          See full race ({data.candidates.length} candidates) →
        </Link>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Register in the library**

```tsx
import { BriefRaceCardView, CandidateCompareCardView } from "@/components/brief/race";

export const RaceCard = defineComponent({
  name: "RaceCard",
  description:
    "Summary card for one race: office, level, incumbent, candidate names. raceId is a natural key like \"WI-GOV-2026\".",
  props: z.object({ raceId: z.string().describe("race natural key") }),
  component: ({ props }) => <BriefRaceCardView raceId={props.raceId} />,
});

export const CandidateCompareCard = defineComponent({
  name: "CandidateCompareCard",
  description:
    "Side-by-side matrix comparing up to 4 candidates in one race (party, status, priorities, cash on hand) with a link to the full race.",
  props: z.object({
    raceId: z.string().describe("race natural key"),
    candidateSlugs: z
      .array(z.string())
      .max(4)
      .describe("up to 4 candidate slugs from that race"),
  }),
  component: ({ props }) => (
    <CandidateCompareCardView
      raceId={props.raceId}
      candidateSlugs={props.candidateSlugs}
    />
  ),
});
```

Append both to `components`.

- [ ] **Step 4: Run tests** — `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief src/components/brief
git commit -m "feat: race brief components — race card, compare matrix capped at 4 (MOO-305)"
```

---

### Task 4: Candidate components — IssueStanceCard, QuoteCard, FinanceSnapshot

**Files:**
- Create: `src/components/brief/candidate.tsx`
- Modify: `src/lib/brief/library.tsx`
- Test: `src/lib/brief/library.test.ts` (extend prompt-name list with the three names; fail-first as before)

**Interfaces:**
- Consumes: `api.public.getCandidateBySlug({ slug })` → `{ candidate, race, positions, quotes, finance, contributions, committeeFunding } | null`. `positions: Doc<"candidate_positions_published">[]` (`issueSlug`, `stance`, `summary`, `sources: {url,...}[]`); `quotes: Doc<"quote_published">[]` (`speaker`, `text`, `context`, `outlet?`, `date`, `sourceUrl`); `FinancePanel` from `@/components/guide/finance` (`{ totals, contributions?, committeeFunding?, candidateName }`). All three components share one Convex subscription per slug (identical `useQuery` args dedupe).
- Produces: `IssueStanceCardView({ candidateSlug, issueSlug })`, `QuoteCardView({ candidateSlug })`, `FinanceSnapshotView({ candidateSlug })`; registry entries of the same names minus `View`.

- [ ] **Step 1: Extend prompt test, run, verify FAIL**

- [ ] **Step 2: Write the components**

`src/components/brief/candidate.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FinancePanel } from "@/components/guide/finance";
import { BriefSkeleton, NotFoundCard } from "./chrome";

export function IssueStanceCardView({
  candidateSlug,
  issueSlug,
}: {
  candidateSlug: string;
  issueSlug: string;
}) {
  const data = useQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
  if (data === undefined) return <BriefSkeleton lines={3} />;
  if (data === null) return <NotFoundCard entity={`candidate ${candidateSlug}`} />;
  const position = data.positions.find((p) => p.issueSlug === issueSlug);
  if (!position)
    return (
      <NotFoundCard
        entity={`${data.candidate.name}'s published position on ${issueSlug}`}
      />
    );
  return (
    <section className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {issueSlug.replaceAll("-", " ")} — {data.candidate.name}
      </p>
      <p className="mt-1 font-display">{position.stance}</p>
      <p className="mt-2 text-sm">{position.summary}</p>
      {position.sources.length > 0 && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Source:{" "}
          <a href={position.sources[0].url} className="underline" rel="noopener noreferrer" target="_blank">
            {new URL(position.sources[0].url).hostname}
          </a>
        </p>
      )}
    </section>
  );
}

export function QuoteCardView({ candidateSlug }: { candidateSlug: string }) {
  const data = useQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
  if (data === undefined) return <BriefSkeleton lines={3} />;
  if (data === null) return <NotFoundCard entity={`candidate ${candidateSlug}`} />;
  if (data.quotes.length === 0) return null; // no published quotes — render nothing
  return (
    <div className="space-y-3">
      {data.quotes.slice(0, 2).map((q) => (
        <blockquote
          key={q._id}
          className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
        >
          <p className="text-sm">&ldquo;{q.text}&rdquo;</p>
          <footer className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            — {q.speaker}, {q.outlet ? `${q.outlet}, ` : ""}
            {q.date} ·{" "}
            <a href={q.sourceUrl} className="underline" rel="noopener noreferrer" target="_blank">
              source
            </a>
          </footer>
        </blockquote>
      ))}
    </div>
  );
}

export function FinanceSnapshotView({ candidateSlug }: { candidateSlug: string }) {
  const data = useQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
  if (data === undefined) return <BriefSkeleton lines={4} />;
  if (data === null) return <NotFoundCard entity={`candidate ${candidateSlug}`} />;
  if (data.finance.length === 0)
    return <NotFoundCard entity={`finance data for ${data.candidate.name}`} />;
  return (
    <FinancePanel
      totals={data.finance}
      contributions={data.contributions}
      committeeFunding={data.committeeFunding}
      candidateName={data.candidate.name}
    />
  );
}
```

- [ ] **Step 3: Register in the library**

```tsx
import {
  FinanceSnapshotView,
  IssueStanceCardView,
  QuoteCardView,
} from "@/components/brief/candidate";

export const IssueStanceCard = defineComponent({
  name: "IssueStanceCard",
  description:
    "One candidate's published stance on one issue, with summary and source link.",
  props: z.object({
    candidateSlug: z.string().describe("candidate slug"),
    issueSlug: z.string().describe("issue slug, e.g. \"abortion\""),
  }),
  component: ({ props }) => (
    <IssueStanceCardView
      candidateSlug={props.candidateSlug}
      issueSlug={props.issueSlug}
    />
  ),
});

export const QuoteCard = defineComponent({
  name: "QuoteCard",
  description:
    "Up to two published, sourced quotes from one candidate. Renders nothing if none are published.",
  props: z.object({ candidateSlug: z.string().describe("candidate slug") }),
  component: ({ props }) => <QuoteCardView candidateSlug={props.candidateSlug} />,
});

export const FinanceSnapshot = defineComponent({
  name: "FinanceSnapshot",
  description:
    "Campaign money panel for one candidate: raised/spent/cash/debts, top org donors, and pass-through funding drill-down.",
  props: z.object({ candidateSlug: z.string().describe("candidate slug") }),
  component: ({ props }) => (
    <FinanceSnapshotView candidateSlug={props.candidateSlug} />
  ),
});
```

Append all three to `components`.

- [ ] **Step 4: Run tests** — `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief src/components/brief
git commit -m "feat: candidate brief components — stance, quotes, finance snapshot (MOO-305)"
```

---

### Task 5: BriefRenderer + fixture brief

**Files:**
- Create: `src/components/brief/renderer.tsx`
- Create: `src/lib/brief/fixture.ts`
- Test: `src/lib/brief/library.test.ts` (fixture parses cleanly)

**Interfaces:**
- Consumes: `briefLibrary` (Task 1), `Renderer` from `@openuidev/react-lang`.
- Produces: `BriefRenderer({ source, isStreaming? })` — the component MOO-311 will reuse for streaming; `fixtureBrief: string` (OpenUI Lang).

- [ ] **Step 1: Confirm real entity IDs against seeded data (never assert)**

```bash
npx convex run public:listCandidateSlugs
npx convex run public:getRace '{"raceId": "WI-GOV-2026"}' | head -30
```

Expected: slug list including `tom-tiffany` and the governor's-race candidates; a non-null race object. Use ONLY slugs/raceIds present in this output in Step 2 — if `WI-GOV-2026` or a slug below is absent, substitute real ones from the output.

- [ ] **Step 2: Write the failing fixture test**

Append to `src/lib/brief/library.test.ts`:

```ts
import { fixtureBrief } from "./fixture";

describe("fixture brief", () => {
  it("parses against the registry with zero errors and no unresolved refs", () => {
    const result = parse(fixtureBrief);
    expect(result.root).not.toBeNull();
    expect(result.meta.errors).toHaveLength(0);
    expect(result.meta.unresolved).toHaveLength(0);
  });
});
```

Run: `npx vitest run src/lib/brief/library.test.ts` — Expected: FAIL (no `./fixture`).

- [ ] **Step 3: Write the fixture**

`src/lib/brief/fixture.ts` — hand-written brief demonstrating the approved shape (header → checklist/deadline → contested race first with compare + money → assistant notes). Adjust slugs per Step 1 output:

```ts
/**
 * Hand-written OpenUI Lang fixture (MOO-305 verification + /brief fallback
 * until MOO-311's Brief Agent writes real ones). Entity IDs verified against
 * seeded data — see plan Task 5 Step 1.
 */
export const fixtureBrief = [
  `root = Stack([header, intro, checklist, deadline, gov, govCompare, govMoney, house7, tiffanyQuotes])`,
  `header = BriefHeader()`,
  `intro = AssistantNote("Here's your guide to the August 11 primary. Contested races come first.")`,
  `checklist = VotingChecklist()`,
  `deadline = DeadlineBanner("absentee_request")`,
  `gov = RaceCard("WI-GOV-2026")`,
  `govCompare = CandidateCompareCard("WI-GOV-2026", ["<slug-1>", "<slug-2>", "<slug-3>", "<slug-4>"])`,
  `govMoney = FinanceSnapshot("<slug-1>")`,
  `house7 = RaceCard("WI-CD07-2026")`,
  `tiffanyQuotes = QuoteCard("tom-tiffany")`,
].join("\n");
```

Replace every `<slug-N>` with real governor's-race slugs from Step 1 (and `WI-CD07-2026` with Tiffany's real raceId from the slug lookup — run `npx convex run public:getCandidateBySlug '{"slug": "tom-tiffany"}' | head -5` to read it). The committed file must contain only real IDs — no angle-bracket placeholders.

- [ ] **Step 4: Write the renderer**

`src/components/brief/renderer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Renderer, type OpenUIError } from "@openuidev/react-lang";
import { briefLibrary } from "@/lib/brief/library";

/** Renders OpenUI Lang against the brief registry. MOO-311 streams into this. */
export function BriefRenderer({
  source,
  isStreaming = false,
}: {
  source: string | null;
  isStreaming?: boolean;
}) {
  const [errors, setErrors] = useState<OpenUIError[]>([]);
  return (
    <div>
      <Renderer
        library={briefLibrary}
        response={source}
        isStreaming={isStreaming}
        onError={setErrors}
      />
      {errors.length > 0 && !isStreaming && (
        <p className="mt-4 border-2 border-dashed border-border p-3 text-sm text-muted-foreground">
          Some sections of this brief couldn&apos;t be displayed.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests** — `npx vitest run` — Expected: all pass, fixture test green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brief src/components/brief
git commit -m "feat: brief renderer + verified fixture brief (MOO-305)"
```

---

### Task 6: /brief page — Clerk gate, saved-brief query, print stylesheet

**Files:**
- Create: `convex/briefs.ts`
- Create: `src/app/brief/page.tsx`
- Create: `src/components/brief/loader.tsx`
- Modify: `src/middleware.ts` (protect `/brief`)
- Modify: `src/app/globals.css` (print rules)

**Interfaces:**
- Consumes: `BriefRenderer`, `fixtureBrief` (Task 5); Clerk `clerkMiddleware`/`createRouteMatcher` pattern already in `src/middleware.ts`; `users.by_clerk_id` index; `voter_briefs.by_user` index (fields `userId`, `openuiSource`, `generatedAt`).
- Produces: `api.briefs.getMine` (no args, auth'd → latest `voter_briefs` doc or null); route `/brief`.

- [ ] **Step 1: Add the Convex query**

`convex/briefs.ts`:

```ts
import { query } from "./_generated/server";

/** Latest saved brief for the signed-in user; null when signed out or none saved. */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    return await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
  },
});
```

Run: `npx convex dev --once` — Expected: functions deploy cleanly to `greedy-armadillo-714`.

- [ ] **Step 2: Gate the route in middleware**

In `src/middleware.ts` replace the matcher lines:

```ts
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/brief(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect(); // signed-out → redirected to sign-in; admin role check happens in the page
  }
});
```

- [ ] **Step 3: Write the loader (client)**

`src/components/brief/loader.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { fixtureBrief } from "@/lib/brief/fixture";
import { BriefSkeleton } from "./chrome";
import { BriefRenderer } from "./renderer";

/** Loads the signed-in user's saved brief; falls back to the fixture until MOO-311 generates real ones. */
export function BriefLoader() {
  const saved = useQuery(api.briefs.getMine, {});

  // Print contract (spec §5): drill-downs print expanded.
  useEffect(() => {
    const openAll = () =>
      document
        .querySelectorAll<HTMLDetailsElement>("details:not([open])")
        .forEach((d) => {
          d.dataset.printOpened = "true";
          d.open = true;
        });
    const closeAgain = () =>
      document
        .querySelectorAll<HTMLDetailsElement>("details[data-print-opened]")
        .forEach((d) => {
          d.open = false;
          delete d.dataset.printOpened;
        });
    window.addEventListener("beforeprint", openAll);
    window.addEventListener("afterprint", closeAgain);
    return () => {
      window.removeEventListener("beforeprint", openAll);
      window.removeEventListener("afterprint", closeAgain);
    };
  }, []);

  if (saved === undefined) return <BriefSkeleton lines={8} />;
  const generatedAt = saved ? new Date(saved.generatedAt) : new Date();
  return (
    <div>
      <BriefRenderer source={saved ? saved.openuiSource : fixtureBrief} />
      <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Generated {generatedAt.toLocaleDateString("en-US", { dateStyle: "long" })}
        {saved ? "" : " · sample brief — personalized briefs are coming soon"}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Write the page (server)**

`src/app/brief/page.tsx`:

```tsx
import type { Metadata } from "next";
import { BriefLoader } from "@/components/brief/loader";

export const metadata: Metadata = {
  title: "Your primary brief",
  robots: { index: false }, // personal, Clerk-gated
};

export default function BriefPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <BriefLoader />
    </main>
  );
}
```

- [ ] **Step 5: Add print rules**

Append to `src/app/globals.css`:

```css
@media print {
  header,
  footer,
  nav {
    display: none !important;
  }
  a {
    text-decoration: none;
  }
  .shadow-\[var\(--shadow-brutal\)\] {
    box-shadow: none !important;
  }
  details::details-content {
    content-visibility: visible;
  }
}
```

(The `beforeprint` handler in Step 3 is the reliable expansion mechanism; `::details-content` is belt-and-suspenders for browsers that skip beforeprint on preview.)

- [ ] **Step 6: Verify the gate and the page**

```bash
pnpm dev &   # :3001
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/brief
```

Expected: non-200 (redirect to sign-in) while unauthenticated — the gate working. Then sign in via the browser (Task 8 does the visual pass).

- [ ] **Step 7: Run tests** — `npx vitest run` — Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add convex/briefs.ts src/app/brief src/components/brief src/middleware.ts src/app/globals.css
git commit -m "feat: Clerk-gated /brief page with saved-brief query and print styles (MOO-305)"
```

---

### Task 7: Prompt artifact for MOO-311

**Files:**
- Create: `src/lib/brief/prompt.ts`
- Create: `docs/brief-agent-prompt.txt` (generated)
- Test: `src/lib/brief/library.test.ts` (composition rules present)

**Interfaces:**
- Consumes: `briefLibrary.prompt(options)` with `PromptOptions` (`preamble`, `additionalRules`, `examples`).
- Produces: `briefPrompt: string` export — MOO-311 imports this as the Brief Agent's UI-composition system prompt; `docs/brief-agent-prompt.txt` as the reviewable captured artifact.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/brief/library.test.ts`:

```ts
import { briefPrompt } from "./prompt";

describe("brief agent prompt", () => {
  it("carries the composition rules and full registry", () => {
    expect(briefPrompt).toContain("ballot order");
    expect(briefPrompt).toContain("AssistantNote");
    expect(briefPrompt).toContain("FinanceSnapshot");
  });
});
```

Run: `npx vitest run src/lib/brief/library.test.ts` — Expected: FAIL (no `./prompt`).

- [ ] **Step 2: Write the prompt module**

`src/lib/brief/prompt.ts`:

```ts
import { briefLibrary } from "./library";

/** UI-composition system prompt for the Brief Agent (consumed by MOO-311). */
export const briefPrompt = briefLibrary.prompt({
  preamble:
    "You compose a personalized Wisconsin primary voter brief. You output ONLY OpenUI Lang. You never state facts in text — every fact comes from a data component resolving an entity ID. AssistantNote is your only free text: short transitions and 'why this matters' framing, never claims about candidates.",
  additionalRules: [
    "Start with BriefHeader, then VotingChecklist and any urgent DeadlineBanner.",
    "List races in ballot order; within each group, contested races come first.",
    "Use CandidateCompareCard only for contested races, with at most 4 candidateSlugs.",
    "Use only entity IDs you were given in the input. Never invent a raceId or candidateSlug.",
    "For a shorter brief, include fewer components (skip QuoteCard/IssueStanceCard first); for a deeper one, add more. Components have no density settings.",
  ],
  examples: [
    [
      `root = Stack([header, checklist, gov, govCompare])`,
      `header = BriefHeader()`,
      `checklist = VotingChecklist()`,
      `gov = RaceCard("WI-GOV-2026")`,
      `govCompare = CandidateCompareCard("WI-GOV-2026", ["slug-a", "slug-b"])`,
    ].join("\n"),
  ],
});
```

- [ ] **Step 3: Capture the artifact**

Append a capture step to the test file (node env writes are fine there):

```ts
import { mkdirSync, writeFileSync } from "node:fs";

it("captures the prompt artifact for MOO-311", () => {
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/brief-agent-prompt.txt", briefPrompt);
  expect(briefPrompt.length).toBeGreaterThan(500);
});
```

- [ ] **Step 4: Run the full suite** — `npx vitest run` — Expected: all pass; `docs/brief-agent-prompt.txt` exists and reads sensibly (open it and skim: component signatures + your rules).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief docs/brief-agent-prompt.txt
git commit -m "feat: library.prompt() composition prompt captured for Brief Agent (MOO-305)"
```

---

### Task 8: Verify against reality + Linear evidence

**Files:**
- Create: `docs/evidence/moo-305/` (screenshots)
- Modify: `src/lib/brief/fixture.ts` only if a real-data check fails

No new code — this is the prove-it pass. Never assert; look.

- [ ] **Step 1: Full-suite + typecheck gate**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all tests pass, zero type errors.

- [ ] **Step 2: Rendered brief screenshot (real seeded data)**

Start `pnpm dev` (:3001). Using Playwright browser tools: navigate to `http://localhost:3001/brief`, sign in with Clerk dev credentials, wait for content, screenshot full page → `docs/evidence/moo-305/brief-rendered.png`. Confirm VISIBLE real content: real race office names, real candidate names, real dollar figures — not skeletons, not fallback cards.

- [ ] **Step 3: Invented entity ID → fallback (not crash)**

Temporarily append to the fixture: `ghost = RaceCard("WI-FAKE-9999")` (and add `ghost` to root's list). Reload `/brief`. Expected: a "Not available" fallback card renders; page does not crash. Screenshot → `docs/evidence/moo-305/fallback-card.png`. Revert the fixture edit.

- [ ] **Step 4: Invented component → parser rejection evidence**

Already proven by the vitest rejection test (Task 1). Capture the passing test output:

```bash
npx vitest run src/lib/brief/library.test.ts 2>&1 | tee docs/evidence/moo-305/parser-tests.txt
```

- [ ] **Step 5: Print preview screenshot**

In the Playwright page, emulate print media and screenshot → `docs/evidence/moo-305/print-preview.png`. Confirm: no site header/footer, finance `<details>` content visible expanded, "Generated [date]" stamp present.

- [ ] **Step 6: Commit evidence**

```bash
git add docs/evidence/moo-305
git commit -m "test: MOO-305 verification evidence — rendered brief, fallback, print (MOO-305)"
```

- [ ] **Step 7: Linear close-out**

Via linear-server MCP: set MOO-305 → In Progress at Task 1 start if not already; now set → Done. Comment with: the contract addition (FinanceSnapshot added; QuoteCard binds `candidateSlug` — no quote-ID natural key exists), evidence file paths, commit range, and test count. Check off the issue's acceptance/verification checkboxes in the description.
