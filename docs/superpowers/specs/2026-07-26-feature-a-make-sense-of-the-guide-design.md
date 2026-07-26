# Feature A — "Make sense of the guide"

**Date:** 2026-07-26 · **Epic:** [MOO-409](https://linear.app/moodyco/issue/MOO-409) (decision-support gap) · overlaps **MOO-414** · **Priority:** High

> Design **approved** in the 2026-07-26 brainstorm (see handoff §2). This spec captures
> that approved design verbatim, grounded in the real files it touches. No re-brainstorm.

## Problem

Voter feedback (James Hart) and the decision-support review: the site *informs* but
doesn't help an undecided voter *make sense of* what it shows. Two concrete gaps:

1. **Jargon with no on-ramp.** Stance labels (support/oppose/mixed/evolving/unclear),
   campaign-finance terms (PAC vs individual $, cash-on-hand), and voting-record terms
   (roll-call, "deciding vote", aye–no) appear with no plain-language explanation. A
   first-time voter hits a wall of terms.
2. **No guided path.** A lost voter lands on the home page and has to self-assemble the
   journey (issues → candidate → how to vote). The pieces exist (`/match`, candidate
   pages, `/vote`) but nothing walks a newcomer through them in order.

## Goal

Help a first-time / undecided voter understand what the guide is showing them, via two
independent, additive pieces:

- **Inline explainers** — tap-to-expand plain-language definitions placed next to the
  confusing concepts, everywhere they appear.
- **A guided path** — an opt-in 3-step framing (`/start` → issues → read a candidate →
  how to vote) that overlays a lightweight rail on existing pages, guest-friendly.

**Non-goals (explicit):** no scoring, ranking, or endorsement; no backend/data/schema
change; no auth or server-side persistence; `/es` deferred (English v1); the "help
improve the guide" contribution pathway is **Feature B**, not this.

## Two independent pieces (can ship/verify separately)

### Piece 1 — Inline explainers (`WhatThisMeans`)

**One reusable component** — `src/components/guide/what-this-means.tsx` (client not
required; renders a native `<details>`), driven by a **neutral content map**.

- **Idiom:** reuse the site's existing `<details>`/`<summary>` pattern (already used on
  the candidate page quotes at `src/app/candidates/[slug]/page.tsx:281`, on compare,
  races, ads, and several `guide/*` components). **No tooltip library** — tap-to-expand,
  works without JS, SSR-safe, keyboard-accessible for free.
- **Props:** `WhatThisMeans({ topic }: { topic: ExplainerTopic })` where `topic` keys
  into the content map. Optional `className` for placement spacing. The summary reads a
  small, quiet "What this means" affordance (info-style, neo-brutalist, not a link color)
  so it never competes with real actions.
- **Content map** — `src/lib/explainers.ts`: `Record<ExplainerTopic, { summary: string;
  body: string; learnMore?: string }>`. `learnMore` is a `/methodology#anchor` (the
  route exists — `src/app/methodology/page.tsx`) or another canonical page. Copy is
  neutral, plain, and carries the no-endorsement framing where relevant (e.g. finance:
  **"money ≠ endorsement"**). This is the only place copy lives — one edit updates every
  placement.

**v1 topics (the confusing concepts):**

| topic key | where it appears | copy gist |
|---|---|---|
| `stance-labels` | candidate `#positions`, compare, `/match` cards | what support / oppose / mixed / evolving / unclear each mean; that they come from *sourced* statements, not our opinion |
| `campaign-finance` | candidate `#money` (FinanceSummary/Detail), `/ads` | PAC vs individual contributions, cash-on-hand; **money is not an endorsement**; link `/methodology` |
| `voting-record` | candidate `#votes` (votingRecordSummary) | what a roll-call vote is, "deciding vote", aye–no meaning; links to methodology |
| `sourced-position-vs-claim` | candidate `#positions`, compare | difference between a position we sourced to a statement vs. a campaign's own claim |

**Placements (v1):**
- **Candidate page** (`src/app/candidates/[slug]/page.tsx`): one `WhatThisMeans` in the
  `#positions` section header area (`stance-labels` + `sourced-position-vs-claim`), one in
  the finance area (`campaign-finance`), one in the votes section (`voting-record`). Guard
  each so it only renders when that section renders (finance only if `finance.length`,
  votes only if `votingRecordSummary`).
- **Compare** (`src/app/compare/[slug]/page.tsx`): `stance-labels` +
  `sourced-position-vs-claim` near the issue rows.
- **`/match` cards** (`src/components/match/*`): `stance-labels` near results.

Deeper material links to `/methodology`; the explainer is the *inline* first touch.

### Piece 2 — Guided path (`/start` + `GuidedRail`)

Opt-in, param-driven, **no persistence backend.**

- **`/start` route** — `src/app/start/page.tsx` (server, static, indexable): intro + the
  3-step framing, then a primary CTA that enters the guided flow at step 1
  (`/match?guide=1`). Plain SEO metadata + JSON-LD breadcrumb like other new routes.
