# MOO-400 Spanish Vote Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fully-Spanish `/es/vote` (how-to-vote logistics + the 8 voter-access situations) with correct reciprocal hreflang, so Spanish-speaking Wisconsin voters get the actionable civic content in Spanish and Google treats the EN/ES pair correctly.

**Architecture:** Refactor the current `/vote` page body into a shared `VoteGuide` component driven by a strings `dict`; render it from both `/vote` (EN dict) and `/es/vote` (ES dict). Sources/data come from Convex (single source of truth for both languages); only prose is translated. Reciprocal `alternates.languages` on both pages.

**Tech Stack:** Next 16 App Router, React, Tailwind v4, vitest.

## Global Constraints

- **EN output must not regress.** Task 1 is a pure refactor — `/vote` renders byte-equivalent content after extraction. Verify against the pre-refactor page.
- **hreflang reciprocity (load-bearing):** BOTH `/vote` and `/es/vote` set `alternates.languages = { en: "/vote", es: "/es/vote", "x-default": "/vote" }` and a self-referential `canonical`. If either side is missing or non-reciprocal, Google drops the pair. Tests assert both directions; deploy verifies via curl.
- **Sources are single-source-of-truth from data.** `VoteGuide` renders `row.sources` / `info.sources` straight from Convex for BOTH languages. The dict never contains source URLs.
- **Spanish is accuracy-critical + human-gated.** `src/lib/i18n/vote-es.ts` (the 8 access rows + UI prose) is authored by the controller and **verified by Tarik before deploy** — same gate as MOO-398. A wrong eligibility statement in Spanish is the exact failure mode MOO-398 guarded against.
- **Global nav stays English** (page content only; full nav i18n is November).
- **Test command:** `npx vitest run <file>`.

---

### Task 1: Extract `VoteGuide` + `VoteDict` + EN dict; rewire `/vote` (regression-safe)

**Files:**
- Create: `src/lib/i18n/vote-dict.ts` (the `VoteDict` type)
- Create: `src/lib/i18n/vote-en.ts` (EN dict)
- Create: `src/components/guide/vote-guide.tsx` (the shared body)
- Modify: `src/app/vote/page.tsx` (render `<VoteGuide>`; add reciprocal hreflang)
- Test: `src/components/guide/vote-guide.test.tsx`

**Interfaces:**
- Consumes: `getVotingInfo`, `getVoterAccess` (unchanged), `SourceList`, `LastUpdated`, `JsonLd`/`breadcrumbNode`/`organizationNode`/`faqNode`, `voterAccessToFaqs`.
- Produces: `VoteDict` type; `voteEn: VoteDict`; `VoteGuide({ dict, info, access })` component; `EN` accessText passthrough.

- [ ] **Step 1: Define `VoteDict` in `src/lib/i18n/vote-dict.ts`**

```ts
import type { ReactNode } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";

export type VotingInfo = Doc<"voting_info">;
export type VoterAccessRow = Doc<"voter_access">;

export type Faq = { q: string; a: string };

// Single source of truth for the EN/ES hreflang pair — imported by BOTH page
// metadata objects AND the reciprocity test, so the test never has to import a
// page module (which would pull in @/lib/data / unstable_cache and fail in the
// vitest node env). Self-canonical is set per-page; this is the shared `languages`.
export const VOTE_HREFLANG = {
  en: "/vote",
  es: "/es/vote",
  "x-default": "/vote",
} as const;

export type VoteDict = {
  lang: "en" | "es";
  meta: { title: string; description: string };
  h1: string;
  intro: (info: VotingInfo, myVoteLabel: string) => ReactNode;
  faqs: (info: VotingInfo, d: {
    registration: [string, string][];
    absenteeRequest: [string, string][];
    absenteeReturn: [string, string][];
    early?: { available?: boolean; start_date?: string; end_date?: string };
  }) => Faq[];
  deadlineLabel: (key: string) => string;      // "by_mail" → "por correo"
  checklist: { title: string; register: string; requestAbsentee: string; returnAbsentee: string; vote: string };
  sourcesTitle: string;
  lastUpdatedPrefix: string;
  situation: { title: string; blurb: string };
  accessText: (row: VoterAccessRow) => { title: string; summary: string; details: string };
  crumbs: { home: string; vote: string };
  toggle: { label: string; href: string };
  myVoteLabel: string;
};
```

