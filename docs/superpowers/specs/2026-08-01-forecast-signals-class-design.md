# /forecast as a forecasting class — design spec (v1)

**Date:** 2026-08-01
**Status:** Approved (design); pending implementation plan
**Builds on:** the live `/forecast` page (poll aggregation + win-probability + social reach). See `docs/HANDOFF-2026-07-31-forecast-social.md`.

---

## Goal

Turn `/forecast` from an interactive poll-aggregation view into a **plain-English class on how election forecasting works** — and extend the model from polls-only into a **multi-signal "fundamentals-plus-polls" blend** (the FiveThirtyEight "polls-plus" approach). The page must teach a voter to *think differently about how data in politics is used*, not hand them a prediction.

### The teaching spine (non-negotiable framing)

**A forecast is a disagreement detector, not a prediction machine.** Every data source is a witness that lies in a known way. The skill is knowing *how* each witness lies, putting them in one room, and watching where they disagree. The page earns the lesson through interaction, never through a lecture or a single winner number.

Concrete hook (this race, live numbers): the field looks like a different race depending on the witness — Hong dominates polls (~72%, ~94% in the sim) *and* social reach (163,808 = 76% of the Dem field), yet the hashtag footprint looks nearly even, and ad spend / news tone may tell yet another story.

---

## Scope

### v1 signals (this spec)
1. **Polls** (outcome signal) — live already.
2. **Social reach** (leading indicator) — live already.
3. **Ad spend** (leading indicator, revealed belief) — live already.
4. **News-mention tone** (earned-media signal) — the one new build.
5. **Turnout** (structural layer) — WEC historical base rate, as framing + a scenario control.

### Explicitly NOT in v1 (clean v2 slot-ins; the Act-2/Act-3 framework is signal-agnostic)
- Campaign fundraising (needs a finance pull)
- Hashtag *volume* (needs a search + regex-extract + aggregate pipeline; the existing `wi_governor_2026_hashtags.json` is a static, hand-observed rank/tier snapshot — NOT volume, cannot be summed)
- Facebook reaction sentiment (Like/Love/Haha/Angry — gated on the SocialFetch probe confirming the reaction breakdown is available)
- Engagement rate (Task D — gated on SocialFetch credits + the `/posts` endpoint probe)

---

## Architecture — approach C (hybrid)

