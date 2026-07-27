# Feature B — "Help improve the guide" contribution pathway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give engaged voters non-monetary ways to contribute (suggest candidate/source, flag data gap, volunteer, share), routed into the existing human editorial queue — reusing the `feedback` table end-to-end.

**Architecture:** New `kind`s on the existing `feedback` enum + the existing `feedback.submit` mutation + the existing `/admin` review queue. A `/contribute` hub page with a reused-idiom form, contextual "suggest a source / flag a gap" deep-links on candidate/race pages, and a zero-backend ShareButton. No new table, no new dependency.

**Tech Stack:** Convex (read `convex/_generated/ai/guidelines.md` first), Next.js App Router (NON-stock), React, Tailwind (neo-brutalist), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-feature-b-contribute-pathway-design.md`

## Global Constraints

- **No new dependency, no new table.** Reuse `feedback` (`convex/schema.ts` + `convex/feedback.ts`) and the `/admin` feedback queue.
- **English v1.** `/contribute` + contextual affordances are EN (gate to `!== "es"` where they'd otherwise appear on `/es`); ShareButton is locale-agnostic. `/es` deferred.
- **Nothing auto-publishes or renders publicly** — every submission enters the `feedback` queue at `status:"new"` for human review. No scoring/endorsement.
- **Anti-spam:** reuse the existing `website` honeypot + message min-length; no captcha.
- **Neo-brutalist idiom** (`border-2 border-border`, `shadow-[var(--shadow-brutal)]`, `font-mono text-xs font-bold uppercase tracking-widest` for quiet affordances). `useSearchParams()` under `<Suspense>` (Feature A gotcha).
- **Route:** `/contribute`, plain canonical (no hreflang), mirroring the `/start` route convention. Conventional commits, no attribution.

## File Structure

- `convex/schema.ts` — extend `feedback.kind` union with 4 literals.
- `convex/feedback.ts` — extend `submit` `kind` validator + per-kind required-field rules.
- `convex/feedback.test.ts` — extend/create for the new-kind validation.
- `src/lib/contribute-kind.ts` (new) — `CONTRIBUTE_KINDS` + `parseContributeKind(raw)` pure helper.
- `src/lib/contribute-kind.test.ts` (new).
- `src/components/contribute/contribute-form.tsx` (new) — client form over `feedback.submit`.
- `src/components/contribute/share-button.tsx` (new) — client share affordance.
- `src/app/contribute/page.tsx` (new) — hub (server shell + `<Suspense>` around the form).
- `src/components/admin/feedback-queue.tsx` — surface new kinds in filter/labels.
- `src/app/candidates/[slug]/page.tsx`, `src/app/races/[slug]/page.tsx` — contextual entries + ShareButton.
- `src/components/guide/chrome.tsx` + `src/lib/i18n/chrome-en.ts` — footer link.

---

## PIECE A — Backend + hub

### Task 1: Extend `feedback` kinds + validation + kind helper

**Files:**
- Modify: `convex/schema.ts`, `convex/feedback.ts`
- Create: `src/lib/contribute-kind.ts`, `src/lib/contribute-kind.test.ts`
- Test: `convex/feedback.test.ts` (extend if present, else create)

**Interfaces:**
- Produces: `type ContributeKind = "suggest_candidate" | "suggest_source" | "data_gap" | "volunteer"`; `CONTRIBUTE_KINDS: { kind: ContributeKind; label: string; needs: ("source"|"contact")[] }[]`; `parseContributeKind(raw: string | null): ContributeKind` (defaults to `"suggest_source"`).

- [ ] **Step 1: Kind helper — failing test**

```ts
// src/lib/contribute-kind.test.ts
import { describe, it, expect } from "vitest";
import { parseContributeKind, CONTRIBUTE_KINDS } from "./contribute-kind";

