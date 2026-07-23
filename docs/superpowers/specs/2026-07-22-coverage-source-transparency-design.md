# Coverage & Source Transparency — v1 design

**Status:** Approved design (brainstorm), ready for implementation plan
**Date:** 2026-07-22
**Owner:** Tarik Moody
**Parent:** BadgerBrief — Wisconsin Voter Guide
**North star:** the full "Coverage Compare" PRD (`~/Downloads/Election Coverage & Bias-Comparison PRD`). This spec is **v1 = that PRD's Phase 1, re-weighted transparency-first**. The PRD's Bias Bar + semantic clustering + 3-column comparison + licensed multi-provider bias averaging are **v2/v3**, explicitly out of scope here.

---

## 1. Why this shape (the decisions this spec locks)

BadgerBrief's identity is "here's the source, decide for yourself." A Ground News-style coverage feature is that mission extended — but the naive version (lead with left/center/right bias bars) has three problems for *this* product:

1. **Brand risk** — the moment BadgerBrief itself assigns a bias label, it has editorialized. Bias labels must be **third-party and attributed**, never BadgerBrief's own judgment.
2. **Local coverage gap** — AllSides/Ad Fontes/MBFC rate national outlets; BadgerBrief's real sources (Wisconsin Watch, Urban Milwaukee, WPR, WisPolitics, Journal Sentinel) come back **Unrated**. A bias-first feature is empty exactly where it matters.
3. **Licensing cost** — those providers require paid commercial licenses before launch. A one-person beta shipping before the Aug 11 primary can't gate on that.

**Therefore v1 leads with source *transparency* — ownership, funding, outlet type — which is public data, free, covers local outlets, and reuses the sponsor-intelligence pattern already built.** Third-party bias/factuality badges appear **only where a rating already exists**, attributed, `Unrated` otherwise (never defaulted to Center). This is more defensible, more locally complete, and shippable without licensing deals.

Locked decisions:
- **Surfaces:** A ("In the News" on race/candidate pages) + B (`/news` hub). Same pipeline, two reads.
- **Perspective layer:** transparency-first (ownership/funding/type primary; third-party bias secondary, where rated).
- **Gating:** tiered — hub auto-aggregates (links + transparency, zero BadgerBrief claims); entity pages show human-approved only.
- **Data model:** extend `article_sources`; add `outlets`. No `articles`/`story_clusters` tables in v1.

---

## 2. Scope

### In v1
- "In the News" module on race + candidate pages (approved articles only).
- `/news` hub: filterable reverse-chron feed of tracked WI-election coverage (auto-aggregated, relevance-filtered).
- `outlets` transparency records (ownership · funding · type) + attributed third-party bias/factuality badges where they exist.
- "How we handle coverage" methodology page.

### Explicitly NOT in v1 (→ v2/v3, per PRD phasing)
- Bias Bar / coverage-mix visualization
- Semantic story clustering, 3-column L/C/R comparison view
- Licensed multi-provider bias averaging (AllSides + Ad Fontes + MBFC)
- Follow-race coverage notifications
- Article-level (vs. outlet-level) bias scoring

### Non-goals (permanent, from PRD)
- Never ranks candidates or recommends a side.
- Never generates its own bias ratings.
- Not a general-news product — WI-election-relevant content only.

---

## 3. Data model (extends the real schema)

Current relevant tables: `article_sources` (per-candidate discovery), `sources`, `ads`, `sponsors`.

### 3.1 `article_sources` — extended
- `candidateSlug` → **optional** (allow race-level and statewide-only coverage for the hub).
- `raceId` → **optional** (statewide election news tied to no single race).
- add `outletKey: string` — normalized link to `outlets` (mirror `normalizeSponsorKey`).
- add `hubStatus: "auto" | "hidden"` — hub visibility, **independent** of the existing entity `status: "proposed" | "approved" | "rejected"`.
- add `relevanceScore?: number` and `relevanceReason?: string` — from the relevance gate.
- Keep `by_url` (dedup), `by_candidate`, `by_status`; add `by_hubStatus` and `by_race` (raceId) for the hub feed.

**Gating invariant:** an article is visible on the `/news` hub iff `hubStatus === "auto"`; visible in "In the News" on an entity page iff `status === "approved"`. The two flags never imply each other.

### 3.2 `outlets` — new
```
outlets: {
  key: string,              // normalizeOutletKey(name|domain) — unique
  displayName: string,
  domain?: string,
  type: "nonprofit" | "public_media" | "corporate_daily" | "wire"
      | "trade" | "tv" | "national" | "other",
  ownership?: string,       // "Owned by Gannett", "independent nonprofit"
  fundingNote?: string,     // "reader donations + grants", "advertising"
  ownershipSourceUrl?: string,
  thirdPartyRatings?: Array<{
    provider: "AllSides" | "AdFontes" | "MBFC" | "NewsGuard",
    biasBand?: string,      // provider's own label, verbatim
    factuality?: string,
    url: string,            // link to the rater's page for this outlet
    fetchedAt: number
  }>,
  reviewStatus: "draft" | "approved",
  enrichedAt?: number,
  updatedAt: number
}  // index: by_key
```
Populated **sponsor-intelligence style**: auto-enrichment (Firecrawl/Perplexity) drafts ownership/funding/type + any findable third-party ratings; human approves before public display. Bias/factuality fields hold the provider's own words, shown **only** with attribution + link — never restated as BadgerBrief's view. Unrated → no badge, explicit `Unrated source` tag.

