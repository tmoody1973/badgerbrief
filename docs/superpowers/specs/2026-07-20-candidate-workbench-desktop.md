# Candidate page — Workbench desktop layout (2026-07-20)

## Problem

Measured on prod at 1440×900:

- Prose runs **92ch** (bio) and **107ch** (position summaries, quotes). Comfortable measure is 45–75ch.
- The `max-w-3xl` (768px) column uses **53% of a 1440 viewport** — 47% is dead space.
- The page is a uniform vertical stack: every section is a full-width card at identical rhythm.

The column is simultaneously **too wide to read** and **too narrow for the screen**. Stretching it makes reading worse; leaving it wastes the display. The fix is to split the horizontal axis rather than trade one failure for the other.

## Design (Hallmark macrostructure: **Workbench** — main column + reference rail)

### 1. Grid

At `lg` and up, the page becomes a 12-column grid inside `max-w-6xl` (1152px):

- **Main column** — `lg:col-span-8` (~740px): bio, positions, quotes, funding detail, sources
- **Reference rail** — `lg:col-span-4` (~350px): at-a-glance finance summary, priorities, endorsements

Below `lg` the grid collapses to a single column and mobile is **unchanged in every respect** — it was tuned in MOO-330 and must not regress.

### 2. Measure discipline

Prose blocks get an explicit `max-w-[65ch]` and no longer inherit container width. This applies to the bio paragraph, position summaries, and quote text. Cards, tables, and stat rows keep full column width — they are not prose and don't want a measure cap.

This is the load-bearing change: it is what makes widening the container safe.

### 3. Rail contents (reference, not substance)

The rail carries "at a glance" facts that today interrupt the reading flow:

- **Finance summary only** — raised / spent / cash on hand / debts. The detailed contributor and PAC tables stay in the main column: a rail taller than the viewport cannot stick, and those tables are ~500px on their own.
- **Priorities** (campaign's own claims)
- **Endorsements**

Rail is `lg:sticky lg:top-20 lg:self-start` — `top-20` clears the sticky `SectionNav` (~50px) with margin.

`FinancePanel` splits into two exported components:
- `FinanceSummary` — the totals tiles, stacked vertically for a narrow rail
- `FinanceDetail` — contributors + PAC donors + funding traces, stays in main flow under `#money`

### 4. Positions two-up

At `xl`, position cards go 2-up inside the main column (~350px each ≈ 52ch per card — still inside measure). At `lg` and below they stay 1-up.

### 5. Unchanged

Mobile layout and ordering, the jump nav and all its chips, every fold from MOO-330, the palette, the type stack, the brutalist shadow language, all data fetching, the race page, and every other route.

## Acceptance

- Prose measure **45–75ch** at 1440 (from 92/107)
- Content width ≥ 1100px at 1440 (from 768) — viewport waste under 25% (from 47%)
- Desktop scroll at 1280 **≤ 3.2 screens** (from 4.10)
- **Mobile at 390 unchanged: 4.95 screens, no horizontal scroll** — hard requirement, this is a regression gate not a target
- No horizontal scroll at 320 / 390 / 768 / 1024 / 1440
- Rail sticks without overlapping the nav; does not exceed viewport height at 1440
- All content still in the DOM; positions/quotes/contributor counts unchanged
- Race page untouched; full suite + tsc + build green

## Out of scope

Home, /vote, /compare, /brief. Rail on the race page. Any data or copy change. Motion — this stays a motion-cut project.