describe("parseContributeKind", () => {
  it("accepts the four valid kinds", () => {
    for (const k of ["suggest_candidate", "suggest_source", "data_gap", "volunteer"] as const) {
      expect(parseContributeKind(k)).toBe(k);
    }
  });
  it("defaults to suggest_source for absent/invalid", () => {
    expect(parseContributeKind(null)).toBe("suggest_source");
    expect(parseContributeKind("")).toBe("suggest_source");
    expect(parseContributeKind("correction")).toBe("suggest_source"); // not a contribute kind
    expect(parseContributeKind("garbage")).toBe("suggest_source");
  });
});

describe("CONTRIBUTE_KINDS", () => {
  it("marks suggest_source as needing a source and volunteer as needing contact", () => {
    const bySource = CONTRIBUTE_KINDS.find((k) => k.kind === "suggest_source");
    const byVol = CONTRIBUTE_KINDS.find((k) => k.kind === "volunteer");
    expect(bySource?.needs).toContain("source");
    expect(byVol?.needs).toContain("contact");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/contribute-kind.test.ts`).

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/contribute-kind.ts
export type ContributeKind = "suggest_candidate" | "suggest_source" | "data_gap" | "volunteer";

export const CONTRIBUTE_KINDS: { kind: ContributeKind; label: string; needs: ("source" | "contact")[] }[] = [
  { kind: "suggest_source", label: "Suggest a source", needs: ["source"] },
  { kind: "suggest_candidate", label: "Suggest a candidate we're missing", needs: [] },
  { kind: "data_gap", label: "Flag a gap in the guide", needs: [] },
  { kind: "volunteer", label: "Volunteer / get involved", needs: ["contact"] },
];

const VALID = new Set(CONTRIBUTE_KINDS.map((k) => k.kind));

export function parseContributeKind(raw: string | null): ContributeKind {
  return raw && VALID.has(raw as ContributeKind) ? (raw as ContributeKind) : "suggest_source";
}
```

- [ ] **Step 4: Extend the schema** — in `convex/schema.ts`, widen `feedback.kind`:

```ts
    kind: v.union(
      v.literal("correction"),
      v.literal("question"),
      v.literal("other"),
      v.literal("suggest_candidate"),
      v.literal("suggest_source"),
      v.literal("data_gap"),
      v.literal("volunteer"),
    ),
```

- [ ] **Step 5: Extend `feedback.submit`** — read `convex/feedback.ts` first. Widen the `kind` arg validator to the same 7 literals. Adapt the required-field rules (keep the existing correction-needs-sourceUrl):

```ts
    // existing: correction requires a source
    if ((args.kind === "correction" || args.kind === "suggest_source") && !args.sourceUrl?.trim()) {
      throw new ConvexError("A source suggestion needs a link to the source.");
    }
    if (args.kind === "volunteer" && !args.contact?.trim()) {
      throw new ConvexError("Add a way to reach you so we can follow up.");
    }
```

(Keep the honeypot `website` drop + message min/max exactly as they are.)

- [ ] **Step 6: Convex validation test** — extend `convex/feedback.test.ts` (create if absent, following the convexTest pattern in `convex/voterHelpQueries.test.ts`): `suggest_source` without `sourceUrl` throws; `volunteer` without `contact` throws; a valid `data_gap` inserts with `status:"new"`; honeypot-filled submit does not insert.

- [ ] **Step 7: Run + codegen**

Run: `npx vitest run src/lib/contribute-kind.test.ts convex/feedback.test.ts && npx convex codegen && npx tsc --noEmit`
Expected: green; codegen picks up the widened union.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/feedback.ts convex/feedback.test.ts src/lib/contribute-kind.ts src/lib/contribute-kind.test.ts convex/_generated
git commit -m "feat(contribute): extend feedback kinds + validation + kind helper (Feature B)"
```

---

### Task 2: Surface new kinds in the `/admin` feedback queue

**Files:**
- Modify: `src/components/admin/feedback-queue.tsx`

**Interfaces:**
- Consumes: `CONTRIBUTE_KINDS` (Task 1) for labels.

- [ ] **Step 1: Read** `src/components/admin/feedback-queue.tsx` — find where it filters by / labels `kind` (currently correction/question/other).

- [ ] **Step 2: Add the new kinds** to the filter control and the kind→label map so contribution rows are filterable and human-readable, and ensure `sourceUrl`/`contact`/`pageUrl` render when present (they likely already do). Reuse `CONTRIBUTE_KINDS` labels where it makes sense; keep the existing kinds' labels.

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/feedback-queue.tsx
git commit -m "feat(contribute): show contribution kinds in admin feedback queue (Feature B)"
```

---

### Task 3: `/contribute` hub + `ContributeForm`

**Files:**
- Create: `src/components/contribute/contribute-form.tsx`, `src/app/contribute/page.tsx`

**Interfaces:**
- Consumes: `CONTRIBUTE_KINDS`, `parseContributeKind` (Task 1); `api.feedback.submit`.

- [ ] **Step 1: Read** the existing `/feedback` page + its form (`src/app/feedback/page.tsx` and any form component it uses) to reuse the field/validation/success idiom (message textarea, honeypot `website` field, min-length, submit-success state).

- [ ] **Step 2: `ContributeForm`** (client) — a kind `<select>` from `CONTRIBUTE_KINDS`; message textarea (always); a `sourceUrl` input shown when the selected kind `needs` "source"; a `contact` input shown when it `needs` "contact"; the hidden honeypot `website`; auto `pageUrl` (referrer/`ref` context). On submit call `useMutation(api.feedback.submit)` with the right args; show inline validation errors (mirror `/feedback`) and a success confirmation. Read `?kind` (via `parseContributeKind`) and `?ref` from `useSearchParams()` to prefill the kind + a "re: <ref>" context line (sanitize `ref` to a slug; display-only).

- [ ] **Step 3: `/contribute` page** (server, static, `revalidate = 300`, metadata + canonical `/contribute` mirroring `/start`) — intro copy (nonpartisan, human-reviewed, never auto-published), the `ContributeForm` wrapped in `<Suspense fallback={null}>` (it uses `useSearchParams`), a Share section (`ShareButton` from Task 4 — if building Piece A first, leave a placeholder import wired in Task 4), and a "support the project" note linking existing Ko-fi (`https://ko-fi.com/tarikmoody`) + GitHub Sponsors (`https://github.com/sponsors/tmoody1973`).

- [ ] **Step 4: Build + verify** `/contribute` prerenders (`npx tsc --noEmit && npm run build`; watch for the Suspense/useSearchParams prerender error).

- [ ] **Step 5: Commit**

```bash
git add src/components/contribute/contribute-form.tsx src/app/contribute/page.tsx
git commit -m "feat(contribute): /contribute hub + ContributeForm over feedback.submit (Feature B)"
```

---

## PIECE B — Contextual entries + share

### Task 4: `ShareButton`

**Files:**
- Create: `src/components/contribute/share-button.tsx`
- Modify: `src/app/contribute/page.tsx` (wire the Share section)

**Interfaces:**
- Produces: `ShareButton({ url, title }: { url: string; title: string })` (client).

- [ ] **Step 1: Implement** — `"use client"`; on click, if `typeof navigator !== "undefined" && navigator.share`, call `navigator.share({ title, url })` in a try/catch (swallow `AbortError`); else fall back to copying the url (`navigator.clipboard.writeText`) with a "Copied!" state, plus two links: X (`https://twitter.com/intent/tweet?url=...&text=...`) and Facebook (`https://www.facebook.com/sharer/sharer.php?u=...`). Neo-brutalist button styling. No deps.

- [ ] **Step 2: Wire** the hub's Share section to `<ShareButton url={SITE_URL} title="BadgerBrief — Wisconsin 2026 voter guide" />` (import `SITE_URL` from `@/lib/site`).

- [ ] **Step 3: Build** (`npx tsc --noEmit && npm run build`).

- [ ] **Step 4: Commit**

```bash
git add src/components/contribute/share-button.tsx src/app/contribute/page.tsx
git commit -m "feat(contribute): ShareButton (native share + copy/social fallback) (Feature B)"
```

---

### Task 5: Contextual entries on candidate + race pages

**Files:**
- Modify: `src/app/candidates/[slug]/page.tsx`, `src/app/races/[slug]/page.tsx`

**Interfaces:**
- Consumes: `ShareButton` (Task 4).

- [ ] **Step 1: Candidate page** — near the sources/footer of the page (low emphasis, after the `#sources` section), add a quiet affordance:
  - a "Suggest a source · Flag a gap" line linking `/contribute?kind=suggest_source&ref=<candidate.slug>` and `/contribute?kind=data_gap&ref=<candidate.slug>` (two links, or one to each);
  - a `<ShareButton url={\`${SITE_URL}/candidates/${candidate.slug}\`} title={\`${candidate.name} — BadgerBrief\`} />`.
  Use `font-mono text-xs` quiet styling; it must not compete with the reading flow.

- [ ] **Step 2: Race page** — the same pattern near the race page footer, linking `/contribute?kind=data_gap&ref=<raceSlug>` and a `ShareButton` for the race URL.

- [ ] **Step 3: Build** (`npx tsc --noEmit && npm run build` — all candidate/race routes compile).

- [ ] **Step 4: Commit**

```bash
git add "src/app/candidates/[slug]/page.tsx" "src/app/races/[slug]/page.tsx"
git commit -m "feat(contribute): contextual suggest/flag/share on candidate + race pages (Feature B)"
```

---

### Task 6: Footer entry link

**Files:**
- Modify: `src/lib/i18n/chrome-en.ts`, `src/components/guide/chrome.tsx`

- [ ] **Step 1: Dict** — add a `footer.contribute` key: `contribute: "Help improve this guide"` to `chrome-en.ts` (add as optional to the type if ES parity isn't provided, OR add the ES key too to satisfy the `static-i18n.test.ts` key-parity check — check whether that test compares `chrome` dicts; Feature A hit this with `home-es`).

- [ ] **Step 2: Footer link** — in `chrome.tsx`, add a `<Link href={localizeHref("/contribute", locale)}>` (or gate to EN: `/contribute`) next to the existing "Report an error"/"Support" links, using `footer.contribute`.

- [ ] **Step 3: Build** (`npx tsc --noEmit && npm run build`; both EN + `/es` build).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/chrome-en.ts src/components/guide/chrome.tsx
git commit -m "feat(contribute): footer 'Help improve this guide' link (Feature B)"
```

---

## Final verification (before claiming done)

- [ ] `npx vitest run` — green (contribute-kind + feedback + existing).
- [ ] `npx tsc --noEmit && npm run build` — clean, no Suspense/prerender error.
- [ ] Deploy (BOTH — new Convex enum: `npx convex deploy --yes` + `npx vercel --prod`), then live-verify:
  - `/contribute` renders; submitting each kind lands in `/admin` feedback queue at `status:"new"`.
  - A candidate-page "Flag a gap" deep-links to `/contribute?kind=data_gap&ref=<slug>` with the kind + "re:" prefilled.
  - `suggest_source` without a link and `volunteer` without contact show friendly errors.
  - ShareButton uses the native sheet on mobile, copy/social fallback on desktop.
  - Footer "Help improve this guide" → `/contribute`. No body horizontal scroll at 375px.

## Self-Review notes

- **Spec coverage:** 4 kinds + validation → T1; admin review → T2; hub + form + prefill → T3; share → T4; contextual entries → T5; footer entry → T6. Reuse (feedback table/mutation/queue) honored; no new table/dep.
- **Gate risk:** none — Feature B touches no `voterHelp` agent code, so no golden gate.
- **i18n:** EN v1; footer key + candidate/race affordances gate EN (or add ES dict key for parity per the Feature A `home-es` lesson) — T6 Step 1 flags the key-parity test.
- **Type consistency:** `ContributeKind`, `parseContributeKind`, `CONTRIBUTE_KINDS`, the 7-literal `feedback.kind` union used identically across tasks.