- [ ] **Step 2: Create `src/lib/i18n/vote-en.ts`** — lift EVERY English string currently hardcoded in `src/app/vote/page.tsx` into this dict verbatim (the h1, intro sentence, all 6 FAQ q/a templates, the "Deadline checklist" labels, "Your situation" heading + blurb, "Official sources", the breadcrumb labels, MyVote label). `accessText` returns the row's own fields; `deadlineLabel` humanizes the key (`key.replaceAll("_", " ")`). `toggle` = `{ label: "Español", href: "/es/vote" }`. Match the current output EXACTLY — read `page.tsx` and copy the strings.

- [ ] **Step 3: Write the failing test** — `src/components/guide/vote-guide.test.tsx`

```tsx
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { voteEn } from "@/lib/i18n/vote-en";

const info: any = {
  primaryDate: "August 11, 2026", pollsOpen: "7:00 AM", pollsClose: "8:00 PM",
  photoIdRequired: true, officialVoterInfoUrl: "https://myvote.wi.gov/",
  sources: [], lastCheckedAt: 0,
};

describe("voteEn dict", () => {
  test("builds the six logistics FAQs from data", () => {
    const faqs = voteEn.faqs(info, { registration: [["online", "x"]], absenteeRequest: [["by_mail", "y"]], absenteeReturn: [["in_person", "z"]], early: { available: true, start_date: "a", end_date: "b" } });
    expect(faqs.length).toBeGreaterThanOrEqual(6);
    expect(faqs[0].a).toContain("August 11, 2026");
  });
  test("accessText passes through the row fields", () => {
    const row: any = { key: "voter-id", title: "T", summary: "S", details: "D", sources: [], order: 1 };
    expect(voteEn.accessText(row)).toEqual({ title: "T", summary: "S", details: "D" });
  });
  test("deadlineLabel humanizes keys", () => {
    expect(voteEn.deadlineLabel("by_mail")).toBe("by mail");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/components/guide/vote-guide.test.tsx`
Expected: FAIL — `@/lib/i18n/vote-en` not found.

- [ ] **Step 5: Create `src/components/guide/vote-guide.tsx`** — move the JSX body out of `page.tsx`. Signature `VoteGuide({ dict, info, access }: { dict: VoteDict; info: VotingInfo; access: VoterAccessRow[] })`. Rules:
  - Compute `registration`/`absenteeRequest`/`absenteeReturn`/`early` from `info` (the existing `deadlineRows` helper — move it into this file).
  - Build `faqs = dict.faqs(info, {registration, absenteeRequest, absenteeReturn, early})`.
  - Render exactly the current layout, but every literal string comes from `dict` (h1 = `dict.h1`, intro = `dict.intro(info, dict.myVoteLabel)`, checklist labels from `dict.checklist` + `dict.deadlineLabel(key)`, situation heading/blurb from `dict.situation`, sources title `dict.sourcesTitle`).
  - Situation cards: `const t = dict.accessText(row)` → render `t.title`/`t.summary`/`t.details`; sources straight from `row.sources`.
  - JsonLd: `organizationNode()`, `breadcrumbNode([{name: dict.crumbs.home, path: "/"}, {name: dict.crumbs.vote, path: dict.lang === "es" ? "/es/vote" : "/vote"}])`, `faqNode([...faqs, ...voterAccessToFaqs(access.map((r) => ({ title: dict.accessText(r).title, summary: dict.accessText(r).summary }))) ])`.
  - Root: `<main lang={dict.lang} className="mx-auto w-full max-w-3xl px-4 py-10">`.
  - **Toggle:** at the top of `<main>`, render a neo-brutalist chip link: `<Link href={dict.toggle.href} className="...border-2 border-border...">{dict.toggle.label}</Link>`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/guide/vote-guide.test.tsx`
Expected: PASS.

- [ ] **Step 7: Rewire `src/app/vote/page.tsx`** — becomes thin:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteGuide } from "@/components/guide/vote-guide";
import { voteEn } from "@/lib/i18n/vote-en";
import { VOTE_HREFLANG } from "@/lib/i18n/vote-dict";
import { getVoterAccess, getVotingInfo } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: voteEn.meta.title,
  description: voteEn.meta.description,
  alternates: {
    canonical: "/vote",
    languages: VOTE_HREFLANG,
  },
};

export default async function VotePage() {
  const info = await getVotingInfo();
  if (!info) notFound();
  const access = (await getVoterAccess()) ?? [];
  return <VoteGuide dict={voteEn} info={info} access={access} />;
}
```