---

## 4. Ingestion + tiered gating flow

1. **Discover** — reuse `scout`; broaden its query set beyond per-candidate to also pull **race-level** and **statewide** WI-election coverage.
2. **Relevance gate** — cheap classifier: is this WI-election-relevant and tied to a tracked race/candidate/ballot measure? Writes `relevanceScore`/`relevanceReason`. Fail → dropped, never surfaces.
3. **Outlet resolve** — compute `outletKey`; upsert/attach `outlets` row; if new, queue for transparency enrichment (`reviewStatus: "draft"`).
4. **Publish (tiered):**
   - Passing relevance → `hubStatus: "auto"` → live on `/news` (link + outlet transparency only; **no BadgerBrief-authored claim about the article**).
   - Entity "In the News" requires the existing human review → `status: "approved"`.
5. **Moderation** — hub is moderated for *takedowns* (`hubStatus: "hidden"`), not approvals.

**Editorial-risk rationale:** aggregating a link (attributed headline + outlet + transparency card) makes no BadgerBrief factual claim, so auto-publishing to the hub does not violate the "never state a fact you didn't get from a source" rule. The higher bar (human approval) applies only where an article sits next to a specific person on an entity page.

---

## 5. UI

- **`SourceTransparencyCard`** (reusable) — leads with **ownership + type** ("Wisconsin Watch · nonprofit newsroom · reader-funded"); then third-party bias/factuality badges **if rated** ("Rated Center by AllSides ↗") or an `Unrated source` tag. Always attributed + linked to the rater. Never a merged "trust score." `last synced` shown when a rating exists.
- **`InTheNews`** (race + candidate pages) — approved articles for this entity: headline, outlet, timestamp, `SourceTransparencyCard`, "Read at [outlet] ↗" outbound. Never mirrors full article text.
- **`/news` hub** — reverse-chron feed; filters by race, outlet type, and (where available) bias band. **`Unrated` is a first-class filter value**, never hidden.
- **Methodology page** ("How we handle coverage") — plain language: what we track, that we don't self-rate, where transparency data comes from, refresh cadence, how to report an error. Permanent surface, linked from every coverage module.

### Brand rules (adopted from PRD §10)
- No red/blue as the coverage palette; use BadgerBrief's neutral system.
- Color never the sole signal — always a text label (WCAG AA; screen-reader reads full state).
- Copy describes **coverage**, not **candidates**.
- Show what exists — never fabricate balance or a 0% bar.

---

## 6. Edge states + testing

### Edge states
- **Unrated outlet** → transparency card still shows ownership/type (the whole point of transparency-first); `Unrated source` tag, no bias badge.
- **No coverage** → honest empty state ("We haven't found tracked coverage for this race yet"), never a fabricated count.
- **Stale rating** → `last synced [date]` shown; a staleness flag (>30d) queues a re-check.
- **Duplicate URL** → deduped on `by_url`.
- **New/unknown outlet** → article can still hub-publish with a minimal outlet stub; transparency card shows "outlet profile pending."

### Testing
- **Unit:** relevance gate; `normalizeOutletKey` (mirror `normalizeSponsorKey` tests); tiered-gating invariant (a `hubStatus:"auto"` row must NOT appear on an entity page until `status:"approved"`, and vice-versa).
- **Integration:** scout → relevance → outlet-resolve → publish, asserting hub vs. entity visibility.
- **Reuse:** transparency enrichment rides the sponsor pipeline's existing test patterns.
- Test command is `npx vitest run <file>` (repo has no `pnpm test`).

---

## 7. Reuse map (what already exists)

| Need | Reuse |
|---|---|
| Article discovery | `scout` / `article_sources` (MOO-322) — broaden queries |
| Outlet enrichment pattern | sponsor intelligence (`sponsorEnrich`, Firecrawl/Perplexity → review) |
| Key normalization | `normalizeSponsorKey` → `normalizeOutletKey` |
| Human-review workflow | existing `article_sources` status + admin queue |
| Tiered/attributed-source ethos | sponsor tiered gate (facts auto, narrative human-gated) |

---

## 8. Open questions (non-blocking for v1)

- Which single third-party rating source (if any) to opportunistically show in v1 where a free/attributable rating exists, vs. defer all bias badges to v2. (Default: show only ratings we can display with attribution at no license risk; otherwise ship transparency-only and add bias in v2.)
- Relevance-gate model/threshold tuning (post-launch).
- Outlet-type taxonomy final list (start with the 8 above; extend as real outlets arrive).
