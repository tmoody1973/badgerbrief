---
target: src/app/ads/page.tsx
total_score: 31
p0_count: 0
p1_count: 1
timestamp: 2026-07-22T13-06-22Z
slug: src-app-ads-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active tab clear (cardinal + aria-current); honest "150 of 1,096" cap; no in-page position cue on the 4,482px Statewide scroll |
| 2 | Match System / Real World | 3 | Plain civic voice, human money ($1.5M); "outside money / attribution / reach per dollar" lean on the notes to stay clear |
| 3 | User Control and Freedom | 3 | URL-addressable, shareable, back-native tabs; Browse filters reset to All; no in-page jump on long Statewide |
| 4 | Consistency and Standards | 3 | Split for/against encoding currently LIVE (analytics = lake/cardinal, race cards = green/red); two StatTile variants on one page |
| 5 | Error Prevention | 3 | Read-only surface; disclaimer preempts the "sponsor = backer" misread; forgiving search/filters |
| 6 | Recognition Rather Than Recall | 3 | Text-labeled tabs/filters/columns, visible sort arrows; long Statewide asks you to remember where things are |
| 7 | Flexibility and Efficiency | 3 | Real accelerators (search, sort, 3 filters, deep-link tabs); no keyboard shortcuts, no collapsible preamble, no section jump |
| 8 | Aesthetic and Minimalist | 3 | Per-tab focus is clean; Statewide does three jobs in one 4,482px column |
| 9 | Error Recovery | 3 | Thoughtful plain-language empty states across all three tabs |
| 10 | Help and Documentation | 4 | "How to read this" box + per-chart methodology notes + source links — genuinely excellent contextual help |
| **Total** | | **31/40** | **Good** |

## Anti-Patterns Verdict

**Does it look AI-generated? No.** The neo-brutalist system reads as *made*: hard 2px borders, offset block shadows, mono "stamp" labels, rationed cardinal. None of the slop tells (cream-hero, gradient text, per-section eyebrow, identical card grids) are present. The one templated-adjacent element — the 3-stat hero row — is defensible because it carries real civic data (total / outside / most-attacked), not vanity metrics, with no gradient.

**Deterministic scan:** `detect.mjs` on `src/app/ads/page.tsx` = **clean (0)**. On `src/components/guide/` = 1 finding (`candidate-photo.tsx:11` broken-image) which is a **false positive** — the component guards `if (!photoUrl || errored) return null` and hides on error, so it never ships an empty src; and it isn't on `/ads`.

**Visual overlays:** not injected on live prod; Assessment B used direct full-page screenshots of all three live tabs plus the source-level CLI detector.

## Overall Impression

The tab restructure worked. The old 12,819px firehose is now three focused, shareable, URL-addressable views, and the design system carries real editorial authority. The single biggest opportunity is the **Statewide tab**: it's still a 4,482px column doing three jobs (race-card overview + broadcast-TV tracker + aggregate analytics) with no way to jump between them, and the ~470px masthead+disclaimer preamble re-scrolls above the tabs on every view.

## What's Working

1. **Trust scaffolding is best-in-class.** The amber "How to read this" box + per-chart "Figures are estimates…" notes + source links deliver PRODUCT.md's "sourced or it doesn't ship" without patronizing. Contrast passes both themes (6.6:1 dark / 9.9:1 light).
2. **Plain-language civic voice.** "Who's paying to reach you?", human money formatting, honest caps ("150 of 1,096", "estimated (range midpoints)").
3. **Browse is a genuine power tool.** Search + status + attribution filters + sortable table, with a transparent truncation message.

## Priority Issues

- **[P1] Split for/against color encoding is live right now.** On Statewide, the analytics chart uses lake/cardinal (Task 1, deployed) while the race cards still use green/red (Task 2, committed but not yet deployed) — the same support/attack semantic in two color languages on one screen. **Fix:** deploy the pending Task 2 commit; both then read lake (for) / cardinal (against). Also closes the colorblind-safety gap on the race cards. *Command: (deploy) — already fixed in code.*
- **[P2] Statewide is a 4,482px triple-duty scroll with no in-page nav.** Race overview, TV tracker, and 3 analytics charts stack with no way to jump. **Fix:** add the sticky `SectionNav` pattern already used on race/brief pages (By race · Broadcast TV · The numbers), or split TV/analytics into their own tab. *Command: $impeccable layout.*
- **[P2] The ~470px masthead + intro + amber disclaimer repeat above the tab bar on every tab and every visit.** A returning user re-scrolls the same preamble to reach any tab; the disclaimer isn't condensable. **Fix:** lift the tab bar directly under the H1, and condense the disclaimer to a one-line note with a "why" expander after first view. *Command: $impeccable layout.*
- **[P3] Two StatTile variants on one page.** Overview tiles are mono/value-on-top; analytics tiles are display/label-on-top. **Fix:** unify to one tile. *Command: $impeccable polish.*
- **[P3] "Your ballot" duplicates Statewide's grid when unauthenticated.** It correctly shows statewide offices (on every WI ballot) but visually reads as a copy, and the difference isn't explained. **Fix:** one-line note — "Statewide offices are on every Wisconsin ballot; district races appear when you set your address." *Command: $impeccable clarify.*

## Persona Red Flags

**Alex (power user, data-heavy):** ~470px preamble re-scrolled on every tab; no keyboard shortcuts; no deep-link to a specific chart within the 4,482px Statewide scroll. Sortable Browse table is the one place he's well served.

**Sam (a11y / screen reader + low vision):** Tasks 1+2 remove the color-only meaning (was red/green support/attack). Residual: the **dark-mode "Attack" badge is 3.94:1** (white on brightened cardinal) for 10px bold text — below the 4.5:1 AA floor for small text (it was 3.34:1 before, so an improvement, and it matches the site-wide `bg-primary` chip convention). This is a token-level question, not a one-off. Tabs use `aria-current`; cardinal focus ring present; disclaimer contrast passes.

**Casey (mobile civic voter, one-handed):** Cards collapse to 1-col and the tab bar is sticky (good), but Statewide is a very long thumb-scroll; a section jump would help most on mobile.

## Minor Observations

- The for/against legend lists "Supports" then "Attacks" while the bars run attacks-left / supports-right — legend order doesn't mirror the visual axis.
- "Most reach per dollar" is a sharp metric but the densest to parse; its note does the heavy lifting.

## Questions to Consider

- What if the tab bar sat directly under the H1, with the disclaimer as a one-line note that expands? The preamble would stop taxing every visit.
- Does Statewide need to hold all three jobs, or is "The numbers behind it" its own tab?
- What would make "Your ballot" unmistakably *yours* the moment an address is set?
