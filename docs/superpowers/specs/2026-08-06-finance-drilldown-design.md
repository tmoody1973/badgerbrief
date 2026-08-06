# Campaign Finance Breakdowns & Donor Drill-Down — Design

**Date:** 2026-08-06 · **Target:** ship before the Aug 11 primary
**Scope:** state (Sunshine) races only. Federal (OpenFEC) races keep today's UI.

## Goal

Voters see a raw "$1.1M raised" number today and have no way to know what it
means. Add a curated interpretation layer to the money sections: who funds each
candidate (funding mix), grassroots vs. major donors, in-state vs. out, and
monthly momentum — with a tap-through drill-down from each funding-mix category
to its top named donors and PACs. No full transaction explorer (decided:
voter-first, curated).

## Data model

New Convex table, one doc per candidate per source, upserted at import time
(same lifecycle as `finance_totals`):

```ts
finance_breakdowns: defineTable({
  candidateSlug: v.string(),
  raceId: v.string(),
  source: v.union(v.literal("sunshine"), v.literal("openfec")),
  coverageEndDate: v.optional(v.string()),
  fetchedAt: v.number(),
  categories: v.array(v.object({
    key: v.string(), // individuals | party | union | pac | business | other
    amount: v.number(),
    count: v.number(),
    topDonors: v.array(v.object({
      name: v.string(),
      amount: v.number(),
      location: v.optional(v.string()),
    })), // top 10, donor-aggregated — the drill-down payload
  })),
  sizeBuckets: v.array(v.object({
    key: v.string(), // small (<$200) | mid ($200–999) | large (>=$1,000)
    amount: v.number(),
    count: v.number(), // count = donors, not transactions
  })),
  geo: v.object({
    inState: v.object({ amount: v.number(), count: v.number() }),
    outOfState: v.object({ amount: v.number(), count: v.number() }),
    unknown: v.object({ amount: v.number(), count: v.number() }),
  }),
  monthly: v.array(v.object({ month: v.string(), receipts: v.number() })), // "2026-07"
  takeaways: v.array(v.string()),
}).index("by_candidate", ["raceId", "candidateSlug"]),
```

Notes:
- Every `count` field in this table means **distinct donors** (by contributor
  name), never transactions.
- `sizeBuckets` bucket by each donor's **aggregated cycle total** (individuals
  only), not per transaction.
