---
target: /ads
total_score: 31
p0_count: 0
p1_count: 2
timestamp: 2026-07-22T12-20-55Z
slug: src-app-ads-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No "you are here" on a 12,819px, 8-section page |
| 2 | Match System / Real World | 4 | "Who's paying to reach you?", "ad money in your races" — plain civic language |
| 3 | User Control and Freedom | 3 | Browse is filterable/capped, but no way to jump between the 8 sections |
| 4 | Consistency and Standards | 4 | Neo-brutalist system applied consistently; detector clean |
| 5 | Error Prevention | 3 | "How to read this" callout prevents misreading sponsor≠endorsement |
| 6 | Recognition Rather Than Recall | 2 | 8 stacked sections, generic headers, dashed dividers — must remember what's where |
| 7 | Flexibility and Efficiency | 3 | Search + status + match filters on Browse; no cross-section jump |
| 8 | Aesthetic and Minimalist | 2 | ~160 cards on one page; default Browse cap renders far too many |
| 9 | Error Recovery | 3 | Read-only; empty state exists on Browse |
| 10 | Help and Documentation | 4 | Warning callout + Sources footer + methodology link explain provenance |
| **Total** | | **31/40** | **Good — strong material, real information-architecture problems** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** The neo-brutalist system reads as made, not generated.

**LLM assessment:** No slop tells — no gradient text, no cream-SaaS hero, no tracked eyebrow on every section, no ghost cards, no over-rounding. Cardinal red is rationed; neutrality holds (ad cards carry no partisan color-coding). The failure mode here isn't *fake polish*, it's *volume*: the page is maximal where it should be progressive.

**Deterministic scan:** `detect.mjs` over the ads page + 4 components returned **0 findings** (clean, exit 0). Agrees with the LLM read.

**Visual overlays:** Not injected — the detector was clean (nothing to overlay) and the target is the production URL with a strict CSP. Review done from full-page + section screenshots and computed-style sampling.

## Overall Impression

The content is genuinely strong and the components are on-brand — the TV-ads section especially. The problem is the **shape of the whole page**: 12,819px tall, 8 top-level sections, ~160 cards, with no wayfinding and a Browse list that dumps far too many cards before the user refines. A voter who wants "who's attacking my governor candidate" has to scroll a wall. The single biggest opportunity: **give the page a spine (section nav) and make the long tail earn its scroll.**

## What's Working

- **The Broadcast TV section.** The richest, best-composed unit on the page — sponsor + spend + "refers to" chips + who-is-this + source link. It reads as reporting, and it links every number to the FCC record. This is the template the rest could learn from.
- **The "How to read this" callout.** Framing sponsor-name ≠ endorsement up front is an honest, trust-building move that fits the Public-Record voice — exactly right for a nonpartisan tool.
- **Neutrality + restraint hold at scale.** Across 160 cards the palette never encodes a party, cardinal stays rare, and the brutalist grammar is consistent. That discipline is hard and it's intact.

## Priority Issues

- **[P1] The page is a 12,819px scroll with no spine.** Eight sections stacked with dashed `<hr>` dividers and generic headers ("Statewide detail", "Browse every ad") give a voter no map and no jump. The design system already ships a sticky `SectionNav` — this page is the poster child for it.
  - **Why it matters:** overwhelmed, mobile-first voters (the core audience) get lost and bounce; the personalized → statewide → raw narrative is invisible.
  - **Fix:** add the sticky `SectionNav` with the 6 real anchors (Your races · Race-by-race · TV ads · Statewide · Browse); add a "back to top"; tighten section intros.
  - **Suggested command:** `$impeccable layout`

- **[P1] The Browse default cap renders far too many cards.** Filters + a cap exist, but the default view dumps ~100+ identical cards, which is most of the 12.8k height. A card is the wrong affordance for "scan 500 ads."
  - **Why it matters:** slow first paint and infinite scroll on phones; scanning for one sponsor is painful.
  - **Fix:** drop the default cap to ~24 with an explicit "Load more" (or a search-first empty-until-typed state); consider a dense **table/row** layout for Browse instead of cards.
  - **Suggested command:** `$impeccable layout` (or `$impeccable distill`)

- **[P2] For-vs-against bars lean on red/green.** "Spending for & against each candidate" and the reach bars use red/green fills. The section title labels the semantics, but per-bar meaning still rides on hue.
  - **Why it matters:** fails "never rely on color alone" (colorblind users) and — for a neutrality-first civic tool — red/green sits uncomfortably close to partisan coding.
  - **Fix:** add a legend + a non-color cue (label/pattern/direction) per bar, and sanity-check the hue choice against the Neutrality Rule.
  - **Suggested command:** `$impeccable colorize` (or `$impeccable audit` for the a11y angle)

- **[P2] Section wayfinding & headers are weak.** "Statewide detail" and dashed dividers don't signal what changed or why the reader should care; in dark mode the sections blur into one dark column.
  - **Why it matters:** recognition-over-recall fails; the value ladder (my ballot → whole state → every ad) never lands.
  - **Fix:** name sections for their payoff, add a one-line orientation under each, and let the section nav carry structure.
  - **Suggested command:** `$impeccable clarify` (copy) + `$impeccable layout`

- **[P3] Four of six sections are card grids.** YourRaces, Race-by-race, TV, and Browse are all card grids; the repetition flattens hierarchy. The TV cards earn it (rich, differentiated); the Browse cards don't.
  - **Fix:** vary the affordance — keep rich cards for TV, switch Browse to a scannable table, and let "Your races" read as a compact personalized strip.
  - **Suggested command:** `$impeccable layout`

## Persona Red Flags

**Jordan (First-Timer / overwhelmed voter):** Lands on "Who's paying to reach you?", scrolls… and scrolls. No nav, no map, 8 sections that all look like dark cards. Doesn't realize "Ad money in your races" relates to *their* ballot vs. the statewide firehose below. Abandons somewhere in the Browse wall.

**Sam (Mobile / low-bandwidth voter — from PRODUCT.md's core audience):** 12,819px and ~160 shadowed cards on a phone = a heavy DOM, slow paint, and thumb-fatigue. The one number they wanted was 9,000px down.

**Riley (Time-pressed skeptic):** Wants to verify one claim ("is this PAC really pro-Steil?"). The TV section serves them perfectly (source link, who-is-this) — but to *find* it they scroll past two other sections with no jump. Great payoff, buried entrance.

## Minor Observations

- Dark mode is the default render; the wall-of-dark-cards effect amplifies the sameness — worth checking how the page reads in light.
- "Statewide detail" and "Browse every ad" as headers under-sell strong content; rename for the payoff.
- The hero + yellow callout stack is good but tall; a first-timer could use a one-line "this page goes from your ballot → the whole state."

## Questions to Consider

- What if the page opened at "your races" and everything statewide lived one tap away, instead of stacked below?
- Does "Browse every ad" need to render as cards at all — or is it a table pretending to be a gallery?
- What would the *confident* version of this page look like — could the whole thing be three tabs (Your ballot · Statewide · Browse) instead of an endless scroll?
