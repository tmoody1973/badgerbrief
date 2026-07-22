# Handoff — `/ads` analytics a11y (colorize) + open follow-ups

**Written:** 2026-07-22 · **Context:** picks up after the MOO-318 ad-tracker work + the `$impeccable` critique/shape/craft of `/ads`.

## Where things stand (done)

- **MOO-318 broadcast-TV ad tracker** shipped end-to-end (FCC political files via Browserbase → mupdf portfolio unwrap → Sonnet extract → human-reviewed `ads` rows). Stored order PDFs in Convex, NAB-disclosure extraction ("who each ad is about"), reviewer-assisted **sponsor profiles** (OpenFEC + Perplexity), one-click race attribution from disclosure, and "Confirm as issue ad." See [[badgerbrief-moo318-tv-spec]] memory for the full landmine list.
- **Impeccable set up:** `PRODUCT.md` (register `product`, trustworthy·clear·neutral, WCAG 2.2 AA) and `DESIGN.md` ("The Public Record" neo-brutalist system) are at the repo root. **Read both before UI work.**
- **`/ads` restructured** into three URL-addressable tabs (`?view=your-ballot|statewide|browse`), server-rendered. Default view height 12,819px → 4,482px. Browse is now a dense sortable table. Critique snapshot saved at `.impeccable/critique/2026-07-22T12-20-55Z__src-app-ads-page-tsx.md` (31/40; the P1s are now fixed, the P2 below is not).

---

## Task 1 (primary): analytics color — a11y + neutrality refinement

**Command to run:** `$impeccable colorize src/components/guide/ads-analytics.tsx` (read `DESIGN.md` first; the register reference is `product`).

**File:** `src/components/guide/ads-analytics.tsx`

**Accurate framing — this is NOT "it's broken", it's a palette upgrade.** The `ForAgainstChart` (spending for/against each candidate) is already accessible *by structure*:
- Polarity is encoded by **side** (attacks grow left, support grows right from a shared center) — not color alone.
- It has a **legend** (lines ~150–154) and **per-side dollar labels** (lines ~170, ~188).

So it passes "don't rely on color alone." The remaining problems are two:

1. **Colorblind pair.** It uses `bg-destructive` (red) for attacks and `bg-success` (green) for support (lines ~175, ~182). Red/green is the single worst pair for the most common colorblindness (deuteranopia/protanopia). Even with side + labels, swap to a colorblind-safe **diverging pair**.
2. **Neutrality (PRODUCT.md "Neutrality by construction").** Red/green in a political chart reads adjacent to partisan coding. Pick a diverging pair from the brand that carries **no partisan signal** — e.g. **lake `--accent` (support) vs cardinal `--primary` (against)**, or a neutral **amber/teal**. Update the two legend swatches to match whatever you choose. (Note: cardinal on one side is fine here because it's rationed to a single semantic role, not decoration.)

**Also while in the file (minor, same pass):**
- Bars use `rounded-l-[3px]` / `rounded-r-[3px]` and `rounded-r-[3px]` — **DESIGN.md is zero-radius.** Drop to no radius for system consistency (lines ~175, ~182, ~233).
- **`BarList`** ("Top spenders", "Most reach per dollar") fills every bar with `bg-primary` (cardinal) (line ~233). That violates DESIGN.md's **One Voice Rule** (cardinal ≤10% of a screen) — a stack of 10 cardinal bars is a lot of red. Consider a neutral bar fill (charcoal/`--muted-foreground` or `--accent`) and reserve cardinal for emphasis.

**Acceptance:**
- No red/green diverging encoding anywhere in the file; legend swatches match the new colors.
- Bars are zero-radius; BarList no longer floods the screen with cardinal.
- Verify contrast ≥3:1 for the bar fills against `--card`/`--background` in **both** light and dark themes (the page defaults to dark).
- Re-inspect live in browser (the analytics live under the **Statewide** tab: `/ads` → scroll to "The numbers behind it"). Confirm the for/against chart still reads clearly and neutrally.

---

## Task 2 (optional): the Statewide 3-stat hero row

`src/components/guide/ads-overview.tsx` renders a 3-tile row ($1.5M total · $392k outside · most-attacked candidate). It's borderline the impeccable "hero-metric template" anti-pattern — but it's **real civic data**, not fabricated, so it's defensible. Left as-is intentionally. Only revisit if a `$impeccable critique`/`polish` of `/ads?view=statewide` flags it; if so, `$impeccable distill` or `layout` on that component.

## Task 3 (optional): re-critique `/ads`

The saved critique snapshot (31/40) predates the tab restructure. A fresh `$impeccable critique src/app/ads/page.tsx` would re-score the now-fixed wayfinding/length P1s higher and leave the analytics-color P2 as the main open item — useful to confirm the backlog is really down to Task 1.

---

## Broader MOO-318 tuning (separate track, not UI)

Carried from the build; none block shipping (all TV rows are human-gated, idempotent daily cron accumulates):

1. **TV download throughput is low** — many Browserbase `waitForEvent("download")` calls time out; each station-run pulls ~3–12 docs. Cron fans out per-station (`syncTvAdsDispatch`, 12/station/day) so it accumulates over days. Tuning path: diagnose why the download event misses (inline-served portfolios? rapid-nav races?) and raise per-run yield. Files: `convex/adsTv.ts` `downloadDocs`.
2. **Extraction quirks** (reviewer absorbs these, but worth tuning the prompt): occasionally swaps office↔issue (e.g. put "Wisconsin's 1st Congressional District" in `nationalIssue`) and name variants ("Bryan" vs "Brian" Steil). File: `convex/tvExtractAgent.ts` PROMPT.
3. **1 disclosure backfill holdout** (`34824e81-…#0`, Alliance) persistently fails re-fetch; it has the `files.fcc.gov` fallback link. Retry: `npx convex run adsTv:backfillTvDisclosure --prod`.
4. **`ads.issueTopic`** field exists + `publishTvIssueAd` mutation + admin "Confirm as issue ad" button are shipped; a dedicated public "issue ads / outside spending" surface beyond the `/ads` TV tracker was discussed but not built.

---

## How to resume cleanly

1. `git log --oneline -15` — recent commits are all `(MOO-318)`; latest is the `/ads` tab restructure (`57c5f74`).
2. Read `PRODUCT.md` + `DESIGN.md` (design contract) and the memory `badgerbrief-moo318-tv-spec`.
3. For Task 1: `$impeccable colorize src/components/guide/ads-analytics.tsx`.
4. Deploy order for any change: `npx convex deploy -y` (if backend) → `npx next build` → `npx vercel deploy --prod --yes`. `/ads` is public — inspect live at `badgerbrief.vercel.app/ads?view=statewide`.
5. Keep the neo-brutalist rules: semantic tokens only (`bg-card`, `border-border`, `shadow-[var(--shadow-brutal)]`), no hex, no `dark:` classes, zero radius on cards/bars.