- `geo` covers individuals + businesses; committees excluded (their state is
  where they're registered, not where the money originates).
- `takeaways` are precomputed so the UI stays dumb and the strings are
  inspectable in the DB.

## Pipeline

1. **`scripts/fetch-sunshine.mjs`** — add a `Contributor State` column
   (`from_entity.entityContactProfiles[0].state`, already in the API response).
2. **`scripts/pac-tags.json`** (new) — explicit committee-name → tag map:
   `party | union | business-assoc | ideological`. Seed with the ~20 largest
   committee donors in the current data (Republican Party of Wisconsin,
   WEAC PAC, Wisconsin Pipe Trades Association PAC Fund, Operating Engineers
   Local 139 PAC, Democratic Party of Wisconsin, …). Untagged `Registrant`
   rows stay category `pac` ("PACs & committees"). Tags are curated, never
   keyword-guessed — same philosophy as `sunshine-committees.json`.
3. **`scripts/lib/breakdowns.mjs`** (new, pure, unit-tested) — CSV rows +
   pac-tags → the breakdown doc shape. Category assignment:
   `Individual` → individuals; `Registrant` → pac-tags lookup else `pac`;
   `Business` → business; `Anonymous`/`Unregistered`/`Depository` → other.
   Reuses the cycle filter semantics of `lib/sunshine.mjs` (drop rows whose
   ballot-event tag lacks "2026"; keep untagged).
4. **`scripts/import-sunshine-breakdowns.mjs`** (new) — reads the same CSV as
   the other importers plus pac-tags.json, computes docs via the lib, calls a
   new `finance:upsertBreakdown` internal mutation (upsert keyed on
   raceId + candidateSlug + source, like `upsertTotals`). Prints each
   candidate's takeaway sentences to the console at import time for editorial
   eyeballing before they're live.
5. **Takeaway templates** — 4–5 deterministic threshold templates, no AI.
   Only render when a threshold clearly trips, e.g.:
   - party ≥ 40%: "Over {pct}% of {name}'s money came from party committees."
   - union ≥ 25%: "About {pct}% of {name}'s money came from union PACs."
   - small-donor share ≥ 40%: "{count} donors gave under $200 — {pct}% of the total."
   - out-of-state ≥ 40%: "{pct}% of {name}'s individual donations came from outside Wisconsin."
   All sentences describe the covered window only (coverage label shown with
   the visuals).

**Cadence:** one extra command in the existing per-filing-deadline import run.
No cron, no runtime computation, no new external calls at request time.

## UI

New file `src/components/guide/financeBreakdown.tsx` (finance.tsx is ~400
lines; keep both focused). Pure HTML/CSS in the existing neo-brutalist style —
no chart library. Load the `dataviz` skill before writing bar markup.

Rendered inside the candidate money section, after the stat tiles:

1. **"What it means" callout** — takeaway sentences in the `bg-warning`
   bordered-box style (like the race page's "Who's paying" box). No
   takeaways → no box.
2. **Funding mix bar** — one horizontal stacked bar; each segment a `<button>`
   sized by percentage, labeled with its %. Tap → panel below the bar with
   category total, donor count, top-10 donors (existing donor-row styling).
   One panel open at a time. `sr-only` table with category/percent/amount for
   screen readers. Segments < 1% of total collapse into `other` (drill-down
   preserved).
3. **Small-vs-big + in-state-vs-out** — two compact stat tiles in the existing
   tile grid ("62% from donations under $200 (4,318 donors)" / "81% from
   Wisconsin"), each a `<details>` expanding to full bucket detail.
4. **Momentum** — small monthly bar row (CSS heights), current month
   highlighted, `sr-only` month/amount table, caption "Monthly fundraising."

**Race page:** the "Who has raised the most money?" table gains a
"Where it's from" column — mini non-interactive stacked mix bar per candidate,
shared legend above the table, same colors. Drill-down lives only on the
candidate section.

**Plumbing:** race/candidate queries in `convex/public.ts` gain a
`finance_breakdowns` lookup beside the existing `finance_totals` one.
Components take the doc as an optional prop and **render nothing when
absent** — federal races, Strnad, and any candidate without an imported
breakdown degrade to exactly today's UI. Coverage label renders once under the
block, as today.

## Edge cases & invariants

- Category colors exported as one shared constant; candidate and race views
  cannot drift.
- Percentages computed from the breakdown doc's own totals (not
  `finance_totals.receipts`), so bars always sum to 100% even if the two
  tables were imported at different times.
- Percentage-based bars render fine for tiny totals (Schoemann's $7k); the
  absolute number is adjacent in the stat tile.
- Known data caveats carry over from the totals work (documented in
  `fetch-sunshine.mjs`): Crowley's Jul–Dec 2025 is not itemized upstream;
  72-hour-report rows may need a dedupe check after the next periodic filing.
  Breakdowns inherit whatever window the import used (currently
  Jan 1 – Aug 3, 2026).

## Testing

- `scripts/lib/breakdowns` vitest suite with golden numbers from the real
  Aug 3 CSV: Crowley/Hong category totals, Tiffany party share (~76%), size
  buckets (donor aggregation across multiple gifts), geo split, monthly sums,
  pac-tags fallback to `pac`, cycle filter.
- Takeaway templates: threshold boundary tests (39% vs 40%).
- Component render tests for the two silent-lie risks only: segments sum to
  100%; absent doc renders nothing.
- Manual gate: import prints takeaways; editor eyeballs before pages
  revalidate (ISR 300s).

## Out of scope

Full searchable transaction explorer · federal (OpenFEC) breakdowns ·
AI-generated narrative · keyword-based PAC classification · ad-spend
integration (exists separately as `adMoney`/`ads`).
