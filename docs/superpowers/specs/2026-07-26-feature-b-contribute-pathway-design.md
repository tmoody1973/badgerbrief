# Feature B — "Help improve the guide" contribution pathway

**Date:** 2026-07-26 · **Epic:** [MOO-409](https://linear.app/moodyco/issue/MOO-409) (decision-support gap) · **Priority:** Med

> Design **approved** in the 2026-07-26 brainstorm. Builds on the existing `feedback`
> infrastructure — no new table, no new backend plumbing.

## Problem

Voter feedback (James Hart): an engaged supporter who wanted to help improve the guide had
no path to — the only get-involved surface is `/feedback` ("Report an error or ask a
question"), framed narrowly as error reports, and the money paths (Ko-fi, GitHub Sponsors)
don't fit a non-monetary contributor. The guide captures error reports but not the goodwill
of someone who wants to add a candidate, point at a source, flag a thin page, or help.

## Goal

Give an engaged voter real, **non-monetary** ways to contribute — **suggest a
candidate/source, flag a data gap, volunteer, share** — routed into the **existing human
editorial pipeline**. No auto-publishing, no public display of submissions, no endorsement,
no scoring.

## Decisions (from brainstorming)

- **All four paths in v1:** suggest a candidate/source, flag a data gap, volunteer/get
  involved, share/spread the word. Money stays with Ko-fi/Sponsors (linked, not rebuilt).
- **Surface = dedicated hub + contextual entries** (best conversion — catch the voter at
  the moment they notice a gap).
- **Route:** `/contribute`. **i18n:** English v1; `/es` deferred (matches Feature A).

## Architecture

Reuse the `feedback` table + `feedback.submit` mutation + the `/admin` feedback review
queue. The three intake paths are new `kind`s on the existing enum; "share" is a
zero-backend client affordance. No new table, no new dependency.

### 1. Backend — extend `feedback` (`convex/schema.ts` + `convex/feedback.ts`)

- **`kind` union** gains: `suggest_candidate`, `suggest_source`, `data_gap`, `volunteer`
  (alongside `correction` / `question` / `other`). Backward-compatible — existing rows keep
  their kinds.
- **`feedback.submit`** already accepts `message` (min 10 / max cap), optional `pageUrl`
  (auto), optional `sourceUrl`, optional `contact`, and a `website` **honeypot** (anti-spam
  — reuse it on the new forms). Extend the `kind` validator to the new literals. Adapt the
  existing "correction requires `sourceUrl`" rule so `suggest_source` also requires a
  `sourceUrl` (a source suggestion without a link is noise), while `data_gap` /
  `suggest_candidate` / `volunteer` do not. `volunteer` should have `contact` (else there's
  no way to follow up) — validate `contact` present for `volunteer`.
- **`/admin` review** (`src/components/admin/feedback-queue.tsx`): surface the new kinds in
  the filter + labels so contributions land in the same queue Tarik already triages
  (status new → reviewed → resolved). Display `sourceUrl`/`contact`/`pageUrl` where present.

### 2. Hub page — `/contribute` (`src/app/contribute/page.tsx`, server, static, indexable)

Neo-brutalist page titled "Help improve the guide." Sections:
- Short honest intro (nonpartisan, human-reviewed, we never auto-publish).
- The intake paths → a client `ContributeForm` (`src/components/contribute/contribute-form.tsx`)
  that reuses `feedback.submit`. One form with a kind selector (suggest candidate / suggest
  source / flag a gap / volunteer), showing the fields each kind needs (message always;
  `sourceUrl` for suggest_source; `contact` for volunteer; `pageUrl` optional/prefilled).
  Reuse the `/feedback` form's field/validation idiom (min-length, honeypot, success state).
- **Share** section → the shared `ShareButton` (below) for the guide itself.
- A "support the project" note linking existing Ko-fi / GitHub Sponsors (not rebuilt).
- SEO metadata + canonical `/contribute` (plain canonical, no hreflang — EN v1, mirror the
  `/start` route convention verified in Feature A).

### 3. Contextual entries (the conversion win)

- **Candidate & race pages** (`src/app/candidates/[slug]/page.tsx`,
  `src/app/races/[slug]/page.tsx`): a quiet "Suggest a source · Flag a gap" affordance
  (reuse the `<details>`/link idiom, `font-mono` quiet style) that deep-links to
  `/contribute?kind=data_gap&ref=<slug>` (or `kind=suggest_source&ref=<slug>`). The hub
  reads `?kind` + `?ref` (client `useSearchParams`, under `<Suspense>`) to **prefill** the
  form's kind and a "re: <slug>" context line. Place it near the sources/footer of the page
  (low-emphasis — it must not compete with reading).
- **ShareButton** (`src/components/contribute/share-button.tsx`, client) on race + candidate
  pages and the hub: `navigator.share(...)` when available (mobile), else fallback to
  copy-link + prebuilt X / Facebook share links. Zero backend, zero deps.

### 4. Entry points

- **Footer** (`src/components/guide/chrome.tsx` + `chrome-en` dict): add a "Help improve
  this guide" link to `/contribute` next to the existing "Report an error" / "Support"
  links (EN dict key; gate to EN or add an ES key — EN v1).
- Optional: a line on `/about`. Not required for v1.

## Data flow

`/contribute` (server shell) → `ContributeForm` (client, reads `?kind`/`?ref` to prefill) →
`feedback.submit({ kind, message, sourceUrl?, contact?, pageUrl?, website })` → `feedback`
table (`status: "new"`) → `/admin` feedback queue → Tarik triages (reviewed/resolved) → acts
on it via the normal editorial/research pipeline (a source suggestion informs a
`research.run`; a candidate suggestion informs data entry). Share = client-only, no submit.

## Error handling / edge cases

- **Validation:** message min-length (reuse existing); `suggest_source` requires a
  `sourceUrl`; `volunteer` requires `contact`; honeypot `website` must be empty (silent
  drop on fill, as today). Friendly inline errors, success confirmation state.
- **Prefill:** unknown/invalid `?kind` → default the selector to "suggest a source" (don't
  crash); `?ref` is display-only context, sanitized to a slug, never trusted as a link.
- **`useSearchParams` under `<Suspense>`** (Feature A gotcha) for the prefill.
- **No PII display:** submissions (incl. `contact`) are admin-only; nothing renders publicly.
- **Spam:** honeypot + min-length are the v1 wall (same posture as `/feedback`); no captcha.

## Non-partisan guardrails

- Nothing a contributor submits is auto-published or displayed — it enters the same
  human-reviewed queue as error reports. No scoring, no endorsement, no ranking.
- Copy frames contribution as *improving coverage completeness*, never as advocacy.

## Testing

- **Unit** — the `feedback.submit` validation for the new kinds (Convex mutation test,
  extend `convex/feedback.test.ts` if present): `suggest_source` without `sourceUrl` throws;
  `volunteer` without `contact` throws; a valid `data_gap` inserts with `status:"new"`;
  honeypot-filled submit is dropped.
- **Unit** — a pure `parseContributeKind(raw)` helper (like Feature A's `parseGuideStep`)
  mapping `?kind` → a valid kind or the default; tested for the invalid/absent cases.
- **Manual/live** (after deploy) — the hub renders and each path submits into the `/admin`
  queue; a candidate-page "flag a gap" deep-links with kind+ref prefilled; ShareButton uses
  the native sheet on mobile and copy/social fallback on desktop; no body horizontal scroll
  at 375px; `/es` shows no EN-only contextual affordance.

## Dependencies / scope

- **No new dependency, no new table.** Reuses `feedback` end-to-end.
- **Out of scope:** volunteer *coordination* tooling (v1 is intake + contact only), public
  display of submissions, auto-publishing, captcha, `/es` locale variant (defer with i18n
  thread), and any change to Ko-fi/Sponsors (linked as-is).
- **Splittable if desired:** (A) backend kinds + hub + forms; (B) contextual entries +
  ShareButton. Independent.
