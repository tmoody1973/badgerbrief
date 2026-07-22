# Sponsor Intelligence — design

**Date:** 2026-07-22
**Goal:** Let voters understand *who's really behind* an advertiser/PAC and *who it supports or attacks* — beyond today's one-sentence profile — with a dedicated public sponsor page, enriched from OpenFEC + Firecrawl, published under a trust-tiered gate.

## Problem

BadgerBrief already tracks political ads and their sponsors, but a voter only ever sees a thin one-sentence profile (kind, partisan lean, a Perplexity-sourced summary) inside the TV tracker. They can't answer the questions that matter most: *Who funds this group? What's its agenda? Who does it back and attack?* — least of all for opaque dark-money 501(c)(4)s, which are exactly the groups voters most need explained.

## Current state (verified)

- **`sponsors` table** (`convex/schema.ts`): `key`, `displayName`, `kind`, `lean` (`supports_d|supports_r|bipartisan|issue`), `summary`, `fecCommitteeId`, `disclosesDonors`, `topDonors[{name,amount}]`, `totalRaised`, `sources[{label,url}]`, `reviewStatus` (`draft|approved`), `updatedAt`; index `by_key`.
- **`convex/sponsors.ts`**: `searchFecCommittees`, `getFecCommittee`, `perplexityDescribe` (Perplexity `sonar`, `PERPLEXITY_API_KEY`), `lookupSponsor` (action: FEC + Perplexity, fills a draft — never auto-saves), `saveSponsor`, `sponsorForName`, `approvedForNames` (public; returns only `reviewStatus==="approved"`).
- **`convex/lib/sponsors.ts`**: `normalizeSponsorKey`, `fecCommitteeKind`, `leanFromParty`.
- **`ads` table**: `pageOrCommittee` (sponsor), `candidateSlug`, `raceId`, `stance` (`support|oppose`), `spendLower/Upper`, `platform`.
- **Public surface today**: a "Who is this?" `<details>` in `src/components/guide/tv-ad-tracker.tsx`; race pages consume `approvedForNames`. **No per-sponsor route exists.**
- **Available infra**: OpenFEC (`OPENFEC_API_KEY`), Firecrawl (already used in `convex/qa.ts`, `siteMap.ts`, `research.ts`, `monitor.ts`, `lib/campaignMap.ts`), Perplexity. Tests are fixture-first with vitest.

## Design

One enrichment pipeline writes a `sponsors` profile in **three trust tiers**; a new public `/sponsors/[key]` page renders them. The tiers *are* the publish gate:

| Tier | Source | Trust | Publishes |
|---|---|---|---|
| **Exact facts** | OpenFEC — committee totals, top donors (Schedule A), kind | Verbatim from FEC | **auto** |
| **Support/attack scorecard** | your own `ads` data + OpenFEC Schedule E (independent expenditures) | Your tracked ads + FEC | **auto** |
| **Narrative — "who's behind it"** | Firecrawl `/extract` over a curated civic-source allowlist | AI-drafted, source-pinned | **human-gated** |

Rationale: for a nonpartisan guide, structured facts should never wait on a human, and AI-synthesized prose should never publish without one. OpenFEC is the authoritative source for the money and the national for/against record; Firecrawl earns its place on the *narrative* (mission, funders, leadership) and especially on dark-money 501(c)(4)s via ProPublica's Form 990s.

### 1. Data model — extend `sponsors`

Add (all optional, additive — no migration of existing rows required):

- `narrative: string` — the gated 2–4 sentence "who's behind it" paragraph (distinct from the short `summary`, which stays for inline cards).
- `narrativeStatus: "draft" | "approved"` — **the gate.** Absent → no narrative yet.
- `leadership: [{ name: string, role: string }]` — officers/key people (gated with the narrative).
- `totalSpent: number` — from OpenFEC totals.
- `independentExpenditures: [{ candidate: string, office?: string, supportOppose: "support" | "oppose", amount: number }]` — Schedule E summary, top ~10 by amount (auto).
- `financialsAsOf: string` — FEC cycle/date stamp for the "as of" line.
- `enrichedAt: number` — last enrichment run.

**Gate reconciliation:** the existing `approvedForNames` and `reviewStatus` are left intact for the current inline `summary` display (backward compatible). The new page uses a new query (below) whose contract is: **exact facts + scorecard whenever present; `narrative`/`leadership` only when `narrativeStatus==="approved"`.** A row becomes publicly page-worthy once `enrichedAt` is set — facts do not wait on human review.

### 2. Enrichment pipeline (new, isolated, fixture-testable)

