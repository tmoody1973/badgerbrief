---
target: src/app/ads/page.tsx
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-07-22T13-56-30Z
slug: src-app-ads-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active tab (aria-current) + honest "150 of 1,096"; jump nav aids wayfinding but has no scroll-spy active state |
| 2 | Match System / Real World | 3 | Plain civic voice, human money; "outside money / reach per dollar / attribution" still lean on the notes |
| 3 | User Control and Freedom | 3 | URL-addressable tabs + in-page jumps; Browse filters reset to All; no undo (read-only surface) |
| 4 | Consistency and Standards | 4 | For/against is one lake/cardinal language everywhere; StatTile unified; chip + dark-ink foreground tokens consistent |
| 5 | Error Prevention | 3 | Read-only; disclaimer preempts the "sponsor = backer" misread |
| 6 | Recognition Rather Than Recall | 3 | Tabs + sticky jump chips + labeled filters/columns; jump nav can't show the current section |
| 7 | Flexibility and Efficiency | 3 | Deep-link tabs, sticky jumps, search/sort/multi-filter; no keyboard shortcuts, scroll resets per tab nav |
| 8 | Aesthetic and Minimalist | 3 | Statewide still ~4,500px / triple-duty — now navigable via jump nav, but dense; minor eyebrow redundancy |
| 9 | Error Recovery | 3 | Thoughtful plain-language empty states across all tabs |
| 10 | Help and Documentation | 4 | Condensed "How to read this" + per-chart notes + source links + the new "Your ballot" clarifier |
| **Total** | | **32/40** | **Good** |

## Anti-Patterns Verdict

**Does it look AI-generated? No.** Neo-brutalist system with real editorial spine — hard borders, offset block shadows, mono stamps, rationed cardinal. No slop tells. The 3-stat hero row remains defensible (real civic data, no gradient).

**Deterministic scan:** `detect.mjs` on `src/app/ads/page.tsx` = **clean (0)**. Guide dir = 1 finding (`candidate-photo.tsx:11`), the known **false positive** (guarded `return null`, hides on error, not on `/ads`). No new slop introduced by this milestone's changes.

**Visual pass:** live prod inspected across all three tabs; sticky-nav stacking, dark-ink chip contrast, and jump-to anchoring verified programmatically (contrast 4.66:1; heading lands clear of both bars).

## Overall Impression

The backlog paid off. Every P1/P2 from the last run is resolved: the split for/against encoding is unified, the a11y color + contrast gaps are closed, the long Statewide scroll is navigable, the preamble is condensed, and the stat tiles are one component. What remains is genuinely polish — the score moved modestly (31 → 32) because the wins landed in heuristics already scored "3," but the **issue severity dropped from P1/P2 to P3-only**.

## What's Working

1. **Consistency is now a strength, not a drag.** One for/against color language (lake = for, cardinal = against) across analytics, race cards, and candidate badges; a single shared StatTile; dark-ink foreground consistent with the accent convention.
2. **Accessibility is deliberate.** Colorblind-safe stance encoding (side + legend + label + non-red/green hues), AA chip contrast in dark mode (4.66:1), `aria-current` tabs, cardinal focus ring, disclaimer contrast 6.6/9.9:1.
3. **The long page is navigable.** Tabs lifted under the H1 + condensed disclaimer cut the preamble; the sticky jump nav pins below the tab bar so the three Statewide sections stay one tap away.

## Priority Issues (all P3 — polish)

- **[P3] Triple-labeled "by race" section.** The mono eyebrow "EVERY TRACKED AD REACHING WISCONSIN, RACE BY RACE" + the "By race" jump chip + the "Ad money, race by race" h2 all label the same block. **Fix:** drop the mono eyebrow; the h2 + chip carry it. *→ $impeccable distill.*
- **[P3] Jump nav has no active-section state (no scroll-spy).** The chips jump but never show which section you're in on the long scroll. **Fix:** highlight the active chip on scroll (IntersectionObserver) — the shared SectionNav is "no scroll-spy in v1" too, so this could land in both. *→ $impeccable polish.*
- **[P3] Statewide remains ~4,500px triple-duty.** Now navigable, so structural splitting is optional; only revisit if analytics/TV grow. *→ $impeccable layout (only if it grows).*
- **[P3] For/against legend order** ("Supports" then "Attacks") doesn't mirror the visual axis (attacks render left). **Fix:** swap legend order, or flip the bars. *→ $impeccable polish.*
- **[P3] "Your ballot" echoes Statewide's grid.** Now explained by the new note, but the two grids still look near-identical when districts resolve. *→ acceptable; revisit only if it confuses testers.*

## Persona Red Flags

**Sam (a11y):** Materially improved — stance meaning no longer rides on color alone, chip contrast passes AA in dark mode, tabs announce `aria-current`. Residual: the jump nav is anchor-only (no active state announced), a minor recognition gap, not a blocker.

**Alex (power user):** Sticky jump nav + deep-link tabs are real accelerators now. Still no keyboard shortcuts, and tab navigation resets scroll (full page load per view).

**Casey (mobile):** Biggest winner — condensed preamble + sticky jump nav make the long tab thumb-friendly. Edge: the ponytail `top-14` assumes the 3 tab chips stay on one row (true ≥360px; they'd wrap on a very narrow phone and the jump nav would overlap).

## Minor Observations

- The header "AUG 11" pill and active tab now use dark ink on the dark-mode cardinal — crisper than the old white, and consistent with the lake/accent pairing.
- "Most reach per dollar" is still the densest chart to parse; its note does the work.

## Questions to Consider

- Is the mono eyebrow above the stat row still earning its place next to the jump chip and the h2?
- Worth adding scroll-spy to the shared SectionNav so both /ads and the race/candidate pages get an active-section state in one change?