- [ ] **Step 8: Regression check** — the rendered EN `/vote` must be unchanged. Run `npx tsc --noEmit` (clean) and `npm run build` (the `/vote` route builds). Read the diff of `page.tsx` to confirm no English string was dropped or altered (all moved to `vote-en.ts` verbatim).

- [ ] **Step 9: Commit**

```bash
git add src/lib/i18n/vote-dict.ts src/lib/i18n/vote-en.ts src/components/guide/vote-guide.tsx src/components/guide/vote-guide.test.tsx src/app/vote/page.tsx
git commit -m "refactor(vote): extract VoteGuide + EN dict, reciprocal hreflang (MOO-400)"
```

---

### Task 2: Author the Spanish content (`vote-es.ts`) — CONTROLLER + Tarik gate

> **This task is authored by the controller (like MOO-398's seed content), NOT a code subagent.** The Spanish translations are accuracy-critical civic content.

**Files:**
- Create: `src/lib/i18n/vote-es.ts` (`voteEs: VoteDict`)

- [ ] **Step 1: Author `voteEs`** satisfying the `VoteDict` type — Spanish for every field: `meta`, `h1`, `intro` (localize the primary date: "el 11 de agosto de 2026"), all FAQ builders (Spanish templates around the same data), `deadlineLabel` (`by_mail→por correo`, `in_person→en persona`, `online→en línea`), `checklist`, `situation`, `crumbs`, `sourcesTitle`, `lastUpdatedPrefix`, `myVoteLabel`, `toggle = { label: "English", href: "/vote" }`. `accessText(row)` looks the row up by `row.key` in an internal `ACCESS_ES: Record<string, {title,summary,details}>` covering ALL 8 keys (`voter-id, absentee, election-day, disability, felony-conviction, name-change, id-name-mismatch, homelessness`); fall back to the row's English fields if a key is somehow missing. Draft from the English rows + WEC Spanish civic wording.

- [ ] **Step 2: HUMAN GATE — Tarik verifies the Spanish** before it is wired/deployed. Present the drafted `vote-es.ts` content for review. Do not proceed to deploy on the controller's translation alone.

- [ ] **Step 3: Commit** (after Tarik's verification, or commit as draft and note pending)

```bash
git add src/lib/i18n/vote-es.ts
git commit -m "feat(vote): Spanish translations for /es/vote (MOO-400)"
```

---

### Task 3: `/es/vote` page + sitemap + hreflang tests

**Files:**
- Create: `src/app/es/vote/page.tsx`
- Modify: `src/app/sitemap.ts` (add `/es/vote`)
- Test: `src/lib/i18n/vote-i18n.test.ts` (hreflang reciprocity + ES dict parity)

**Interfaces:**
- Consumes: `voteEs` (Task 2), `VoteGuide` (Task 1), `getVotingInfo`/`getVoterAccess`.

- [ ] **Step 1: Write the failing test** — `src/lib/i18n/vote-i18n.test.ts` (in `src/lib/i18n`, NOT next to the page — it imports the shared constant + dict, never a page module, so it can't drag in `@/lib/data`/`unstable_cache`).

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { VOTE_HREFLANG } from "@/lib/i18n/vote-dict";
import { voteEs } from "@/lib/i18n/vote-es";

const KEYS = ["voter-id","absentee","election-day","disability","felony-conviction","name-change","id-name-mismatch","homelessness"];

describe("hreflang reciprocity (shared source of truth)", () => {
  test("VOTE_HREFLANG has reciprocal en/es + x-default", () => {
    expect(VOTE_HREFLANG).toMatchObject({ en: "/vote", es: "/es/vote", "x-default": "/vote" });
  });
});

describe("ES dict parity", () => {
  test("ACCESS_ES translates all 8 voter-access keys", () => {
    for (const key of KEYS) {
      const row: any = { key, title: "EN-ONLY", summary: "EN-ONLY", details: "EN-ONLY", sources: [], order: 1 };
      const t = voteEs.accessText(row);
      // a translated row must differ from the English passthrough fallback
      expect(t.title).not.toBe("EN-ONLY");
    }
  });
});
```

> Per-page self-canonical (`canonical: "/vote"` vs `"/es/vote"`) is verified by the live curl in Task 4 Step 3, not here — asserting it in a unit test would require importing the page modules (and thus `@/lib/data`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/i18n/vote-i18n.test.ts`
Expected: FAIL — `@/lib/i18n/vote-es` not found (until Task 2 is done).

- [ ] **Step 3: Create `src/app/es/vote/page.tsx`** (mirror of the EN page, ES dict + ES canonical):

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteGuide } from "@/components/guide/vote-guide";
import { voteEs } from "@/lib/i18n/vote-es";
import { VOTE_HREFLANG } from "@/lib/i18n/vote-dict";
import { getVoterAccess, getVotingInfo } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: voteEs.meta.title,
  description: voteEs.meta.description,
  alternates: {
    canonical: "/es/vote",
    languages: VOTE_HREFLANG,
  },
};

export default async function VoteEsPage() {
  const info = await getVotingInfo();
  if (!info) notFound();
  const access = (await getVoterAccess()) ?? [];
  return <VoteGuide dict={voteEs} info={info} access={access} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/i18n/vote-i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `/es/vote` to `src/app/sitemap.ts`** — next to the existing `/vote` entry (line ~21):

```ts
    { url: `${SITE_URL}/es/vote`, changeFrequency: "weekly", priority: 0.7 },
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit` and `npm run build`
Expected: clean; build lists `/es/vote`.

- [ ] **Step 7: Commit**

```bash
git add src/app/es/vote/page.tsx src/app/sitemap.ts src/lib/i18n/vote-i18n.test.ts
git commit -m "feat(vote): /es/vote page + sitemap + hreflang tests (MOO-400)"
```

---

### Task 4: Deploy + verify (Tarik-gated)

**Files:** none.

- [ ] **Step 1: Full sweep**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 2: Deploy** (Tarik-gated — confirm; requires the Spanish content verified in Task 2)

Run: `npx vercel --prod --yes`

- [ ] **Step 3: Verify live**

```bash
# Both 200
curl -sI https://badgerbrief.org/vote | grep -i "^HTTP"
curl -sI https://badgerbrief.org/es/vote | grep -i "^HTTP"
# Reciprocal hreflang present on BOTH (self + other + x-default)
curl -s https://badgerbrief.org/vote    | grep -oE '<link[^>]*hreflang="[^"]*"[^>]*>' | sort -u
curl -s https://badgerbrief.org/es/vote | grep -oE '<link[^>]*hreflang="[^"]*"[^>]*>' | sort -u
# ES page is actually Spanish (not English)
curl -s https://badgerbrief.org/es/vote | grep -oiE 'cómo (votar|voto)|en español|papeleta' | head
# lang attribute + sitemap
curl -s https://badgerbrief.org/es/vote | grep -oE 'lang="es"' | head -1
curl -s https://badgerbrief.org/sitemap.xml | grep -c "/es/vote"
```
Expected: both 200; each page emits `hreflang="en"`, `hreflang="es"`, `hreflang="x-default"` (reciprocal); ES shows Spanish; `lang="es"` present; sitemap lists `/es/vote`.

- [ ] **Step 4: Update Linear MOO-400** to Done with the acceptance evidence.

---

## Self-Review

**Spec coverage:**
- §1 shared VoteGuide + dicts → Task 1 (EN) + Task 3 (ES page) ✓
- §2 VoteDict shape → Task 1 Step 1 ✓
- §3 reciprocal hreflang → Task 1 (EN meta) + Task 3 (ES meta) + tests + Task 4 curl ✓
- §4 language toggle → Task 1 Step 5 (in VoteGuide, from dict.toggle) ✓
- §5 sitemap → Task 3 Step 5 ✓
- §6 tests (dict parity, hreflang, render) → Tasks 1 & 3 ✓
- §7 Spanish content + Tarik gate → Task 2 (controller-authored, human-verified) ✓
- lang="es" → Task 1 Step 5 (`<main lang={dict.lang}>`) + Task 4 verify ✓

**Placeholder scan:** No TBD/TODO. Task 2's Spanish strings are authored at execution time by the controller (accuracy-critical content, explicitly not a code-subagent job) — this is a deliberate human-content step, not a placeholder. Task 1 Step 2 says "copy the strings from page.tsx verbatim" — a verification instruction against the named file.

**Type consistency:** `VoteDict` is the single contract; `voteEn` and `voteEs` both satisfy it (compiler-enforced), so `VoteGuide` consumes either identically. `accessText(row)` signature matches between dict definition, both dicts, and `VoteGuide`'s usage. hreflang `languages` object is identical (`{ en, es, x-default }`) across both pages and both tests.

**Regression guard:** Task 1 is a refactor with an explicit "EN output unchanged" check (Step 8) — the risk is a dropped/altered English string, mitigated by lifting strings verbatim + building + diffing.