The three already-live signals stay **live client-side reads + normalize-in-browser**, so the weight sliders respond instantly. Only **news tone** gets a small server-side piece (LLM classification can't run in the browser). Turnout is a static constant. The weight-blend and the leader-flip interaction are all client-side.

```
Act 1 (polls + sim)        →  existing forecast.ts logic, unchanged
Act 2 (meet the witnesses) →  4 signals → toShares() → side-by-side share bars
Act 3 (you be forecaster)  →  weight sliders → blend() → re-ordered field (no number)
                              turnout scenario → applyTurnoutTilt()
```

---

## Component 1 — the math contract: `src/lib/signals.ts`

Pure, unit-tested module beside `forecast.ts`. This is the load-bearing piece; it encodes the honesty rule.

- `toShares(values: Record<slug, number>): Record<slug, number>`
  Normalize any raw signal to share-of-field (each value ÷ field total). Handles an all-zero / empty field (returns zeros, no divide-by-zero). **This is the rule in code: raw dollars, followers, and tone are never added — only their shares are.**
- `blend(shares: Record<signal, Record<slug, number>>, weights: Record<signal, number>): Record<slug, number>`
  Weighted average of per-signal shares. Weights renormalize to sum 1 over the signals that actually have data. Returns a *relative* index used only for ordering + bar length.
- `rank(blended): Array<{slug, value}>` — ordered leaderboard for the re-order display.
- `applyTurnoutTilt(shares, scenario): Record<slug, number>`
  Coarse reshape of the field by a turnout-propensity profile (e.g. "small hardcore electorate" downweights candidates whose strength is young/online). Documented in-code and in-copy as **illustrative, not rigorous** — we have no turnout crosstabs from these thin polls.

## Component 2 — signal sources (data flow)

| Signal | Source (existing unless noted) | To shares |
|---|---|---|
| Polls | `api.pollsQueries.forRace` → `parsePrimaryPolls` → `aggregate` | per-candidate standing |
| Social reach | `api.social.socialForRace` | sum followers per candidate |
| Ad spend | `api.adMoney.adMoneyForRace` | per-candidate spend midpoint |
| News tone | `api.newsTone.newsToneForRace` (NEW) | per-candidate net-positive story share |

## Component 3 — news-tone classifier: `convex/newsTone.ts` (only new backend)

Source rows: `article_sources` (MOO-322) — per-candidate approved stories with `headline`, `whyRelevant`, `outlet`, verified `publishedAt`, `candidateSlug`, `relevanceScore`.

- `classifyPendingArticles` (internal action; cron or on-demand): for approved `article_sources` rows lacking a tone, send `headline` + `whyRelevant` to the project's existing LLM (the /chat + editorial stack, sonnet-tuned) with a strict rubric → `{ tone: "positive" | "neutral" | "negative", confidence: number, rationale: string }`. The rubric is anchored to **tone toward THIS candidate** so "Hong slams Tiffany" scores positive-for-Hong, not negative. Store as new **optional fields on `article_sources`** (`tone`, `toneConfidence`, `toneRationale`, `toneClassifiedAt`) — not a sibling table — so the read is a single indexed query with no join, and legacy rows stay valid (undefined until classified).
- `newsToneForRace` (public query): per candidate → counts of +/neutral/−, a net score, story count, and the linked headlines.

**Honesty baked in:**
- Show the +/neutral/− split **with the real headlines linked** — never a bare sentiment number.
- Low-confidence classifications are shown as neutral.
- **No outlet bias bands rendered** (respects the `outlets.thirdPartyRatings` schema constraint: "Data-ready for v2; NEVER rendered in v1").
- The reader can audit the classifier by clicking through — on brand for a source-linked site.

## Component 4 — the "no quotable score" rule (enforced, not hoped)

The blend result is expressed **only** as ordering + relative bar length. There is **no printed composite figure** anyone could screenshot as "Hong: 81." A persistent "This is not a prediction" frame stays on Act 3. The deliverable is the *movement* when weights change, never a number.

---

## Error handling / edge cases

- A signal with no data for the race → that witness renders "no data yet" and is **excluded from the blend**; remaining weights renormalize.
- Social/ads currently cover only the tracked slugs → candidates missing a signal get 0 share + a coverage caption (not a silent gap).
- Classifier failure/timeout → the article stays untoned (counts as neutral), error logged; the page still renders.
- All-zero field for a signal → `toShares` returns zeros, no divide-by-zero.

## Testing

- `src/lib/signals.test.ts`: `toShares` (sums to 1; all-zero; single candidate), `blend` (weight renormalization over available signals; a leader-flip fixture), `applyTurnoutTilt` (direction of tilt).
- `convex/newsTone.test.ts`: rubric fixture — real headlines with expected tone, including the "slams opponent" trap, asserting the classifier prompt contract against a mocked LLM.
- Existing `forecast.test.ts` reused unchanged.

## Styling / UX notes

- Reuse the site neo-brutalist system + dark-mode tokens already in `forecast-experience.tsx` (`bg-success`, `bg-destructive`, `shadow-brutal`).
- Act 2 share bars reuse the `Bars` component; news tone uses a stacked +/neutral/− bar.
- Act 3 re-order animation: bars transition on weight change (leverage existing `transition-[width]`).
- Nav link already live ("Forecast" / "Pronóstico").

## Out of scope / deferred decisions

- Whether v2 turns turnout into a rigorous model (needs crosstabs we don't have).
- v2 signals listed above.
- Any widebate-dark restyle (optional Task E, separate).