- **`GuidedRail`** — `src/components/guide/guided-rail.tsx` (client), mounted once in the
  root layout (`src/app/layout.tsx`) right after `<SiteHeader/>`, inside `<Providers>`.
  It renders **only when `?guide=<step>` is present** in the URL (reads
  `useSearchParams()` — needs a `<Suspense>` boundary to stay statically prerenderable,
  per the session gotcha). When absent, it renders `null` and costs nothing.
- **Rail UI:** a slim bar — "Step X of 3 · <label>", a back and a next control. It
  **carries the `guide` param through navigation** so the flow survives clicking into a
  candidate. Guest-friendly, no login, no state stored anywhere but the URL.
- **Steps:**
  1. **Ballot + issues** → `/match?guide=1` ("Pick what matters to you.")
  2. **Read a candidate** → `/match?guide=2` framing, with a callout pointing at the
     inline `WhatThisMeans` explainers ("Tap 'What this means' to decode the labels.").
     Next lands the voter on candidate/compare surfaces with `?guide=2` preserved.
  3. **How to vote** → `/vote?guide=3` ("Now make your plan to vote.")
  - **Finish:** a short done state (e.g. `?guide=done` or step 3's next) — a thank-you +
    links to `/match`, `/vote`, and (later) Feature B's contribute path.
- **Entry point:** a "New here? Start here →" affordance in the home hero
  (`src/components/guide/home-guide.tsx`, alongside the existing `/match`, `/vote`,
  governor CTAs) deep-linking `/start`.

## Architecture

Purely additive presentation. No Convex query, no schema, no data change, no auth.

- **State lives in the URL** (`?issues=`, `?guide=`) — shareable, reload-safe, SSR-safe,
  guest-friendly. `GuidedRail` and the step links read/write the `guide` param only.
- **`WhatThisMeans`** is a dumb component over a static content map — the map is the
  single source of truth for the copy.
- **Reuse over rebuild:** `<details>` idiom, `/methodology` route, home hero CTA slot,
  candidate/compare/match sections all already exist; this feature slots into them.

## Files

- Create: `src/components/guide/what-this-means.tsx`, `src/lib/explainers.ts`
- Create: `src/app/start/page.tsx`, `src/components/guide/guided-rail.tsx`
- Modify: `src/app/layout.tsx` (mount `GuidedRail` in a `<Suspense>` after header)
- Modify: `src/app/candidates/[slug]/page.tsx` (3 explainer placements, section-guarded)
- Modify: `src/app/compare/[slug]/page.tsx` (explainer placement)
- Modify: `src/components/match/*` (explainer placement + carry `guide` param)
- Modify: `src/components/guide/home-guide.tsx` (`/start` hero entry)
- Test: `src/lib/explainers.test.ts` (content-map integrity), and a small render/guard
  test for `GuidedRail` param behavior.

## Error handling / edge cases

- **`GuidedRail` with no `guide` param** → renders `null` (the common case; every page
  load without the param pays nothing).
- **Invalid/out-of-range `guide` value** (`?guide=9`, `?guide=abc`) → treat as absent;
  don't render a broken rail.
- **`WhatThisMeans` for a section that isn't present** → not rendered at all (placement is
  guarded by the same condition as its section).
- **`useSearchParams()` without Suspense** → build/prerender breaks under `revalidate`;
  the rail mount **must** be wrapped in `<Suspense>` (known session gotcha).
- **Missing content-map entry** → a unit test asserts every `ExplainerTopic` used in the
  codebase has a map entry, so a typo can't ship an empty explainer.

## Non-partisan guardrails (explicit)

- Explainer copy is neutral and definitional only — it explains *what a term means*, never
  *what to think*. Finance explainer states "money ≠ endorsement" outright.
- The guided path frames the *process* (pick issues → read → vote); it never recommends a
  candidate, orders candidates by merit, or scores anything.

## Testing

- **Unit — content-map integrity** (`src/lib/explainers.test.ts`, node env): every
  `ExplainerTopic` in the union has a `{summary, body}` entry; any `learnMore` is a
  same-origin path (starts with `/`). Guards against empty/broken explainers.
- **Unit — `GuidedRail` param logic:** renders `null` with no `guide` param; renders
  "Step 2 of 3" for `?guide=2`; treats `?guide=9`/`?guide=abc` as absent. (Pure
  step-parse helper unit-tested; component render optional.)
- **Manual/live** (after deploy): home "Start here" → `/start` → step 1 `/match?guide=1`
  rail shows "Step 1 of 3"; param survives clicking into a candidate; tapping
  "What this means" expands each explainer on candidate/compare/match; no body horizontal
  scroll at 375px; a page loaded *without* `?guide=` shows no rail.

## Dependencies / scope

- **No dependency** on MOO-413 data coverage — this is presentation over whatever data
  exists.
- **Out of scope:** `/es` locale variant (English v1; defer with the i18n thread),
  server-side persistence of guided-path progress (URL param is enough), any
  scoring/endorsement, and the Feature B contribution pathway.
- **Splittable:** Piece 1 (explainers) and Piece 2 (guided path) are independent and can
  be planned/shipped/verified separately if desired.