- **`convex/lib/openfecEnrich.ts`** — pure shaping over OpenFEC responses:
  - `fetchCommitteeTotals(id)` → `{ totalRaised, totalSpent, financialsAsOf }` (`/committee/{id}/totals/`).
  - `fetchTopDonors(id)` → `topDonors[]` (Schedule A, sorted by amount; top ~10).
  - `fetchIndependentExpenditures(id)` → `independentExpenditures[]` (Schedule E, grouped by candidate + support/oppose, summed; top ~10).
  - `disclosesDonors` = whether the committee files Schedule A (FEC filer ⇒ true; a non-filing 501c4 ⇒ false ⇒ the civic headline "does not disclose its funders").
- **`convex/lib/firecrawlSponsor.ts`** — narrative extraction:
  - `buildSourceUrls(name)` → curated allowlist: OpenSecrets, Ballotpedia, **ProPublica Nonprofit Explorer (Form 990)**, Wikipedia, and the group's own site when known.
  - `extractNarrative(urls, name)` → Firecrawl `/extract` with a JSON schema `{ narrative, leadership[], sources[{label,url}] }`, each fact grounded in a scraped page.
- **`convex/sponsorEnrich.ts`** — orchestration:
  - `enrichSponsor({ key | advertiser, fecCommitteeId? })` action: resolve FEC committee → OpenFEC exact facts (write, auto-published) + Firecrawl narrative (write as `narrativeStatus:"draft"`) + `perplexityDescribe` fallback when Firecrawl yields no narrative. Sets `enrichedAt`.
  - `enrichSponsorsBySpend({ limit, staleDays })` batch action: enriches outside groups prioritized by tracked spend, skipping candidates' own committees and rows enriched within `staleDays`. Idempotent; safe to re-run; wired to a monthly cron.

### 3. Support/attack scorecard (derived — no new storage)

- **`sponsorScorecard(key)` query**: over `ads` where `normalizeSponsorKey(pageOrCommittee)===key`, group by `candidateSlug` + `stance`, sum spend midpoints → `{ supported:[{candidate, race, spend, adCount}], attacked:[…] }`, each linking to the candidate/race page. This is "who they support" from *your own* sourced data. The stored `independentExpenditures` renders as a secondary "nationally, also spent for/against…".

### 4. Public page — `/sponsors/[key]` (new route, server-rendered, neo-brutalist)

Slug = `key` with spaces→hyphens (reversed on the route). New queries: `sponsorPublicProfile(key)` (tiered contract above), `sponsorScorecard(key)`, `sponsorAds(key)`.

Sections (DESIGN.md tokens; every fact links to its source):
1. **Header** — `displayName` · `kind` badge · `lean` · dark-money warning when `disclosesDonors===false`.
2. **Who's behind it** — `narrative` + `leadership` + sources, **only when `narrativeStatus==="approved"`**; otherwise a quiet "Profile in review" line (facts below still render).
3. **The money** — `totalRaised`/`totalSpent`, `topDonors`, or "does not disclose its funders" for dark money; FEC "as of" stamp + link.
4. **Who they support / attack** — the scorecard (Wisconsin, from your ads) + national independent expenditures.
5. **Their tracked ads** — this sponsor's ads (reuse the existing ad card).

Inline cards (`tv-ad-tracker`, `ads-browser`, race money) gain a **"Who is this? →"** link into the page.

### 5. Admin — extend `SponsorResolver` for the tiered gate

- "Look up" runs the full `enrichSponsor`. Exact facts + scorecard render **read-only** (auto-published already). The reviewer edits and approves **only the narrative draft** (flips `narrativeStatus → "approved"`).
- A "narratives pending review" list (rows with `narrativeStatus==="draft"`) so reviewers can work the queue; surfaced via `admin-tabs`.

### 6. Scope & cost

- Every sponsor gets a page (facts auto). **Narrative enrichment targets outside groups** (excludes candidates' own committees by `kind`), **prioritized by spend.**
- Firecrawl runs **once per sponsor, cached** in the table, refreshed monthly — bounded, never per-pageview. OpenFEC is free. Perplexity is the cheap fallback.

## Testing (fixture-first, matching MOO-318)

- Fixtures for OpenFEC (totals, Schedule A, Schedule E) and a Firecrawl `/extract` response → unit-test the shaping libs.
- Unit-test the scorecard rollup (sponsor → supported/attacked with summed spend).
- Unit-test the tiered-gate query: `narrative`/`leadership` hidden when `narrativeStatus!=="approved"`, exact facts always present.

## Non-goals (YAGNI)

- No national donor-network graph or cross-sponsor relationship mapping.
- No per-pageview re-scraping (enrichment is cached + monthly-refreshed).
- No auto-approval of narratives; no coverage of non-political advertisers.
- No change to the existing `approvedForNames` inline-summary path beyond adding the "Who is this? →" link.

## Success criteria

A voter landing on `/sponsors/[key]` can, for a tracked outside group, see in plain language: what kind of group it is, whether it discloses its funders (and its top donors / total raised when it does), who it backed and attacked in Wisconsin and nationally, and a source-pinned "who's really behind it" narrative — with every claim traceable to FEC, ProPublica, or a named civic source, and the AI narrative never public until a human approves it.
